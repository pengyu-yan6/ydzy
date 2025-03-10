/**
 * 错误处理工具
 * 用于统一处理API错误和应用错误
 */

import { logout } from './auth';

// 错误类型枚举
export const ErrorTypes = {
  NETWORK: 'network_error',
  AUTH: 'authentication_error',
  PERMISSION: 'permission_error',
  VALIDATION: 'validation_error',
  SERVER: 'server_error',
  CLIENT: 'client_error',
  RATE_LIMIT: 'rate_limit',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown_error'
};

// HTTP状态码映射到错误类型
const HTTP_STATUS_MAP = {
  400: ErrorTypes.VALIDATION,
  401: ErrorTypes.AUTH,
  403: ErrorTypes.PERMISSION,
  404: ErrorTypes.CLIENT,
  408: ErrorTypes.TIMEOUT,
  422: ErrorTypes.VALIDATION,
  429: ErrorTypes.RATE_LIMIT,
  500: ErrorTypes.SERVER,
  502: ErrorTypes.SERVER,
  503: ErrorTypes.SERVER,
  504: ErrorTypes.TIMEOUT
};

/**
 * 创建统一的错误对象
 * @param {string} type - 错误类型，参考ErrorTypes
 * @param {string} message - 错误消息
 * @param {*} [originalError] - 原始错误对象
 * @param {Object} [details] - 其他错误详情
 * @returns {Object} 标准化的错误对象
 */
export function createError(type, message, originalError = null, details = {}) {
  return {
    type,
    message,
    timestamp: new Date().toISOString(),
    originalError,
    details
  };
}

/**
 * 解析HTTP错误响应
 * @param {Object} error - Axios错误对象
 * @returns {Object} 标准化的错误对象
 */
export function parseHttpError(error) {
  // 网络错误
  if (!error.response) {
    return createError(
      ErrorTypes.NETWORK,
      '网络错误，请检查您的网络连接',
      error
    );
  }
  
  const { status, data } = error.response;
  let errorType = HTTP_STATUS_MAP[status] || ErrorTypes.UNKNOWN;
  let message = data?.message || '服务器返回了一个错误';
  
  // 对特定状态码进行特殊处理
  switch (status) {
    case 401:
      message = '用户未登录或会话已过期，请重新登录';
      break;
    
    case 403:
      message = '您没有权限执行此操作';
      break;
    
    case 404:
      message = '请求的资源不存在';
      break;
    
    case 429:
      message = '请求过于频繁，请稍后再试';
      break;
    
    case 500:
    case 502:
    case 503:
      message = '服务器暂时不可用，请稍后再试';
      break;
    
    case 504:
      message = '服务器响应超时，请稍后再试';
      break;
  }
  
  return createError(errorType, message, error, {
    status,
    data: data,
    url: error.config?.url,
    method: error.config?.method
  });
}

/**
 * 解析WebSocket错误
 * @param {Object} error - WebSocket错误对象
 * @returns {Object} 标准化的错误对象
 */
export function parseWebSocketError(error) {
  let errorType = ErrorTypes.UNKNOWN;
  let message = error.message || '与游戏服务器的连接出现问题';
  
  // 根据错误消息判断类型
  if (/timeout|超时/.test(message)) {
    errorType = ErrorTypes.TIMEOUT;
  } else if (/unauthorized|未授权|未登录/.test(message)) {
    errorType = ErrorTypes.AUTH;
  } else if (/forbidden|禁止|没有权限/.test(message)) {
    errorType = ErrorTypes.PERMISSION;
  } else if (/network|网络/.test(message)) {
    errorType = ErrorTypes.NETWORK;
  }
  
  return createError(errorType, message, error);
}

/**
 * 解析游戏逻辑错误
 * @param {Object} error - 游戏错误对象
 * @returns {Object} 标准化的错误对象
 */
export function parseGameError(error) {
  // 游戏错误通常有一个特定的格式
  const { code, message, details } = error;
  
  let errorType = ErrorTypes.UNKNOWN;
  let errorMessage = message || '游戏中发生了一个错误';
  
  // 根据错误代码映射到错误类型
  if (code) {
    switch (true) {
      case /auth|login|token/.test(code):
        errorType = ErrorTypes.AUTH;
        break;
      
      case /permission|access|forbidden/.test(code):
        errorType = ErrorTypes.PERMISSION;
        break;
      
      case /validation|invalid|format/.test(code):
        errorType = ErrorTypes.VALIDATION;
        break;
      
      case /limit|rate|throttle/.test(code):
        errorType = ErrorTypes.RATE_LIMIT;
        break;
      
      case /timeout|expired/.test(code):
        errorType = ErrorTypes.TIMEOUT;
        break;
      
      case /server|internal/.test(code):
        errorType = ErrorTypes.SERVER;
        break;
      
      case /client|user/.test(code):
        errorType = ErrorTypes.CLIENT;
        break;
    }
  }
  
  return createError(errorType, errorMessage, error, details);
}

/**
 * 处理错误并执行相应操作
 * @param {Object} error - 标准化的错误对象
 * @param {Object} options - 处理选项
 * @param {Function} [options.onAuth] - 认证错误处理函数
 * @param {Function} [options.onPermission] - 权限错误处理函数
 * @param {Function} [options.onRateLimit] - 速率限制错误处理函数
 * @param {Function} [options.onNetwork] - 网络错误处理函数
 * @param {Function} [options.onServer] - 服务器错误处理函数
 * @param {Function} [options.onNotification] - 通知显示函数
 * @param {Function} [options.onLog] - 日志记录函数
 * @returns {Object} 处理后的错误对象
 */
