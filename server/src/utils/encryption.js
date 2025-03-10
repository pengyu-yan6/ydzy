/**
 * 数据加密工具
 * 用于敏感数据的加密和解密
 */

const crypto = require('crypto');
const config = require('../config');
const logger = require('./logger');
const path = require('path');
const fs = require('fs');

// 密钥版本及缓存
const KEY_CACHE = new Map();
let CURRENT_KEY_VERSION = 1;

/**
 * 从配置获取加密密钥，支持密钥版本和轮换
 * @param {number} version - 密钥版本，默认使用当前版本
 * @returns {Buffer} 32字节加密密钥
 */
function getEncryptionKey(version = CURRENT_KEY_VERSION) {
  // 检查缓存
  const cacheKey = `v${version}`;
  if (KEY_CACHE.has(cacheKey)) {
    return KEY_CACHE.get(cacheKey);
  }
  
  let keyConfig;
  
  // 根据版本获取不同密钥
  if (version === 1) {
    keyConfig = {
      key: config.security?.encryptionKey,
      salt: config.security?.encryptionSalt
    };
  } else {
    // 获取版本化的密钥
    keyConfig = {
      key: config.security?.keys?.[`v${version}`]?.key,
      salt: config.security?.keys?.[`v${version}`]?.salt
    };
  }
  
  if (!keyConfig.key) {
    logger.error('未配置加密密钥', { version });
    throw new Error(`系统配置错误：未设置版本${version}的加密密钥`);
  }
  
  // 使用PBKDF2派生密钥，增强安全性
  try {
    // 首先检查是否已经是32字节密钥
    if (Buffer.from(keyConfig.key, 'hex').length === 32) {
      const keyBuffer = Buffer.from(keyConfig.key, 'hex');
      KEY_CACHE.set(cacheKey, keyBuffer);
      return keyBuffer;
    }
    
    // 否则使用PBKDF2派生一个32字节密钥
    // 使用环境变量或配置的盐值，如果都不存在，则生成随机盐值
    let salt;
    if (keyConfig.salt) {
      salt = Buffer.from(keyConfig.salt, 'utf8');
    } else {
      // 注意：在生产环境中，应确保盐值持久化存储
      salt = crypto.randomBytes(16);
      logger.warn('使用随机生成的盐值，这在重启后会导致不同的密钥');
    }
    
    // 派生密钥 - 增加迭代次数到100000，提高安全性
    const derivedKey = crypto.pbkdf2Sync(
      keyConfig.key,
      salt,
      100000, // 增加迭代次数，提高安全性
      32,
      'sha512'
    );
    
    KEY_CACHE.set(cacheKey, derivedKey);
    return derivedKey;
  } catch (error) {
    logger.error('密钥派生失败', { error: error.message, version });
    throw new Error('密钥处理错误：' + error.message);
  }
}

const IV_LENGTH = 16; // AES-256-CBC需要16字节的IV

/**
 * 加密敏感数据
 * @param {String} text - 要加密的文本
 * @returns {String} 加密后的字符串
 */
