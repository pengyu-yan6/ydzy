const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const config = require('../config/security.config');
const logger = require('../utils/logger');

// 是否使用Redis存储
const useRedisStore = process.env.USE_REDIS_RATE_LIMIT === 'true';

// Redis客户端实例
let redisClient;
if (useRedisStore) {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_RATE_LIMIT_DB || '0', 10),
  });
}

/**
 * DDoS防护系统
 */
class DDoSProtection {
  /**
   * 创建基本的请求速率限制中间件
   * @returns {Function} Express中间件
   */
  static createRateLimiter() {
    const {
      windowMs,
      maxRequests,
      message
    } = config.ddos.rateLimit;
    
    const limiterOptions = {
      windowMs,
      max: maxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message,
        error: 'RATE_LIMIT_EXCEEDED'
      },
      skip: (req) => this.isWhitelisted(req),
      handler: (req, res, next, options) => {
        logger.warn('速率限制触发', {
          ip: req.ip,
          path: req.path,
          headers: req.headers,
          userAgent: req.headers['user-agent']
        });
        
        res.status(429).json(options.message);
      }
    };
    
    // 如果启用Redis存储
    if (useRedisStore && redisClient) {
      limiterOptions.store = new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
        prefix: 'ddos_rl:'
      });
    }
    
    return rateLimit(limiterOptions);
  }
  
  /**
   * 检查IP是否在白名单中
   * @param {Object} req - Express请求对象
   * @returns {Boolean} - 是否在白名单中
   */
  static isWhitelisted(req) {
    const clientIp = req.ip;
    return config.ddos.rateLimit.whitelistIps.includes(clientIp);
  }
  
  /**
   * 创建API路径级别的限制器
   * @param {Object} customConfig - 自定义配置
   * @returns {Function} Express中间件
   */
  static createApiRateLimiter(customConfig = {}) {
    const baseConfig = config.ddos.rateLimit;
    const mergedConfig = {
      windowMs: customConfig.windowMs || baseConfig.windowMs,
      maxRequests: customConfig.maxRequests || baseConfig.maxRequests / 2, // 默认API级别限制更严格
      message: customConfig.message || baseConfig.message
    };
    
    const limiterOptions = {
      windowMs: mergedConfig.windowMs,
      max: mergedConfig.maxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: mergedConfig.message,
        error: 'API_RATE_LIMIT_EXCEEDED'
      },
      skip: (req) => this.isWhitelisted(req),
      keyGenerator: (req) => {
        // 根据IP和API路径生成键
        return `${req.ip}:${req.path}`;
      }
    };
    
    // 如果启用Redis存储
    if (useRedisStore && redisClient) {
      limiterOptions.store = new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
        prefix: 'ddos_api_rl:'
      });
    }
    
    return rateLimit(limiterOptions);
  }
  
  /**
   * 创建高级DDoS检测中间件
   * @returns {Function} Express中间件
   */
  static createAdvancedDetection() {
    // 记录IP请求统计的缓存
    const requestStats = new Map();
    const { burstFactor, maxRequestsPerCycle, cycleDuration } = config.ddos.detection.thresholds;
    
    // 清理过期的统计数据
    setInterval(() => {
      const now = Date.now();
      for (const [ip, stats] of requestStats.entries()) {
        if (now - stats.lastUpdate > cycleDuration * 1000) {
          requestStats.delete(ip);
        }
      }
    }, 60000); // 每分钟清理一次
    
    return (req, res, next) => {
      const clientIp = req.ip;
      
      // 白名单IP跳过检测
      if (this.isWhitelisted(req)) {
        return next();
      }
      
      const now = Date.now();
      const currentStats = requestStats.get(clientIp) || {
        count: 0,
        firstRequest: now,
        lastUpdate: now,
        burstCount: 0,
        lastBurstTime: 0,
        blocked: false,
        paths: {}
      };
      
      // 更新请求计数
      currentStats.count += 1;
      currentStats.lastUpdate = now;
      
      // 记录API路径的请求次数
      const path = req.path;
      currentStats.paths[path] = (currentStats.paths[path] || 0) + 1;
      
      // 计算平均请求率
      const elapsedSeconds = (now - currentStats.firstRequest) / 1000 || 1;
      const avgRequestRate = currentStats.count / elapsedSeconds;
      
      // 检测突发请求
      const timeSinceLastBurst = now - currentStats.lastBurstTime;
      if (timeSinceLastBurst < 5000 && currentStats.count > 10) { // 5秒内，且已经有超过10个请求
        const shortTermRate = 5 / (timeSinceLastBurst / 1000); // 每秒请求率
        
        if (shortTermRate > avgRequestRate * burstFactor) {
          currentStats.burstCount += 1;
          currentStats.lastBurstTime = now;
          
          logger.warn('检测到请求突增', {
            ip: clientIp,
            shortTermRate,
            avgRate: avgRequestRate,
            burstCount: currentStats.burstCount,
            totalRequests: currentStats.count
          });
        }
      }
      
      // 检查是否超过最大请求数
      const isOverMaxRequests = currentStats.count > maxRequestsPerCycle;
      const hasBurstPattern = currentStats.burstCount >= 3; // 多次突发请求
      
      // 判断是否触发DDoS检测
      const isDDoSDetected = isOverMaxRequests || hasBurstPattern;
      
      if (isDDoSDetected) {
        // 记录异常
        logger.warn('可能的DDoS攻击', {
          ip: clientIp,
          requestCount: currentStats.count,
          requestRate: avgRequestRate,
          burstCount: currentStats.burstCount,
          paths: currentStats.paths,
          userAgent: req.headers['user-agent']
        });
        
        // 如果是主动拦截模式
        if (config.ddos.detection.mode === 'active') {
          currentStats.blocked = true;
          requestStats.set(clientIp, currentStats);
          
          return res.status(429).json({
            success: false,
            message: '检测到异常流量，请求已被拒绝',
            error: 'DDOS_PROTECTION_TRIGGERED'
          });
        }
      }
      
      // 更新IP统计
      requestStats.set(clientIp, currentStats);
      next();
    };
  }
  
  /**
   * 创建完整的DDoS防护中间件
   * @returns {Array} 中间件数组
   */
  static createMiddleware() {
    const middleware = [];
    
    if (config.ddos.enabled) {
      // 添加基本速率限制
      middleware.push(this.createRateLimiter());
      
      // 添加高级DDoS检测
      middleware.push(this.createAdvancedDetection());
      
      logger.info('DDoS防护已启用', {
        mode: config.ddos.detection.mode,
        rateLimit: {
          windowMs: config.ddos.rateLimit.windowMs,
          maxRequests: config.ddos.rateLimit.maxRequests
        }
      });
    }
    
    return middleware;
  }
  
  /**
   * 为特定API路径创建更严格的限制
   * @param {String} path - API路径
   * @param {Object} options - 自定义选项
   * @returns {Function} Express中间件
   */
  static protectPath(path, options = {}) {
    return this.createApiRateLimiter(options);
  }
}

module.exports = DDoSProtection; 