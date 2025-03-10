/**
 * 双因素认证服务
 * 集成Google Authenticator实现高安全性的CDK兑换验证
 */

const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const config = require('../../config');
const logger = require('../../utils/logger');
const encryptionUtils = require('../../utils/encryption');
const Redis = require('ioredis');

// 创建Redis客户端连接
let redisClient = null;

// 获取或创建Redis客户端
function getRedisClient() {
  if (!redisClient) {
    try {
      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        // 启用TLS如果在生产环境
        ...(process.env.NODE_ENV === 'production' && process.env.REDIS_TLS === 'true' 
          ? { tls: { rejectUnauthorized: false } } 
          : {}),
        // 自动重连设置
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3
      });
      
      // 监听连接事件
      redisClient.on('connect', () => {
        logger.info('成功连接到Redis服务器');
      });
      
      // 监听错误事件
      redisClient.on('error', (err) => {
        logger.error('Redis连接错误', { error: err.message });
        // 在生产环境中，如果Redis不可用，应该有一个备用存储方案
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('使用内存存储作为备用，仅用于开发环境');
        }
      });
    } catch (err) {
      logger.error('创建Redis客户端失败', { error: err.message });
      if (process.env.NODE_ENV !== 'production') {
        logger.warn('使用内存存储作为备用，仅用于开发环境');
      }
    }
  }
  
  return redisClient;
}

// 备用内存存储，仅用于开发环境或Redis不可用时
const memoryStore = new Map();

/**
 * 保存临时密钥到存储
 * @param {string} token - 临时令牌
 * @param {Object} data - 要存储的数据
 * @param {number} ttl - 过期时间（秒）
 * @returns {Promise<boolean>} 存储成功标志
 */
async function saveToStore(token, data, ttl = 1800) {
  const client = getRedisClient();
  
  try {
    if (client && client.status === 'ready') {
      // 使用Redis存储
      await client.setex(
        `2fa:temp:${token}`, 
        ttl, 
        JSON.stringify(data)
      );
    } else {
      // 备用内存存储
      memoryStore.set(token, {
        data,
        expires: Date.now() + (ttl * 1000)
      });
      // 设置过期清理
      setTimeout(() => memoryStore.delete(token), ttl * 1000);
    }
    return true;
  } catch (err) {
    logger.error('保存临时密钥失败', { error: err.message });
    // 再次尝试使用内存存储
    memoryStore.set(token, {
      data,
      expires: Date.now() + (ttl * 1000)
    });
    // 设置过期清理
    setTimeout(() => memoryStore.delete(token), ttl * 1000);
    return true;
  }
}

/**
 * 从存储中获取数据
 * @param {string} token - 临时令牌
 * @returns {Promise<Object|null>} 存储的数据或null
 */
async function getFromStore(token) {
  const client = getRedisClient();
  
  try {
    if (client && client.status === 'ready') {
      // 从Redis获取
      const data = await client.get(`2fa:temp:${token}`);
      if (data) {
        return JSON.parse(data);
      }
    } else {
      // 从备用内存获取
      const item = memoryStore.get(token);
      if (item && item.expires > Date.now()) {
        return item.data;
      }
    }
    return null;
  } catch (err) {
    logger.error('获取临时密钥失败', { error: err.message });
    // 尝试从备用内存获取
    const item = memoryStore.get(token);
    if (item && item.expires > Date.now()) {
      return item.data;
    }
    return null;
  }
}

/**
 * 从存储中删除数据
 * @param {string} token - 临时令牌
 * @returns {Promise<boolean>} 删除成功标志
 */
async function removeFromStore(token) {
  const client = getRedisClient();
  
  try {
    if (client && client.status === 'ready') {
      // 从Redis删除
      await client.del(`2fa:temp:${token}`);
    }
    // 无论Redis是否可用，都从内存中删除
    memoryStore.delete(token);
    return true;
  } catch (err) {
    logger.error('删除临时密钥失败', { error: err.message });
    // 仍然从内存中删除
    memoryStore.delete(token);
    return false;
  }
}

/**
 * 为用户生成2FA秘钥
 * @param {string} userId - 用户ID
 * @param {string} username - 用户名，用于QR码标签
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 包含秘钥和QR码URL的对象
 */
async function generateTwoFactorSecret(userId, username, options = {}) {
  try {
    // 应用名称
    const appName = options.appName || config.appName || '跃升之路';
    
    // 生成一个新的秘钥
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `${appName}:${username}`,
      issuer: appName,
      encoding: 'base32'
    });
    
    // 生成QR码
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    
    // 生成安全的临时令牌
    const tempToken = encryptionUtils.generateSecureToken(32);
    
    // 存储秘钥（30分钟过期）
    const secretData = {
      userId,
      secret: secret.base32,
      createdAt: Date.now()
    };
    
    await saveToStore(tempToken, secretData, 30 * 60);
    
    // 记录操作日志
    logger.info('生成2FA密钥', {
      userId,
      tempTokenPrefix: tempToken.substring(0, 8) + '...',
      createdAt: new Date().toISOString()
    });
    
    return {
      tempToken,
      secretKey: secret.base32,
      qrCodeUrl
    };
  } catch (error) {
    logger.error('生成2FA秘钥失败', { error: error.message, userId });
    throw new Error('无法生成双因素认证秘钥: ' + error.message);
  }
}

/**
 * 验证并激活2FA
 * @param {string} userId - 用户ID
 * @param {string} tempToken - 临时令牌
 * @param {string} verificationCode - 用户输入的验证码
 * @returns {Promise<Object>} 包含秘钥的对象
 */
