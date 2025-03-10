/**
 * 高级敏感操作日志记录中间件
 * 提供军事级审计和入侵检测能力
 */
const logger = require('../utils/logger');
const ipUtils = require('../utils/ip.utils');
const { createHash, createHmac } = require('crypto');
const dbEncryption = require('../security/dbEncryption');
const config = require('../config/security.config');
const { promisify } = require('util');
const mongoose = require('mongoose');

// 敏感操作路由配置
const SENSITIVE_ROUTES = {
  // 用户认证相关
  '/api/auth/reset-password': {
    level: 'HIGH',
    description: '重置密码',
    dataFields: ['email', 'newPassword'],
    sensitiveFields: ['newPassword'],
    alertThreshold: 5 // 5次/小时触发警报
  },
  '/api/auth/change-email': {
    level: 'HIGH',
    description: '修改邮箱',
    dataFields: ['userId', 'newEmail'],
    sensitiveFields: [],
    alertThreshold: 3 // 3次/小时触发警报
  },
  // 支付相关
  '/api/payment/create': {
    level: 'CRITICAL',
    description: '创建支付订单',
    dataFields: ['amount', 'currency', 'productId'],
    sensitiveFields: ['cardDetails'],
    alertThreshold: 10 // 10次/小时触发警报
  },
  '/api/payment/refund': {
    level: 'CRITICAL',
    description: '退款操作',
    dataFields: ['orderId', 'amount', 'reason'],
    sensitiveFields: [],
    alertThreshold: 5 // 5次/小时触发警报
  },
  // 游戏核心数据相关
  '/api/game/item/delete': {
    level: 'HIGH',
    description: '删除游戏道具',
    dataFields: ['itemId', 'userId'],
    sensitiveFields: [],
    alertThreshold: 20 // 20次/小时触发警报
  },
  '/api/game/character/modify': {
    level: 'HIGH',
    description: '修改角色属性',
    dataFields: ['characterId', 'attributes'],
    sensitiveFields: [],
    alertThreshold: 15 // 15次/小时触发警报
  },
  // 管理员操作
  '/api/admin/user/ban': {
    level: 'CRITICAL',
    description: '封禁用户',
    dataFields: ['targetUserId', 'reason', 'duration'],
    sensitiveFields: [],
    alertThreshold: 3 // 3次/小时触发警报
  },
  '/api/admin/game/config': {
    level: 'CRITICAL',
    description: '修改游戏配置',
    dataFields: ['configType', 'changes'],
    sensitiveFields: [],
    alertThreshold: 2 // 2次/小时触发警报
  }
};

// 数据库模型 (如果启用了持久化)
let SensitiveLogModel;
try {
  const SensitiveLogSchema = new mongoose.Schema({
    operationId: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    level: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true },
    description: { type: String, required: true },
    userId: { type: String, index: true },
    username: String,
    action: { type: String, required: true },
    resource: String,
    path: { type: String, required: true },
    method: { type: String, required: true },
    clientIp: { type: String, index: true },
    userAgent: String,
    // 加密字段
    requestBody: Object,
    responseBody: Object,
    metadata: Object,
    result: {
      status: Number,
      success: Boolean,
      error: String
    },
    // 安全和完整性
    integrityHash: { type: String, required: true },
    alertGenerated: { type: Boolean, default: false },
    riskScore: { type: Number, default: 0 }
  });
  
  // 尝试初始化模型
  if (mongoose.connection.readyState === 1) { // 已连接
    SensitiveLogModel = mongoose.model('SensitiveLog', SensitiveLogSchema);
  } else {
    logger.info('MongoDB连接未就绪，敏感操作日志将不会持久化');
  }
} catch (error) {
  logger.warn('初始化敏感操作日志数据库模型失败', {
    error: error.message
  });
}

// 内存缓存，用于检测可疑活动
const operationCache = {
  userActivities: new Map(), // 用户活动计数
  ipActivities: new Map(),   // IP活动计数
  recentAlerts: []           // 最近的警报
};

// 清理过期的操作缓存
setInterval(() => {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  
  // 清理用户活动
  for (const [userId, activities] of operationCache.userActivities.entries()) {
    const recentActivities = activities.filter(a => a.timestamp >= hourAgo);
    if (recentActivities.length === 0) {
      operationCache.userActivities.delete(userId);
    } else {
      operationCache.userActivities.set(userId, recentActivities);
    }
  }
  
  // 清理IP活动
  for (const [ip, activities] of operationCache.ipActivities.entries()) {
    const recentActivities = activities.filter(a => a.timestamp >= hourAgo);
    if (recentActivities.length === 0) {
      operationCache.ipActivities.delete(ip);
    } else {
      operationCache.ipActivities.set(ip, recentActivities);
    }
  }
  
  // 保留最近100个警报
  if (operationCache.recentAlerts.length > 100) {
    operationCache.recentAlerts = operationCache.recentAlerts.slice(-100);
  }
}, 15 * 60 * 1000); // 15分钟清理一次

