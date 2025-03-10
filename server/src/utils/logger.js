/**
 * 日志工具模块 - 增强版
 * 提供统一的日志记录接口，并添加敏感数据过滤功能
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// 确保日志目录存在
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 敏感字段列表，这些字段在日志中将被脱敏
const SENSITIVE_FIELDS = [
  'password', 'token', 'accessToken', 'refreshToken', 'secret',
  'apiKey', 'privateKey', 'secretKey', 'cardNumber', 'cvv',
  'creditCard', 'idCard', 'phone', 'email', 'address', 'bankAccount',
  'code', 'codeHash', 'authorization', 'pin', 'key', 'cipher',
  'verificationCode', 'otpCode', 'twoFactorCode'
];

// 敏感关键字，用于模糊匹配敏感字段
const SENSITIVE_KEYWORDS = [
  'password', 'token', 'key', 'secret', 'private', 'auth', 'cred',
  'card', 'cvv', 'bank', 'account', 'phone', 'mobile', 'email', 'address',
  'verification', 'otp', 'pin', 'cipher', 'encrypt'
];

/**
 * 脱敏处理函数，用于替换日志中的敏感信息
 * @param {any} data - 日志数据
 * @param {number} depth - 当前递归深度
 * @returns {any} 脱敏后的数据
 */
function maskSensitiveData(data, depth = 0) {
  // 防止无限递归
  if (depth > 10) {
    return '[深度嵌套对象]';
  }
  
  // 处理null和undefined
  if (data === null || data === undefined) {
    return data;
  }
  
  // 处理原始类型
  if (typeof data !== 'object') {
    return data;
  }
  
  // 处理数组
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item, depth + 1));
  }
  
  // 处理对象
  const maskedData = {};
  for (const [key, value] of Object.entries(data)) {
    // 检查是否为敏感字段
    if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
      // 对敏感字段进行脱敏处理
      maskedData[key] = maskValue(value);
    } 
    // 检查字段名称是否包含敏感关键字
    else if (SENSITIVE_KEYWORDS.some(keyword => key.toLowerCase().includes(keyword))) {
      maskedData[key] = maskValue(value);
    }
    // 递归处理非敏感对象字段
    else if (typeof value === 'object' && value !== null) {
      maskedData[key] = maskSensitiveData(value, depth + 1);
    }
    // 常规字段原样保留
    else {
      maskedData[key] = value;
    }
  }
  
  return maskedData;
}

/**
 * 脱敏具体值
 * @param {any} value - 待脱敏的值
 * @returns {string} 脱敏后的字符串
 */
function maskValue(value) {
  // 空值处理
  if (value === null || value === undefined) {
    return value;
  }
  
  // 字符串处理
  if (typeof value === 'string') {
    if (value.length <= 0) {
      return value;
    }
    if (value.length <= 4) {
      return '****';
    }
    // 只保留前2个和后2个字符，中间用*代替
    const visibleLen = Math.min(4, Math.floor(value.length / 3));
    return `${value.substring(0, visibleLen)}${'*'.repeat(value.length - visibleLen * 2)}${value.substring(value.length - visibleLen)}`;
  }
  
  // 数字处理
  if (typeof value === 'number') {
    return '****';
  }
  
  // 对象处理
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map(item => maskValue(item));
    }
    return '[脱敏对象]';
  }
  
  // 其他类型
  return '****';
}

// 创建自定义日志格式
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(info => {
    // 脱敏处理
    const meta = Object.assign({}, info);
    delete meta.timestamp;
    delete meta.level;
    delete meta.message;
    
    // 获取调用栈信息
    const stackInfo = getStackInfo();
    
    // 处理元数据中的敏感信息
    const sanitizedMeta = maskSensitiveData(meta);
    
    // 格式化输出
    return `[${info.timestamp}] [${info.level.toUpperCase()}] [${stackInfo.file}:${stackInfo.line}] ${info.message} ${
      Object.keys(sanitizedMeta).length > 0 
        ? JSON.stringify(sanitizedMeta) 
        : ''
    }`;
  })
);

