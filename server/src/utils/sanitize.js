/**
 * 数据清理工具
 * 用于过滤返回给客户端的敏感数据
 */

const config = require('../config');

/**
 * 清理用户对象，移除敏感字段后返回给客户端
 * @param {Object} user - 用户对象
 * @returns {Object} 过滤后的用户对象
 */
exports.sanitizeUserForClient = (user) => {
  // 如果没有用户或不是对象，则返回null
  if (!user || typeof user !== 'object') {
    return null;
  }

  // 将Mongoose文档转换为普通对象
  const userObj = user.toObject ? user.toObject() : user;

  // 确保敏感字段不会返回给客户端
  const sensitiveFields = [
    'password',
    '__v',
    'resetPasswordToken',
    'resetPasswordExpires',
    'failedLoginAttempts',
    'passwordChangedAt',
    'paymentInfo.cardInfo',
    'paymentInfo.billingInfo',
    ...config.security.sensitiveFields
  ];

  // 创建用户基本信息副本
  const sanitizedUser = {
    id: userObj._id.toString(),
    username: userObj.username,
    email: userObj.email,
    nickname: userObj.nickname || userObj.username,
    role: userObj.role,
    status: userObj.status,
    avatar: userObj.avatar,
    createdAt: userObj.createdAt,
    updatedAt: userObj.updatedAt,
    lastLoginAt: userObj.lastLoginAt
  };

  // 添加游戏相关信息（如果存在）
  if (userObj.gameProfile) {
    sanitizedUser.gameProfile = {
      level: userObj.gameProfile.level,
      exp: userObj.gameProfile.exp,
      gold: userObj.gameProfile.gold,
      diamond: userObj.gameProfile.diamond
    };
  }

  // 添加VIP信息（如果存在）（注意：隐藏完整的支付信息）
  if (userObj.paymentInfo) {
    sanitizedUser.vip = {
      level: userObj.paymentInfo.vipLevel,
      expiry: userObj.paymentInfo.vipExpiry
    };
  }

  // 添加统计信息（如果存在）
  if (userObj.stats) {
    sanitizedUser.stats = { ...userObj.stats };
  }

  // 开发环境下可以添加调试信息
  if (config.server.env === 'development') {
    sanitizedUser._debug = {
      id: userObj._id.toString(),
      createdAt: userObj.createdAt
    };
  }

  return sanitizedUser;
};

/**
 * 清理错误对象，确保不会暴露敏感的系统信息
 * @param {Error} error - 错误对象
 * @param {boolean} isDevelopment - 是否为开发环境
 * @returns {Object} 过滤后的错误对象
 */
exports.sanitizeErrorForClient = (error, isDevelopment = false) => {
  // 基本错误信息
  const sanitizedError = {
    message: error.message || '发生了错误',
    code: error.code || 'UNKNOWN_ERROR'
  };

  // 在开发环境下添加更多详细信息
  if (isDevelopment) {
    sanitizedError.stack = error.stack;
    sanitizedError.details = error.details || error.errors;
  }

  return sanitizedError;
};

/**
 * 清理支付信息，移除敏感的支付详情
 * @param {Object} paymentData - 支付数据对象
 * @returns {Object} 过滤后的支付数据
 */
exports.sanitizePaymentData = (paymentData) => {
  if (!paymentData) return null;

  // 创建支付数据副本
  const sanitized = { ...paymentData };

  // 移除敏感字段
  if (sanitized.cardInfo) {
    if (sanitized.cardInfo.number) {
      // 仅保留卡号最后4位
      sanitized.cardInfo.number = `****${sanitized.cardInfo.number.slice(-4)}`;
    }
    // 完全移除CVV
    delete sanitized.cardInfo.cvv;
  }

  // 保留账单地址的部分信息，但隐藏详细地址
  if (sanitized.billingInfo && sanitized.billingInfo.address) {
    sanitized.billingInfo.country = sanitized.billingInfo.country;
    sanitized.billingInfo.city = sanitized.billingInfo.city;
    sanitized.billingInfo.zipCode = sanitized.billingInfo.zipCode;
    sanitized.billingInfo.address = '[隐藏]';
  }

  return sanitized;
};

/**
 * 清理日志对象，移除可能包含敏感信息的字段
 * @param {Object} logData - 日志数据对象
 * @returns {Object} 过滤后的日志数据
 */
exports.sanitizeLogData = (logData) => {
  if (!logData) return null;

  // 创建日志数据副本
  const sanitized = { ...logData };

  // 定义可能包含敏感信息的字段
  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'auth', 
    'credential', 'pin', 'card', 'cvv', 'ssn', 'social', 
    'cookie', 'session', 'authorization', 'accessToken', 
    'refreshToken', 'apiKey'
  ];

  // 递归检查并清理敏感字段
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    // 处理数组
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item));
    }
    
    // 处理对象
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      // 检查键名是否包含敏感字段
      const isSensitive = sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        result[key] = '[隐藏]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = sanitizeObject(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  };

  return sanitizeObject(sanitized);
}; 