exports.encrypt = (text) => {
  if (!text) {
    return text;
  }

  try {
    const key = getEncryptionKey();
    
    // 生成随机初始化向量和随机盐值
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(16);
    
    // 使用AES-256-GCM模式，带认证标签
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // 添加关联数据增加安全性
    const aad = Buffer.from(config.security?.encryptionContext || 'leaprise-app', 'utf8');
    cipher.setAAD(aad);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // 获取认证标签
    const authTag = cipher.getAuthTag();
    
    // 组合结果：版本:iv:salt:aad长度:aad:密文:认证标签
    const version = '02'; // 版本号，便于将来升级算法
    const combined = Buffer.concat([
      Buffer.from(version, 'utf8'),
      iv,
      salt,
      Buffer.from([aad.length]), // AAD长度（单字节）
      aad,
      Buffer.from(encrypted, 'hex'),
      authTag
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    logger.error('加密失败', { error: error.message });
    throw new Error('加密操作失败');
  }
};

/**
 * 解密敏感数据
 * @param {String} encryptedText - 加密后的字符串
 * @returns {String} 解密后的文本
 */
exports.decrypt = (encryptedText) => {
  if (!encryptedText) {
    return encryptedText;
  }

  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedText, 'base64');
    
    // 检查版本号
    const version = combined.slice(0, 2).toString('utf8');
    
    // 根据不同版本采用不同解密策略
    if (version === '02') {
      // 版本2：支持AAD
      const iv = combined.slice(2, 18);
      const salt = combined.slice(18, 34);
      const aadLength = combined[34];
      const aad = combined.slice(35, 35 + aadLength);
      const authTag = combined.slice(-16);
      const encrypted = combined.slice(35 + aadLength, -16).toString('hex');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } else {
      // 兼容旧版本（01或无版本号）
      // 简单提取iv和密文
      const iv = combined.slice(0, 16);
      const encrypted = combined.slice(16, -16).toString('hex');
      const authTag = combined.slice(-16);
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    }
  } catch (error) {
    logger.error('解密失败', { error: error.message });
    throw new Error('解密操作失败');
  }
};

/**
 * 安全地记录敏感信息（脱敏）
 * @param {Object} data - 包含敏感信息的对象
 * @returns {Object} 脱敏后的对象
 */
exports.maskSensitiveData = (data) => {
  if (!data || typeof data !== 'object') return data;
  
  const maskedData = { ...data };
  
  // 脱敏信用卡信息
  if (maskedData.cardNumber) {
    maskedData.cardNumber = maskCardNumber(maskedData.cardNumber);
  }
  
  // 脱敏手机号
  if (maskedData.phone) {
    maskedData.phone = maskPhone(maskedData.phone);
  }
  
  // 脱敏邮箱
  if (maskedData.email) {
    maskedData.email = maskEmail(maskedData.email);
  }
  
  // 脱敏金额 (保留但不完全显示)
  if (maskedData.amount) {
    maskedData.amount = '**' + String(maskedData.amount).slice(-2);
  }
  
  return maskedData;
};

// 辅助函数 - 脱敏信用卡号
function maskCardNumber(cardNumber) {
  if (typeof cardNumber !== 'string') return cardNumber;
  
  // 仅保留前4位和后4位
  return cardNumber.replace(/^(\d{4})\d+(\d{4})$/, '$1********$2');
}

// 辅助函数 - 脱敏手机号
function maskPhone(phone) {
  if (typeof phone !== 'string') return phone;
  
  // 仅保留前3位和后4位
  return phone.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2');
}

// 辅助函数 - 脱敏邮箱
function maskEmail(email) {
  if (typeof email !== 'string') return email;
  
  // 邮箱名部分显示首尾字符，中间用星号代替
  return email.replace(/^(.)(.*)(.@.*)$/, (_, first, middle, last) => {
    return first + '*'.repeat(Math.min(middle.length, 5)) + last;
  });
}

