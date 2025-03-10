/**
 * 错误处理中间件
 * 统一处理应用程序中的错误，提供友好的错误响应
 */

const config = require('../config');
const { sanitizeErrorForClient } = require('../utils/sanitize');
const logger = require('../utils/logger');

/**
 * 404 错误处理
 * 处理未找到的路由
 */
exports.notFound = (req, res, next) => {
  // 创建404错误对象
  const error = new Error(`未找到 - ${req.originalUrl}`);
  error.status = 404;
  error.code = 'RESOURCE_NOT_FOUND';
  
  // 记录请求信息（排除敏感头部信息）
  const requestInfo = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    params: req.params,
    query: req.query,
    // 仅包含非敏感headers信息
    headers: {
      'user-agent': req.headers['user-agent'],
      'accept': req.headers['accept'],
      'content-type': req.headers['content-type'],
      'accept-language': req.headers['accept-language']
    }
  };
  
  logger.warn(`404错误: ${error.message}`, {
    error: error.message,
    request: requestInfo
  });
  
  next(error);
};

/**
 * 通用错误处理
 * 处理应用程序中的所有错误
 */
exports.errorHandler = (err, req, res, next) => {
  // 确定错误状态码
  const statusCode = err.status || err.statusCode || 500;
  
  // 确定错误类型
  const errorType = determineErrorType(err);
  
  // 安全地记录错误
  logError(err, req, errorType, statusCode);
  
  // 构建响应
  const response = {
    success: false,
    error: sanitizeErrorForClient(err, config.server.env === 'development'),
    
    // 只在开发环境添加堆栈跟踪
    ...(config.server.env === 'development' && {
      // 移除路径中的敏感信息
      stack: err.stack?.split('\n').map(line => 
        line.replace(new RegExp(process.cwd(), 'g'), '')
      )
    }),
    
    // 为特定错误类型提供额外信息
    ...(errorType === 'validation' && {
      validationErrors: sanitizeValidationErrors(err.errors || err.details)
    })
  };
  
  // 返回错误响应
  res.status(statusCode).json(response);
};

/**
 * 确定错误类型
 * @param {Error} err - 错误对象
 * @returns {string} 错误类型
 */
function determineErrorType(err) {
  // MongoDB错误
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    if (err.code === 11000) return 'duplicate';
    return 'database';
  }
  
  // Mongoose验证错误
  if (err.name === 'ValidationError') {
    return 'validation';
  }
  
  // JWT错误
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return 'authentication';
  }
  
  // 自定义错误类型（如果有在错误对象上设置）
  if (err.type) return err.type;
  
  // HTTP错误
  if (err.status === 404) return 'not_found';
  if (err.status === 403) return 'forbidden';
  if (err.status === 401) return 'authentication';
  if (err.status === 400) return 'bad_request';
  
  // 默认为服务器错误
  return 'server';
}

/**
 * 安全记录错误
 * @param {Error} err - 错误对象
 * @param {Object} req - 请求对象
 * @param {string} errorType - 错误类型
 * @param {number} statusCode - HTTP状态码
 */
function logError(err, req, errorType, statusCode) {
  // 清理请求信息，移除敏感数据
  const requestInfo = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.user?.id || 'anonymous',
    // 审计信息
    timestamp: new Date().toISOString()
  };
  
  // 清理错误对象
  const cleanedError = {
    message: err.message,
    type: errorType,
    code: err.code || 'UNKNOWN_ERROR',
    statusCode,
    // 注意：始终避免记录完整错误堆栈，除非在开发环境
    ...(config.server.env === 'development' && { stack: err.stack })
  };
  
  // 根据错误类型使用适当的日志级别
  if (statusCode >= 500) {
    logger.error(`服务器错误: ${err.message}`, {
      error: cleanedError,
      request: requestInfo
    });
  } else if (errorType === 'authentication' || errorType === 'forbidden') {
    logger.warn(`认证/授权错误: ${err.message}`, {
      error: cleanedError,
      request: requestInfo
    });
  } else if (statusCode === 429) {
    logger.warn(`速率限制触发: ${err.message}`, {
      error: cleanedError,
      request: requestInfo
    });
  } else {
    logger.info(`客户端错误: ${err.message}`, {
      error: cleanedError,
      request: requestInfo
    });
  }
}

/**
 * 清理验证错误
 * @param {Object} errors - 验证错误对象
 * @returns {Object} 清理后的验证错误
 */
function sanitizeValidationErrors(errors) {
  if (!errors) return {};
  
  // 处理Mongoose ValidationError格式
  if (typeof errors === 'object' && !Array.isArray(errors)) {
    const cleanedErrors = {};
    
    Object.keys(errors).forEach(field => {
      // 确保我们不会暴露敏感字段名称
      const isSensitive = ['password', 'token', 'secret', 'key'].some(
        sensitiveField => field.toLowerCase().includes(sensitiveField)
      );
      
      const safeFieldName = isSensitive ? '安全字段' : field;
      
      cleanedErrors[safeFieldName] = errors[field].message || String(errors[field]);
    });
    
    return cleanedErrors;
  }
  
  // 处理数组格式的错误
  if (Array.isArray(errors)) {
    return errors.map(error => ({
      field: error.field || 'unknown',
      message: error.message || String(error)
    }));
  }
  
  // 其他格式
  return { general: '验证失败' };
}

/**
 * 创建自定义错误类
 */
class AppError extends Error {
  /**
   * 创建应用程序错误
   * @param {string} message - 错误消息
   * @param {number} statusCode - HTTP状态码
   * @param {string} code - 错误代码
   */
  constructor(message, statusCode = 500, code = 'UNKNOWN_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // 标记为操作性错误，可以安全地向客户端发送
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// 导出AppError类，用于创建一致的错误对象
exports.AppError = AppError; 