/**
 * 生成操作ID
 * @param {Object} req - 请求对象
 * @returns {string} - 操作ID
 */
function generateOperationId(req) {
  const timestamp = Date.now().toString();
  const userInfo = req.user ? req.user.id : 'anonymous';
  const path = req.path;
  const ip = ipUtils.getClientIp(req);
  const random = Math.random().toString().substring(2, 10);
  
  return createHash('sha256')
    .update(`${timestamp}:${userInfo}:${path}:${ip}:${random}`)
    .digest('hex')
    .substring(0, 24);
}

/**
 * 生成完整性哈希
 * @param {Object} logData - 日志数据
 * @returns {string} - 完整性哈希
 */
function generateIntegrityHash(logData) {
  // 使用HMAC和密钥生成哈希，防止篡改
  const secret = config.security.logIntegrityKey || 'default-integrity-key';
  
  // 构建要哈希的数据子集
  const dataToHash = {
    operationId: logData.operationId,
    timestamp: logData.timestamp,
    userId: logData.userId,
    path: logData.path,
    method: logData.method,
    clientIp: logData.clientIp,
    level: logData.level
  };
  
  // 使用HMAC生成哈希
  return createHmac('sha256', secret)
    .update(JSON.stringify(dataToHash))
    .digest('hex');
}

/**
 * 脱敏敏感字段
 * @param {Object} data - 原始数据
 * @param {Array<string>} sensitiveFields - 敏感字段列表
 * @returns {Object} - 脱敏后的数据
 */
function sanitizeSensitiveData(data, sensitiveFields = []) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  // 默认敏感字段
  const defaultSensitiveFields = [
    'password', 'token', 'secret', 'key', 'credit', 'card',
    'cvv', 'ssn', 'social', 'account', 'auth', 'authToken',
    'credential', 'privateKey', 'passphrase'
  ];
  
  // 合并敏感字段
  const allSensitiveFields = [...defaultSensitiveFields, ...sensitiveFields];
  
  // 创建深拷贝以避免修改原始对象
  const result = JSON.parse(JSON.stringify(data));
  
  // 递归处理对象
  function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    for (const key in obj) {
      // 检查是否是敏感字段
      const isSensitive = allSensitiveFields.some(
        field => key.toLowerCase().includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        // 根据值类型进行脱敏
        if (typeof obj[key] === 'string') {
          const len = obj[key].length;
          if (len > 4) {
            obj[key] = `${obj[key].substr(0, 2)}****${obj[key].substr(len - 2)}`;
          } else {
            obj[key] = '****';
          }
        } else if (typeof obj[key] === 'number') {
          obj[key] = 0;
        } else {
          obj[key] = '****';
        }
      } else if (obj[key] && typeof obj[key] === 'object') {
        // 递归处理嵌套对象
        if (Array.isArray(obj[key])) {
          obj[key] = obj[key].map(item => 
            typeof item === 'object' ? sanitizeObject(item) : item
          );
        } else {
          obj[key] = sanitizeObject(obj[key]);
        }
      }
    }
    
    return obj;
  }
  
  return sanitizeObject(result);
}

/**
 * 计算操作风险分数
 * @param {Object} logData - 日志数据
 * @returns {number} - 风险分数(0-100)
 */
function calculateRiskScore(logData) {
  let score = 0;
  
  // 基于敏感级别的基础分
  switch (logData.level) {
    case 'CRITICAL':
      score += 60;
      break;
    case 'HIGH':
      score += 40;
      break;
    case 'MEDIUM':
      score += 20;
      break;
    case 'LOW':
      score += 10;
      break;
  }
  
  // 如果是未认证用户，增加风险
  if (!logData.userId) {
    score += 20;
  }
  
  // 基于用户历史活动的风险增加
  const userActivities = operationCache.userActivities.get(logData.userId) || [];
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recentUserActivities = userActivities.filter(a => a.timestamp >= hourAgo);
  
  if (recentUserActivities.length > 20) {
    score += 15;
  } else if (recentUserActivities.length > 10) {
    score += 10;
  } else if (recentUserActivities.length > 5) {
    score += 5;
  }
  
  // 基于IP历史活动的风险增加
  const ipActivities = operationCache.ipActivities.get(logData.clientIp) || [];
  const recentIpActivities = ipActivities.filter(a => a.timestamp >= hourAgo);
  
  if (recentIpActivities.length > 30) {
    score += 15;
  } else if (recentIpActivities.length > 15) {
    score += 10;
  } else if (recentIpActivities.length > 7) {
    score += 5;
  }
  
  // 如果存在错误，增加风险
  if (logData.result && logData.result.error) {
    score += 10;
  }
  
  // 限制最大分数
  return Math.min(score, 100);
}

