/**
 * 请求频率限制中间件
 * 防止恶意请求和DoS攻击
 */
const config = require('../config/security.config');
const logger = require('../utils/logger');
const ipUtils = require('../utils/ip.utils');

// 路由级别的限制配置
const ROUTE_LIMITS = {
  // 登录注册相关
  '/api/auth/login': {
    windowMs: 60 * 1000, // 1分钟
    maxRequests: 5,      // 每IP最多5次登录尝试
    message: '登录尝试次数过多，请稍后再试'
  },
  '/api/auth/register': {
    windowMs: 60 * 60 * 1000, // 1小时
    maxRequests: 3,           // 每IP最多3次注册
    message: '注册频率过高，请稍后再试'
  },
  // 支付相关
  '/api/payment': {
    windowMs: 60 * 1000, // 1分钟
    maxRequests: 10,     // 每用户最多10次支付请求
    message: '支付请求频率过高，请稍后再试'
  },
  // 战斗相关
  '/api/game/battle': {
    windowMs: 10 * 1000, // 10秒
    maxRequests: 20,     // 每用户最多20次战斗请求
    message: '战斗请求频率过高，请稍后再试'
  },
  // 管理员操作
  '/api/admin': {
    windowMs: 60 * 1000, // 1分钟
    maxRequests: 30,     // 每管理员最多30次请求
    message: '管理员操作频率过高，请稍后再试'
  },
  // 全局默认配置
  'default': {
    windowMs: 60 * 1000, // 1分钟
    maxRequests: 100,    // 每IP最多100次请求
    message: '请求频率过高，请稍后再试'
  }
};

// 存储IP/用户的请求计数
const requestCounters = new Map();

/**
 * 清理过期的计数器
 */
function cleanupExpiredCounters() {
  const now = Date.now();
  for (const [key, data] of requestCounters.entries()) {
    if (now - data.lastRequest > data.windowMs) {
      requestCounters.delete(key);
    }
  }
}

// 定期清理过期计数器
setInterval(cleanupExpiredCounters, 5 * 60 * 1000); // 每5分钟清理一次

/**
 * 创建请求频率限制中间件
 * @param {Object} options - 可选配置
 * @returns {Function} - Express中间件
 */
function createRateLimitMiddleware(options = {}) {
  return (req, res, next) => {
    // 如果请求包含白名单标记则跳过限制（内部系统调用）
    if (req.headers['x-internal-request'] === config.security.internalRequestToken) {
      return next();
    }
    
    // 查找匹配的路由限制
    let routeLimit = ROUTE_LIMITS.default;
    const requestPath = req.path;
    
    // 寻找最精确的匹配
    for (const [route, limit] of Object.entries(ROUTE_LIMITS)) {
      if (route === 'default') continue;
      
      if (requestPath.startsWith(route)) {
        routeLimit = limit;
        break;
      }
    }
    
    // 自定义选项覆盖默认配置
    const { 
      windowMs = routeLimit.windowMs, 
      maxRequests = routeLimit.maxRequests,
      message = routeLimit.message,
      keyGenerator = null,
      skipSuccessfulRequests = false
    } = options;
    
    try {
      // 生成请求标识键
      let key;
      if (typeof keyGenerator === 'function') {
        key = keyGenerator(req);
      } else {
        // 默认逻辑：对于需要身份验证的接口使用用户ID，否则使用IP
        key = req.user ? `user:${req.user.id}:${requestPath}` : `ip:${ipUtils.getClientIp(req)}:${requestPath}`;
      }
      
      // 获取或初始化计数器
      if (!requestCounters.has(key)) {
        requestCounters.set(key, {
          count: 0,
          lastRequest: Date.now(),
          windowMs
        });
      }
      
      const counter = requestCounters.get(key);
      const now = Date.now();
      
      // 如果窗口已过期，重置计数器
      if (now - counter.lastRequest > windowMs) {
        counter.count = 0;
        counter.lastRequest = now;
      }
      
      // 检查是否超过限制
      if (counter.count >= maxRequests) {
        logger.warn('请求频率限制被触发', {
          path: req.path,
          key,
          count: counter.count,
          limit: maxRequests
        });
        
        // 在响应头中添加限制信息
        res.set('X-RateLimit-Limit', maxRequests.toString());
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', Math.ceil((counter.lastRequest + windowMs) / 1000).toString());
        
        return res.status(429).json({
          success: false,
          message,
          error: 'RATE_LIMIT_EXCEEDED'
        });
      }
      
      // 更新计数器
      counter.count += 1;
      counter.lastRequest = now;
      
      // 添加剩余请求计数到响应头
      res.set('X-RateLimit-Limit', maxRequests.toString());
      res.set('X-RateLimit-Remaining', (maxRequests - counter.count).toString());
      res.set('X-RateLimit-Reset', Math.ceil((counter.lastRequest + windowMs) / 1000).toString());
      
      // 如果选项设置为跳过成功的请求，则保存原始send方法
      if (skipSuccessfulRequests) {
        const originalSend = res.send;
        
        res.send = function(...args) {
          // 如果是成功的请求（2xx状态码），则减少计数
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const counter = requestCounters.get(key);
            if (counter && counter.count > 0) {
              counter.count -= 1;
            }
          }
          
          // 调用原始send方法
          return originalSend.apply(this, args);
        };
      }
      
      // 继续处理请求
      next();
    } catch (error) {
      logger.error('请求频率限制中间件错误', {
        error: error.message,
        path: req.path
      });
      
      // 出错时不阻止请求继续处理
      next();
    }
  };
}

module.exports = {
  createRateLimitMiddleware,
  
  // 预设配置的中间件
  basicRateLimit: createRateLimitMiddleware(),
  
  // 登录限制
  loginRateLimit: createRateLimitMiddleware({
    windowMs: 15 * 60 * 1000,  // 15分钟
    maxRequests: 5,            // 最多5次尝试
    message: '登录失败次数过多，请15分钟后再试'
  }),
  
  // API限制
  apiRateLimit: createRateLimitMiddleware({
    windowMs: 60 * 1000,  // 1分钟
    maxRequests: 60,      // 每分钟60次请求
    skipSuccessfulRequests: true
  }),
  
  // 严格限制（针对敏感操作）
  strictRateLimit: createRateLimitMiddleware({
    windowMs: 60 * 1000,  // 1分钟
    maxRequests: 10,      // 每分钟10次请求
    message: '操作频率过高，请稍后再试'
  })
}; 