// 在excelExporter.js中加强安全措施
async function exportBatchToExcel(batchId, options = {}) {
  // ... 现有代码 ...
  
  // 强制要求密码保护导出文件
  if (!options.password && options.showSensitiveInfo) {
    throw new Error('导出敏感信息时必须设置密码保护');
  }
  
  // 使用安全的随机密码（如果未提供）
  const exportPassword = options.password || crypto.randomBytes(16).toString('hex');
  
  // 创建唯一的导出目录，防止目录遍历
  const uniqueExportDir = path.join(exportDir, crypto.randomBytes(16).toString('hex'));
  if (!fs.existsSync(uniqueExportDir)) {
    fs.mkdirSync(uniqueExportDir, { recursive: true });
  }
  
  // 使用安全的文件命名
  const secureFileName = `${crypto.randomBytes(16).toString('hex')}.xlsx`;
  const filePath = path.join(uniqueExportDir, secureFileName);
  
  // 对文件添加密码保护
  workbook.properties.password = exportPassword;
  
  // 添加水印标识导出者和时间
  infoSheet.addRow(['导出者', options.adminId]);
  infoSheet.addRow(['导出时间', new Date().toISOString()]);
  infoSheet.addRow(['文件有效期', '24小时']);
  
  // ... 后续代码 ...
  
  // 记录敏感操作到审计日志
  logger.info('批次数据导出', {
    batchId,
    userId: options.adminId,
    fileName: secureFileName,
    expiresAt: new Date(Date.now() + CLEANUP_INTERVAL),
    containsSensitiveInfo: options.showSensitiveInfo
  });
  
  // 清理机制
  setTimeout(() => {
    try {
      // 删除整个目录而不是单个文件
      fs.rmdirSync(uniqueExportDir, { recursive: true });
    } catch (error) {
      // ... 错误处理 ...
    }
  }, CLEANUP_INTERVAL);
  
  return {
    // ... 返回结果，包括密码（如果是自动生成的）
    // 不返回真实路径，使用下载令牌
    downloadToken: crypto.randomBytes(16).toString('hex'),
    requiresPassword: true,
    password: options.password ? undefined : exportPassword
  };
}

/**
 * 轮换加密密钥
 * @returns {number} 新的密钥版本
 */
function rotateEncryptionKey() {
  const newVersion = CURRENT_KEY_VERSION + 1;
  
  // 生成新的随机密钥
  const newKey = crypto.randomBytes(32).toString('hex');
  const newSalt = crypto.randomBytes(16).toString('hex');
  
  // 在实际环境中，这里应该将新密钥安全地存储到配置或密钥管理系统
  // 为了示例，我们记录日志并更新内存中的配置
  logger.info('密钥轮换', { 
    previousVersion: CURRENT_KEY_VERSION, 
    newVersion 
  });
  
  // 更新配置（实际环境中应持久化）
  if (!config.security.keys) {
    config.security.keys = {};
  }
  
  config.security.keys[`v${newVersion}`] = {
    key: newKey,
    salt: newSalt
  };
  
  // 更新当前版本
  CURRENT_KEY_VERSION = newVersion;
  
  return newVersion;
}

/**
 * 自动轮换即将到期的密钥
 * @param {string[]} providers - 需要检查的密钥提供商列表
 * @param {number} daysBeforeExpiry - 多少天内即将过期的密钥需要轮换
 * @returns {object} 轮换结果摘要
 */
async function autoRotateExpiringKeys(providers = ['default'], daysBeforeExpiry = 7) {
  const results = {
    rotated: [],
    failed: [],
    unchanged: 0
  };
  
  try {
    // 获取当前日期
    const now = new Date();
    // 计算过期阈值日期
    const expiryThreshold = new Date(
      now.getTime() + (daysBeforeExpiry * 24 * 60 * 60 * 1000)
    );
    
    // 记录日志
    logger.info('开始检查密钥轮换', { 
      providers, 
      daysBeforeExpiry,
      expiryThreshold: expiryThreshold.toISOString()
    });
    
    // 对每个密钥提供商进行检查
    for (const provider of providers) {
      try {
        // 获取当前密钥信息
        const currentKey = await getProviderKeyInfo(provider);
        
        // 如果密钥即将到期，进行轮换
        if (currentKey && currentKey.expiresAt && new Date(currentKey.expiresAt) <= expiryThreshold) {
          logger.info('密钥即将到期，准备轮换', {
            provider,
            keyVersion: currentKey.version,
            expiresAt: currentKey.expiresAt
          });
          
          // 获取当前密钥
          const oldKey = await getProviderKey(provider);
          
          // 生成新密钥
          const newKey = await generateProviderKey(provider);
          
          // 存储新密钥，有效期90天
          const validityDays = 90;
          const expiresAt = new Date(now.getTime() + (validityDays * 24 * 60 * 60 * 1000));
          
          await storeProviderKey(provider, newKey, {
            expiresAt,
            version: currentKey.version + 1
          });
          
          // 记录成功
          results.rotated.push({
            provider,
            oldVersion: currentKey.version,
            newVersion: currentKey.version + 1,
            validUntil: expiresAt.toISOString()
          });
          
          logger.info('密钥轮换成功', {
            provider,
            oldVersion: currentKey.version,
            newVersion: currentKey.version + 1
          });
        } else {
          results.unchanged++;
        }
      } catch (err) {
        logger.error('密钥轮换失败', {
          provider,
          error: err.message
        });
        
        results.failed.push({
          provider,
          error: err.message
        });
      }
    }
  } catch (err) {
    logger.error('自动密钥轮换过程发生错误', { error: err.message });
    throw err;
  }
  
  return results;
}