/**
 * 检测可疑活动
 * @param {Object} logData - 日志数据
 * @param {Object} operationInfo - 操作信息
 * @returns {boolean} - 是否生成了警报
 */
function detectSuspiciousActivity(logData, operationInfo) {
  // 如果不是敏感路由，直接返回
  if (!operationInfo) return false;
  
  // 更新用户活动
  if (logData.userId) {
    if (!operationCache.userActivities.has(logData.userId)) {
      operationCache.userActivities.set(logData.userId, []);
    }
    operationCache.userActivities.get(logData.userId).push({
      path: logData.path,
      timestamp: Date.now(),
      operationId: logData.operationId
    });
  }
  
  // 更新IP活动
  if (logData.clientIp) {
    if (!operationCache.ipActivities.has(logData.clientIp)) {
      operationCache.ipActivities.set(logData.clientIp, []);
    }
    operationCache.ipActivities.get(logData.clientIp).push({
      path: logData.path,
      timestamp: Date.now(),
      operationId: logData.operationId,
      userId: logData.userId
    });
  }
  
  // 检查活动频率
  const hourAgo = Date.now() - 60 * 60 * 1000;
  let alertGenerated = false;
  
  // 检查用户活动频率
  if (logData.userId) {
    const userActivities = operationCache.userActivities.get(logData.userId) || [];
    const recentPathActivities = userActivities
      .filter(a => a.path === logData.path && a.timestamp >= hourAgo);
    
    // 如果超过警报阈值
    if (recentPathActivities.length >= operationInfo.alertThreshold) {
      alertGenerated = true;
      
      const alert = {
        type: 'USER_ACTIVITY_THRESHOLD',
        timestamp: Date.now(),
        userId: logData.userId,
        path: logData.path,
        count: recentPathActivities.length,
        threshold: operationInfo.alertThreshold,
        level: operationInfo.level,
        recentActivityIds: recentPathActivities.map(a => a.operationId).slice(-5)
      };
      
      operationCache.recentAlerts.push(alert);
      
      // 记录警报
      logger.warn('检测到可疑用户活动', alert);
    }
  }
  
  // 检查IP活动频率
  if (logData.clientIp) {
    const ipActivities = operationCache.ipActivities.get(logData.clientIp) || [];
    const recentPathActivities = ipActivities
      .filter(a => a.path === logData.path && a.timestamp >= hourAgo);
    
    // 如果超过警报阈值
    if (recentPathActivities.length >= operationInfo.alertThreshold * 1.5) {
      alertGenerated = true;
      
      const alert = {
        type: 'IP_ACTIVITY_THRESHOLD',
        timestamp: Date.now(),
        ip: logData.clientIp,
        path: logData.path,
        count: recentPathActivities.length,
        threshold: operationInfo.alertThreshold * 1.5,
        level: operationInfo.level,
        affectedUsers: [...new Set(recentPathActivities
          .filter(a => a.userId)
          .map(a => a.userId))],
        recentActivityIds: recentPathActivities.map(a => a.operationId).slice(-5)
      };
      
      operationCache.recentAlerts.push(alert);
      
      // 记录警报
      logger.warn('检测到可疑IP活动', alert);
    }
  }
  
  return alertGenerated;
}

/**
 * 记录敏感操作详情
 * @param {Object} req - 请求对象
 * @param {Object} operationInfo - 操作信息
 * @param {Object} result - 操作结果
 */