// 获取调用栈信息
function getStackInfo() {
  const stackReg = /at\s+(.*)\s+\((.*):(\d+):(\d+)\)/i;
  const stackReg2 = /at\s+()(.*):(\d+):(\d+)/i;
  
  const err = new Error();
  const stacklist = (err.stack || '').split('\n').slice(3);
  
  // 查找第一个非框架调用
  for (let i = 0; i < stacklist.length; i++) {
    const match = stackReg.exec(stacklist[i]) || stackReg2.exec(stacklist[i]);
    
    if (match) {
      const filePath = match[2];
      // 排除winston内部文件和当前logger.js
      if (!filePath.includes('winston') && 
          !filePath.includes('logger.js') && 
          !filePath.includes('node_modules')) {
        let modulePath = filePath.split(path.sep).slice(-2).join(path.sep);
        return {
          file: modulePath,
          line: match[3],
          function: match[1]
        };
      }
    }
  }
  
  return {
    file: 'unknown',
    line: '0',
    function: 'unknown'
  };
}

// 创建winston日志实例
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: customFormat,
  defaultMeta: { service: 'cdk-service' },
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    }),
    
    // 信息日志文件
    new winston.transports.File({ 
      filename: path.join(logDir, 'info.log'),
      level: 'info',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // 错误日志文件
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // 特定模块的日志
    new winston.transports.File({
      filename: path.join(logDir, 'cdk.log'),
      level: 'info',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      // 过滤CDK相关日志
      filter: (info) => {
        return info.module === 'cdk' || 
               info.batchId || 
               info.message.includes('CDK');
      }
    }),
    
    // 安全日志
    new winston.transports.File({
      filename: path.join(logDir, 'security.log'),
      level: 'info',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      // 过滤安全相关日志
      filter: (info) => {
        return info.security === true || 
               info.level === 'warn' || 
               info.level === 'error';
      }
    })
  ]
});

// 开发环境下，增加调试日志
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.File({ 
      filename: path.join(logDir, 'debug.log'),
      level: 'debug',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 2,
      tailable: true
    })
  );
}

// 添加日志清理功能
async function cleanupLogs(maxAgeDays = 30) {
  try {
    const logFiles = fs.readdirSync(logDir);
    let deletedCount = 0;
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    
    for (const file of logFiles) {
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);
      
      // 检查文件是否超过最大保留期
      if (now - stats.mtime.getTime() > maxAgeMs) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      logger.info(`清理了${deletedCount}个过期日志文件`);
    }
    
    return deletedCount;
  } catch (err) {
    logger.error('日志清理失败', { error: err.message });
    throw err;
  }
}

// 扩展logger，添加额外方法
module.exports = {
  ...logger,
  
  /**
   * 记录敏感操作，添加额外安全标记
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   */
  security: (message, meta = {}) => {
    logger.warn(message, { ...meta, security: true });
  },
  
  /**
   * 记录审计信息
   * @param {string} action - 操作类型
   * @param {string} userId - 用户ID
   * @param {Object} details - 详细信息
   */
  audit: (action, userId, details = {}) => {
    logger.info(`审计: ${action}`, {
      audit: true,
      action,
      userId,
      timestamp: new Date().toISOString(),
      details: maskSensitiveData(details)
    });
  },
  
  /**
   * 记录异常检测
   * @param {string} message - 日志消息
   * @param {Object} anomaly - 异常信息
   */
  anomaly: (message, anomaly = {}) => {
    logger.warn(message, {
      security: true,
      anomaly: true,
      ...anomaly
    });
  },
  
  /**
   * 记录特定模块的日志
   * @param {string} level - 日志级别
   * @param {string} module - 模块名称
   * @param {string} message - 日志消息
   * @param {Object} meta - 元数据
   */
  module: (level, module, message, meta = {}) => {
    if (!logger[level]) {
      level = 'info';
    }
    
    logger[level](message, { ...meta, module });
  },
  
  /**
   * 清理过期日志
   * @param {number} maxAgeDays - 最大保留天数
   * @returns {Promise<number>} 删除的文件数量
   */
  cleanupLogs
}; 