export function handleError(error, options = {}) {
  // 首先，确保错误是标准格式
  let standardError = error;
  
  if (!error.type) {
    if (error.isAxiosError) {
      standardError = parseHttpError(error);
    } else if (error.code && typeof error.code === 'string') {
      standardError = parseGameError(error);
    } else {
      standardError = createError(
        ErrorTypes.UNKNOWN,
        error.message || '发生未知错误',
        error
      );
    }
  }
  
  // 记录错误
  if (options.onLog) {
    options.onLog(standardError);
  } else {
    console.error('[错误]', standardError.message, standardError);
  }
  
  // 根据错误类型执行相应操作
  switch (standardError.type) {
    case ErrorTypes.AUTH:
      // 处理认证错误（通常需要重新登录）
      if (options.onAuth) {
        options.onAuth(standardError);
      } else {
        // 默认行为：登出并重定向到登录页面
        logout();
        if (typeof window !== 'undefined' && window.location) {
          window.location.href = '/login?reason=session_expired';
        }
      }
      break;
    
    case ErrorTypes.PERMISSION:
      // 处理权限错误
      if (options.onPermission) {
        options.onPermission(standardError);
      } else {
        // 显示通知
        showNotification(standardError, options);
      }
      break;
    
    case ErrorTypes.RATE_LIMIT:
      // 处理速率限制
      if (options.onRateLimit) {
        options.onRateLimit(standardError);
      } else {
        showNotification(standardError, options);
      }
      break;
    
    case ErrorTypes.NETWORK:
      // 处理网络错误
      if (options.onNetwork) {
        options.onNetwork(standardError);
      } else {
        showNotification(standardError, options);
      }
      break;
    
    case ErrorTypes.SERVER:
      // 处理服务器错误
      if (options.onServer) {
        options.onServer(standardError);
      } else {
        showNotification(standardError, options);
      }
      break;
    
    default:
      // 处理其他类型的错误
      showNotification(standardError, options);
      break;
  }
  
  return standardError;
}

/**
 * 显示错误通知
 * @private
 * @param {Object} error - 标准化的错误对象
 * @param {Object} options - 处理选项
 */
function showNotification(error, options) {
  if (options.onNotification) {
    options.onNotification(error);
  } else if (typeof window !== 'undefined') {
    // 如果没有提供通知函数，使用alert作为后备
    // 注：实际应用中应该使用更友好的通知UI
    alert(`[错误] ${error.message}`);
  }
}

/**
 * 全局未捕获异常处理器
 * 用于Vue的全局错误处理
 * @param {Error} error - 未捕获的错误
 * @param {Vue} vm - Vue实例(组件)
 * @param {string} info - Vue提供的错误信息
 */
export function globalErrorHandler(error, vm, info) {
  // 创建标准错误对象
  const standardError = createError(
    ErrorTypes.CLIENT,
    error.message || '应用发生未捕获的错误',
    error,
    { info, componentName: vm?.$options?.name || '未知组件' }
  );
  
  // 记录错误
  console.error('[全局错误]', standardError.message, standardError);
  
  // 可以添加错误上报逻辑
  // reportErrorToServer(standardError);
  
  // 在开发环境中，可以显示更详细的错误信息
  if (process.env.NODE_ENV !== 'production') {
    alert(`[开发环境错误]\n${error.message}\n\n组件: ${standardError.details.componentName}\n信息: ${info}`);
  }
}

/**
 * 创建API错误响应拦截器
 * 用于Axios等HTTP客户端
 * @param {Object} options - 错误处理选项
 * @returns {Function} 错误拦截器函数
 */
export function createApiErrorInterceptor(options = {}) {
  return (error) => {
    const standardError = handleError(error, options);
    
    // 始终拒绝promise，以便调用者可以处理
    return Promise.reject(standardError);
  };
}

/**
 * 错误码本地化
 * 将后端错误码转换为本地化的错误消息
 * @param {string} errorCode - 错误代码
 * @param {Object} [params] - 错误消息参数
 * @returns {string} 本地化的错误消息
 */
export function localizeErrorCode(errorCode, params = {}) {
  // 错误代码映射表
  const errorMessages = {
    'auth.invalid_credentials': '用户名或密码错误',
    'auth.account_locked': '账号已被锁定，请联系客服',
    'auth.token_expired': '登录已过期，请重新登录',
    'game.battle.not_found': '找不到指定的战斗',
    'game.character.not_found': '找不到指定的角色',
    'game.item.not_enough': `物品数量不足，需要{required}个，但只有{current}个`,
    'payment.insufficient_funds': '余额不足，无法完成支付',
    // 更多错误代码...
  };
  
  // 获取错误消息
  let message = errorMessages[errorCode] || `发生错误(${errorCode})`;
  
  // 替换参数
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      message = message.replace(`{${key}}`, value);
    });
  }
  
  return message;
}

export default {
  ErrorTypes,
  createError,
  parseHttpError,
  parseWebSocketError,
  parseGameError,
  handleError,
  globalErrorHandler,
  createApiErrorInterceptor,
  localizeErrorCode
}; 