async function logSensitiveOperation(req, operationInfo, result) {
  try {
    const operationId = generateOperationId(req);
    const timestamp = new Date().toISOString();
    const clientIp = ipUtils.getClientIp(req);
    
    // 处理请求体，脱敏敏感字段
    const sanitizedRequestBody = sanitizeSensitiveData(
      req.body, 
      operationInfo.sensitiveFields || []
    );
    
    // 处理响应体，脱敏敏感字段
    let sanitizedResponseBody;
    try {
      sanitizedResponseBody = sanitizeSensitiveData(
        typeof result.body === 'string' 
          ? JSON.parse(result.body) 
          : result.body,
        operationInfo.sensitiveFields || []
      );
    } catch (e) {
      sanitizedResponseBody = { 
        _error: '无法解析响应体',
        _raw: typeof result.body === 'string' 
          ? `${result.body.substring(0, 100)}${result.body.length > 100 ? '...' : ''}`
          : typeof result.body
      };
    }
    
    // 构建日志对象
    const logData = {
      operationId,
      timestamp: new Date(timestamp),
      path: req.path,
      method: req.method,
      level: operationInfo.level,
      description: operationInfo.description,
      userId: req.user ? req.user.id : null,
      username: req.user ? req.user.username : null,
      clientIp,
      userAgent: req.headers['user-agent'],
      requestBody: sanitizedRequestBody,
      responseBody: sanitizedResponseBody,
      result: {
        status: result.status,
        success: result.success,
        error: result.error
      },
      metadata: {
        params: req.params,
        query: req.query,
        headers: {
          ...Object.keys(req.headers).reduce((acc, key) => {
            // 排除敏感Header
            if (!['authorization', 'cookie', 'x-auth-token'].includes(key.toLowerCase())) {
              acc[key] = req.headers[key];
            }
            return acc;
          }, {})
        }
      }
    };
    
    // 计算风险分数
    const riskScore = calculateRiskScore(logData);
    logData.riskScore = riskScore;
    
    // 检测可疑活动
    const alertGenerated = detectSuspiciousActivity(logData, operationInfo);
    logData.alertGenerated = alertGenerated;
    
    // 生成完整性哈希
    logData.integrityHash = generateIntegrityHash(logData);

    // 根据不同级别使用不同的日志级别
    const logLevel = alertGenerated ? 'error' : (
      operationInfo.level === 'CRITICAL' ? 'error' :
      operationInfo.level === 'HIGH' ? 'warn' :
      'info'
    );
    
    logger[logLevel]('敏感操作执行', {
      operationId,
      path: req.path,
      method: req.method,
      level: operationInfo.level,
      userId: logData.userId,
      clientIp,
      status: result.status,
      riskScore,
      alertGenerated
    });

    // 如果启用了MongoDB，保存到数据库
    if (SensitiveLogModel) {
      try {
        // 对敏感字段进行加密
        const encryptedLogData = { ...logData };
        
        // 加密敏感数据
        encryptedLogData.requestBody = await dbEncryption.encrypt(
          logData.requestBody
        );
        encryptedLogData.responseBody = await dbEncryption.encrypt(
          logData.responseBody
        );
        encryptedLogData.metadata = await dbEncryption.encrypt(
          logData.metadata
        );
        
        // 保存到数据库
        await new SensitiveLogModel(encryptedLogData).save();
      } catch (dbError) {
        logger.error('保存敏感操作日志到数据库失败', {
          error: dbError.message,
          operationId,
          stack: dbError.stack
        });
      }
    }
    
    return logData;
  } catch (error) {
    logger.error('记录敏感操作日志失败', {
      error: error.message,
      path: req.path,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * 创建敏感操作日志中间件
 * @param {Object} options - 配置选项
 * @returns {Function} Express中间件
 */
function createSensitiveLoggerMiddleware(options = {}) {
  return async (req, res, next) => {
    const path = req.path;
    const operationInfo = SENSITIVE_ROUTES[path];

    // 如果不是敏感操作路由，直接放行
    if (!operationInfo) {
      return next();
    }

    // 保存原始end方法
    const originalEnd = res.end;
    let responseBody = '';
    let responseBuffer = [];

    // 包装write方法以捕获响应内容
    const originalWrite = res.write;
    res.write = function(chunk) {
      if (chunk) {
        if (Buffer.isBuffer(chunk)) {
          responseBuffer.push(chunk);
        } else {
          responseBuffer.push(Buffer.from(chunk));
        }
      }
      return originalWrite.apply(this, arguments);
    };

    // 重写end方法以捕获响应内容
    res.end = function(chunk) {
      if (chunk) {
        if (Buffer.isBuffer(chunk)) {
          responseBuffer.push(chunk);
        } else {
          responseBuffer.push(Buffer.from(chunk));
        }
      }
      
      // 合并所有的响应块
      const responseBodyBuffer = Buffer.concat(responseBuffer);
      responseBody = responseBodyBuffer.toString('utf8');
      
      // 处理响应结果
      let result = {
        status: res.statusCode,
        success: res.statusCode >= 200 && res.statusCode < 300,
        error: null,
        body: responseBody
      };

      try {
        const parsedBody = JSON.parse(responseBody);
        if (parsedBody.error) {
          result.error = parsedBody.error;
        }
      } catch (e) {
        // 响应体不是JSON格式，忽略
      }

      // 记录日志
      logSensitiveOperation(req, operationInfo, result).catch(err => {
        logger.error('记录敏感操作日志失败', {
          error: err.message,
          path: req.path,
          stack: err.stack
        });
      });

      // 调用原始end方法
      originalEnd.apply(this, arguments);
    };

    next();
  };
}

module.exports = {
  createSensitiveLoggerMiddleware,
  
  // 预设中间件
  sensitiveLogger: createSensitiveLoggerMiddleware(),
  
  // 导出敏感路由配置，供其他模块使用
  SENSITIVE_ROUTES,
  
  // 导出工具函数，供其他模块使用
  sanitizeSensitiveData,
  detectSuspiciousActivity,
  
  // 获取最近的警报
  getRecentAlerts: () => [...operationCache.recentAlerts]
}; 