// 获取密钥提供商信息（实际中应从配置或数据库获取）
async function getProviderKeyInfo(provider) {
  if (provider === 'default') {
    return {
      version: CURRENT_KEY_VERSION,
      expiresAt: config.security.keyExpiresAt || null
    };
  }
  
  // 其他提供商处理逻辑
  // 可以从数据库或其他配置源读取
  
  return null;
}

// 获取提供商密钥
async function getProviderKey(provider) {
  if (provider === 'default') {
    return getEncryptionKey();
  }
  
  // 其他提供商
  if (provider === 'weixin') {
    return config.payment?.weixin?.secret || null;
  }
  
  if (provider === 'zhifubao') {
    return config.payment?.zhifubao?.secret || null;
  }
  
  return null;
}

// 生成提供商密钥
async function generateProviderKey(provider) {
  // 对于不同提供商生成不同格式的密钥
  if (provider === 'default') {
    return crypto.randomBytes(32).toString('hex');
  }
  
  // 其他提供商可能有不同的密钥格式
  return crypto.randomBytes(24).toString('base64');
}

// 存储提供商密钥
async function storeProviderKey(provider, key, metadata) {
  // 实际应用中，这里应该安全地存储密钥，比如写入数据库或配置系统
  logger.info('存储密钥', {
    provider,
    version: metadata.version,
    expiresAt: metadata.expiresAt
  });
  
  // 不同提供商的存储逻辑
  if (provider === 'default') {
    // 更新默认加密密钥
    if (!config.security.keys) {
      config.security.keys = {};
    }
    
    config.security.keys[`v${metadata.version}`] = {
      key: key,
      salt: crypto.randomBytes(16).toString('hex')
    };
    
    // 更新过期时间
    config.security.keyExpiresAt = metadata.expiresAt.toISOString();
    
    // 如果是最新版本，更新当前版本
    if (metadata.version > CURRENT_KEY_VERSION) {
      CURRENT_KEY_VERSION = metadata.version;
    }
  }
  
  // 实际应用中，应该更新数据库或配置系统
  return true;
}

/**
 * 重新加密数据（使用新密钥）
 * @param {string} ciphertext - 加密的数据
 * @param {Object} options - 重新加密选项
 * @returns {string} 使用新密钥加密的数据
 */
function reencrypt(ciphertext, options = {}) {
  // 解密数据
  const plaintext = decrypt(ciphertext, options);
  
  // 使用当前密钥版本加密
  return encrypt(plaintext, {
    ...options,
    version: CURRENT_KEY_VERSION
  });
}

/**
 * 生成指定长度的安全随机令牌
 * @param {number} length - 令牌长度（字节）
 * @returns {string} 16进制编码的令牌
 */
function generateSecureToken(length = 32) {
  try {
    return crypto.randomBytes(length).toString('hex');
  } catch (error) {
    logger.error('生成安全令牌失败', { error: error.message });
    throw new Error('无法生成安全令牌: ' + error.message);
  }
}

