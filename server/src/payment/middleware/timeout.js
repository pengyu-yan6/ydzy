const logger = require('../../utils/logger');

/**
 * 请求超时中间件 - 为请求设置最大处理时间
 * @param {number} timeout - 超时时间（毫秒），默认30秒
 * @returns {Function} Express中间件函数
 */
function requestTimeout(timeout = 30000) {
  return (req, res, next) => {
    // 标记请求处理开始时间
    req.requestStartTime = Date.now();
    
    // 创建超时计时器
    const timeoutId = setTimeout(() => {
      // 检查请求是否已结束
      if (!res.headersSent) {
        const requestTime = Date.now() - req.requestStartTime;
        
        logger.warn('请求处理超时', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          requestId: req.id,
          processingTime: requestTime,
          timeout
        });
        
        // 发送超时响应
        return res.status(408).json({
          success: false,
          message: '请求处理超时',
          code: 'REQUEST_TIMEOUT',
          requestId: req.id
        });
      }
    }, timeout);
    
    // 清除超时计时器的函数
    const clearRequestTimeout = () => {
      clearTimeout(timeoutId);
    };
    
    // 在请求结束时清除计时器
    res.on('finish', clearRequestTimeout);
    res.on('close', clearRequestTimeout);
    
    // 绑定计时器ID到请求对象，便于调试和显式清除
    req.timeoutId = timeoutId;
    
    // 添加请求耗时监控
    res.on('finish', () => {
      const requestTime = Date.now() - req.requestStartTime;
      
      // 记录较长耗时的请求（超过总超时时间的80%）
      if (requestTime > timeout * 0.8) {
        logger.warn('请求处理时间较长', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          requestId: req.id,
          processingTime: requestTime,
          timeout
        });
      }
    });
    
    next();
  };
}

module.exports = requestTimeout; 