async function verifyAndActivateTwoFactor(userId, tempToken, verificationCode) {
  try {
    // 验证参数
    if (!tempToken || !verificationCode) {
      throw new Error('缺少必要参数');
    }
    
    // 验证码必须是数字
    if (!/^\d{6}$/.test(verificationCode)) {
      throw new Error('验证码格式无效，应为6位数字');
    }
    
    // 从存储获取数据
    const secretData = await getFromStore(tempToken);
    
    // 检查数据是否存在
    if (!secretData) {
      throw new Error('设置会话已过期，请重新开始设置流程');
    }
    
    // 验证用户ID是否匹配
    if (secretData.userId !== userId) {
      // 记录安全威胁
      logger.warn('2FA验证过程中检测到用户ID不匹配', {
        expectedUserId: secretData.userId,
        actualUserId: userId,
        tempTokenPrefix: tempToken.substring(0, 8) + '...'
      });
      
      throw new Error('用户身份验证失败');
    }
    
    // 检查会话是否过期（30分钟）
    if (Date.now() - secretData.createdAt > 30 * 60 * 1000) {
      await removeFromStore(tempToken);
      throw new Error('设置会话已过期，请重新开始设置流程');
    }
    
    // 验证用户输入的验证码
    const verified = speakeasy.totp.verify({
      secret: secretData.secret,
      encoding: 'base32',
      token: verificationCode,
      window: 1 // 允许前后1个时间窗口的验证码 (±30秒)
    });
    
    if (!verified) {
      // 记录失败尝试
      logger.warn('2FA验证失败', {
        userId,
        tempTokenPrefix: tempToken.substring(0, 8) + '...'
      });
      
      throw new Error('验证码无效，请确保输入正确');
    }
    
    // 验证成功，删除临时秘钥
    await removeFromStore(tempToken);
    
    // 记录成功激活
    logger.info('2FA验证成功', {
      userId,
      tempTokenPrefix: tempToken.substring(0, 8) + '...'
    });
    
    // 返回秘钥供保存到用户模型中
    return {
      secretKey: secretData.secret,
      activated: true
    };
  } catch (error) {
    logger.error('验证2FA秘钥失败', { 
      error: error.message, 
      userId,
      tempTokenPrefix: tempToken ? tempToken.substring(0, 8) + '...' : 'null'
    });
    throw error;
  }
}

/**
 * 验证2FA验证码
 * @param {string} secretKey - 用户的2FA秘钥
 * @param {string} verificationCode - 用户输入的验证码
 * @returns {boolean} 验证结果
 */
function verifyTwoFactorCode(secretKey, verificationCode) {
  try {
    // 验证参数
    if (!secretKey || !verificationCode) {
      return false;
    }
    
    // 验证码必须是数字
    if (!/^\d{6}$/.test(verificationCode)) {
      return false;
    }
    
    // 进行验证
    return speakeasy.totp.verify({
      secret: secretKey,
      encoding: 'base32',
      token: verificationCode,
      window: 1 // 允许前后1个时间窗口的验证码
    });
  } catch (error) {
    logger.error('验证2FA代码失败', { error: error.message });
    return false;
  }
}

/**
 * 验证高安全级别CDK的使用请求
 * @param {Object} user - 用户对象
 * @param {Object} cdk - CDK对象
 * @param {string} verificationCode - 2FA验证码
 * @returns {boolean} 验证结果
 */
function validateSecureCDKUsage(user, cdk, verificationCode) {
  // 检查CDK是否需要2FA验证
  if (!cdk.requires2FA) {
    return true; // 不需要2FA验证
  }
  
  // 用户必须已设置2FA
  if (!user.twoFactorAuth || !user.twoFactorAuth.secretKey || !user.twoFactorAuth.activated) {
    logger.warn('尝试使用需要2FA的CDK但用户未设置2FA', {
      userId: user.id,
      cdkId: cdk._id,
      cdkCode: cdk.code
    });
    
    throw new Error('需要先设置双因素认证才能使用此CDK');
  }
  
  // 验证码是必需的
  if (!verificationCode) {
    logger.warn('使用需要2FA的CDK但未提供验证码', {
      userId: user.id,
      cdkId: cdk._id
    });
    
    throw new Error('请提供双因素认证验证码');
  }
  
  // 验证2FA代码
  const isValid = verifyTwoFactorCode(user.twoFactorAuth.secretKey, verificationCode);
  
  if (!isValid) {
    // 记录失败验证
    logger.warn('CDK使用的2FA验证失败', {
      userId: user.id,
      cdkId: cdk._id,
      cdkCode: cdk.code
    });
    
    throw new Error('双因素认证验证码无效，请重试');
  }
  
  // 记录成功验证
  logger.info('CDK使用的2FA验证成功', {
    userId: user.id,
    cdkId: cdk._id
  });
  
  return true;
}

/**
 * 清理过期的临时秘钥（定期执行）
 */
function cleanupExpiredSecrets() {
  const now = Date.now();
  
  // 清理内存存储中的过期项
  for (const [token, item] of memoryStore.entries()) {
    if (item.expires < now) {
      memoryStore.delete(token);
      logger.debug('清理过期的临时2FA秘钥', { 
        tempTokenPrefix: token.substring(0, 8) + '...'
      });
    }
  }
}

// 定期清理过期密钥，每5分钟执行一次
setInterval(cleanupExpiredSecrets, 5 * 60 * 1000);

// 应用启动时初始化连接
getRedisClient();

module.exports = {
  generateTwoFactorSecret,
  verifyAndActivateTwoFactor,
  verifyTwoFactorCode,
  validateSecureCDKUsage
}; 