/**
 * 安全地比较两个字符串，防止计时攻击
 * @param {string} a - 字符串A
 * @param {string} b - 字符串B
 * @returns {boolean} 是否相等
 */
function secureCompare(a, b) {
  try {
    return crypto.timingSafeEqual(
      Buffer.from(String(a)),
      Buffer.from(String(b))
    );
  } catch (error) {
    // 长度不同时会抛出错误，表示不匹配
    return false;
  }
}

/**
 * 使用SHA-256生成哈希
 * @param {string} data - 要哈希的数据
 * @param {string} salt - 盐值
 * @returns {string} 哈希值
 */
function generateHash(data, salt = '') {
  return crypto
    .createHash('sha256')
    .update(String(data) + String(salt))
    .digest('hex');
}

/**
 * 使用HMAC-SHA256生成消息认证码
 * @param {string} data - 要认证的数据
 * @param {string} key - 密钥
 * @returns {string} HMAC值
 */
function generateHMAC(data, key) {
  return crypto
    .createHmac('sha256', key)
    .update(typeof data === 'string' ? data : JSON.stringify(data))
    .digest('hex');
}

/**
 * 检查配置的加密密钥强度
 * @returns {Object} 检查结果
 */
function checkEncryptionKeyStrength() {
  const key = config.security?.encryptionKey;
  const results = {
    exists: !!key,
    length: key ? key.length : 0,
    entropy: 0,
    strength: 'unknown',
    recommendations: []
  };
  
  if (!key) {
    results.strength = 'critical';
    results.recommendations.push('必须配置加密密钥');
    return results;
  }
  
  // 检查长度
  if (key.length < 32) {
    results.strength = 'weak';
    results.recommendations.push('密钥长度应至少为32个字符');
  } else if (key.length >= 64) {
    results.strength = 'strong';
  } else {
    results.strength = 'medium';
  }
  
  // 检查熵值
  let charTypes = {
    lowercase: 0,
    uppercase: 0,
    digits: 0,
    special: 0
  };
  
  for (let char of key) {
    if (/[a-z]/.test(char)) charTypes.lowercase = 1;
    else if (/[A-Z]/.test(char)) charTypes.uppercase = 1;
    else if (/[0-9]/.test(char)) charTypes.digits = 1;
    else charTypes.special = 1;
  }
  
  const charTypeCount = Object.values(charTypes).reduce((a, b) => a + b, 0);
  results.entropy = Math.log2(Math.pow(charTypeCount * 16, key.length));
  
  // 根据熵值调整强度
  if (results.entropy < 128) {
    results.strength = 'weak';
    results.recommendations.push('增加密钥复杂度，使用大小写字母、数字和特殊字符');
  } else if (results.entropy >= 256) {
    results.strength = 'strong';
  }
  
  // 检查是否是默认值或常见密钥
  const commonKeys = [
    'your-secret-key', 'secret', 'password', '12345678', 'abcdefgh'
  ];
  
  if (commonKeys.some(common => key.includes(common))) {
    results.strength = 'critical';
    results.recommendations.push('密钥包含常见或默认值，必须更换');
  }
  
  return results;
}

/**
 * 创建加密上下文，用于绑定加密数据到特定实体
 * @param {string} entityType - 实体类型 
 * @param {string} entityId - 实体ID
 * @returns {Object} 加密上下文对象
 */
function createEncryptionContext(entityType, entityId) {
  return {
    type: entityType,
    id: entityId,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(8).toString('hex')
  };
}

module.exports = {
  encrypt,
  decrypt,
  reencrypt,
  generateSecureToken,
  secureCompare,
  generateHash,
  generateHMAC,
  maskCardNumber,
  maskPhone,
  maskEmail,
  rotateEncryptionKey,
  checkEncryptionKeyStrength,
  createEncryptionContext,
  autoRotateExpiringKeys
}; 