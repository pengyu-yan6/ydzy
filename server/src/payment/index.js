/**
 * 支付模块入口文件
 */

const paymentRoutes = require('./routes/paymentRoutes');
const configRoutes = require('./routes/configRoutes');
const PaymentFactory = require('./core/PaymentFactory');
const keyManager = require('./core/keyManager');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * 创建速率限制器
 * @param {Object} options - 配置选项
 * @returns {Function} 速率限制中间件
 */
function createRateLimiter(options) {
  const {
    windowMs = 15 * 60 * 1000, // 默认15分钟
    max = 100,                // 默认100次请求
    message = '请求过于频繁，请稍后再试',
    keyGenerator = (req) => {
      // 组合IP和用户ID（如可用）作为限制键
      const ip = req.ip || req.connection.remoteAddress;
      const userId = req.user?.id || 'anonymous';
      return `${ip}:${userId}`;
    },
    skipSuccessfulRequests = false,
    path
  } = options;
  
  let store;
  
  // 尝试使用Redis作为存储，优雅降级到内存存储
  try {
    if (config.redis && config.redis.host) {
      const client = redis.createClient({
        host: config.redis.host,
        port: config.redis.port || 6379,
        password: config.redis.password,
        enable_offline_queue: false
      });
      
      store = new RedisStore({
        client,
        prefix: `rl:payment:${path}:`
      });
      
      logger.info(`为路径 ${path} 创建Redis速率限制器`);
    }
  } catch (error) {
    logger.warn(`Redis速率限制器创建失败，使用内存存储`, { error: error.message });
  }
  
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message,
      code: 'TOO_MANY_REQUESTS'
    },
    keyGenerator,
    skipSuccessfulRequests,
    store,
    standardHeaders: true,
    legacyHeaders: false
  });
}

/**
 * 初始化支付模块
 * @param {Object} app - Express应用实例
 */
function initPaymentModule(app) {
  // 添加安全HTTP头
  app.use('/api/payment', helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: 'same-origin' },
    hsts: {
      maxAge: 15552000, // 180 天
      includeSubDomains: true,
      preload: true
    }
  }));
  
  // 添加支付安全头
  app.use('/api/payment', (req, res, next) => {
    // 禁止缓存敏感的支付信息
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    // 禁止在iframe中嵌入支付页面，防止点击劫持
    res.setHeader('X-Frame-Options', 'DENY');
    
    // 添加PCI-DSS推荐的安全头
    res.setHeader('X-Payment-Security', 'high');
    
    next();
  });
  
  // 添加细粒度的速率限制
  
  // 1. 创建订单限流 - 较严格
  const createOrderLimiter = createRateLimiter({
    windowMs: 60 * 1000,        // 1分钟
    max: 5,                     // 最多5个请求
    message: '创建订单请求过于频繁，请稍后再试',
    path: 'create-order'
  });
  
  // 2. 查询订单限流 - 较宽松
  const queryOrderLimiter = createRateLimiter({
    windowMs: 60 * 1000,        // 1分钟
    max: 30,                    // 最多30个请求
    message: '查询订单请求过于频繁，请稍后再试',
    path: 'query-order'
  });
  
  // 3. 退款限流 - 非常严格
  const refundLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,   // 1小时
    max: 10,                    // 最多10个请求
    message: '退款请求过于频繁，请稍后再试',
    path: 'refund'
  });
  
  // 4. 配置访问限流 - 中等
  const configLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,    // 5分钟
    max: 20,                    // 最多20个请求
    message: '配置访问过于频繁，请稍后再试',
    path: 'config'
  });
  
  // 5. 通知处理限流 - 宽松但有上限
  const notifyLimiter = createRateLimiter({
    windowMs: 60 * 1000,        // 1分钟
    max: 60,                    // 最多60个请求
    message: '通知请求过于频繁，请稍后再试',
    path: 'notify',
    skipSuccessfulRequests: true // 成功的通知不计入限制
  });
  
  // 应用路由限制器
  app.use('/api/payment/create-order', createOrderLimiter);
  app.use('/api/payment/orders/:orderId', queryOrderLimiter);
  app.use('/api/payment/orders/:orderId/refund', refundLimiter);
  app.use('/api/payment/refunds', refundLimiter);
  app.use('/api/payment/config', configLimiter);
  app.use('/api/payment/notify', notifyLimiter);
  
  // 设置密钥自动轮换任务
  let keyRotationInterval;
  
  const startKeyRotationSchedule = () => {
    // 每天检查一次密钥是否需要轮换
    keyRotationInterval = setInterval(async () => {
      try {
        logger.info('开始检查密钥过期状态');
        
        // 自动轮换7天内过期的密钥
        const rotationResults = await keyManager.autoRotateExpiringKeys(['weixin', 'zhifubao'], 7);
        
        if (rotationResults.rotated.length > 0) {
          logger.info('密钥自动轮换完成', { 
            rotated: rotationResults.rotated.length,
            failed: rotationResults.failed.length 
          });
        }
      } catch (error) {
        logger.error('密钥自动轮换失败', { error: error.message });
      }
    }, 24 * 60 * 60 * 1000); // 24小时
  };
  
  // 在应用启动时开始密钥轮换计划
  startKeyRotationSchedule();
  
  // 优雅关闭轮换任务
  app.on('shutdown', () => {
    if (keyRotationInterval) {
      clearInterval(keyRotationInterval);
      logger.info('密钥轮换计划已停止');
    }
  });
  
  // 设置日志清理任务
  let logCleanupInterval;
  
  const startLogCleanupSchedule = () => {
    // 每周清理一次日志
    logCleanupInterval = setInterval(async () => {
      try {
        logger.info('开始清理敏感支付日志');
        
        // 获取日志文件列表
        const logDir = config.logging?.logDir || 'logs';
        const fs = require('fs').promises;
        const path = require('path');
        
        // 获取所有日志文件
        const files = await fs.readdir(logDir);
        
        // 筛选出支付相关日志
        const paymentLogs = files.filter(file => 
          file.includes('payment') && file.endsWith('.log')
        );
        
        // 设置日志保留期限（30天）
        const retention = 30 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        let deletedCount = 0;
        
        // 清理过期日志
        for (const logFile of paymentLogs) {
          const logPath = path.join(logDir, logFile);
          const stats = await fs.stat(logPath);
          
          // 检查文件年龄
          const fileAge = now - stats.mtime.getTime();
          
          if (fileAge > retention) {
            await fs.unlink(logPath);
            deletedCount++;
          }
        }
        
        if (deletedCount > 0) {
          logger.info('支付日志清理完成', { deletedCount });
        }
      } catch (error) {
        logger.error('支付日志清理失败', { error: error.message });
      }
    }, 7 * 24 * 60 * 60 * 1000); // 7天
  };
  
  // 在应用启动时开始日志清理计划
  startLogCleanupSchedule();
  
  // 优雅关闭日志清理任务
  app.on('shutdown', () => {
    if (logCleanupInterval) {
      clearInterval(logCleanupInterval);
      logger.info('日志清理计划已停止');
    }
  });
  
  // 添加支付模块错误处理中间件
  app.use('/api/payment', (err, req, res, next) => {
    // 安全地记录错误，移除敏感信息
    const safeError = {
      message: err.message,
      path: req.path,
      method: req.method,
      ip: req.ip,
      timestamp: new Date().toISOString()
    };
    
    // 从错误栈中移除敏感信息（如目录结构）
    if (err.stack) {
      const sanitizedStack = err.stack
        .split('\n')
        .map(line => {
          // 移除完整路径信息
          return line.replace(/\(.*[\\/]([^\\/]+)\.js:(\d+):(\d+)\)/, '($1.js:$2:$3)')
                   .replace(/at .*[\\/]([^\\/]+)\.js:(\d+):(\d+)/, 'at $1.js:$2:$3');
        })
        .join('\n');
      
      safeError.stack = sanitizedStack;
    }
    
    // 记录错误但隐藏敏感信息
    logger.error('支付模块错误', safeError);
    
    // 根据环境返回适当的错误信息
    const isProduction = process.env.NODE_ENV === 'production';
    
    // 安全地返回错误
    return res.status(err.status || 500).json({
      success: false,
      message: isProduction ? '处理支付请求时出错' : err.message,
      code: err.code || 'PAYMENT_ERROR',
      requestId: req.id
    });
  });
  
  // 添加支付域隔离中间件
  app.use('/api/payment', (req, res, next) => {
    // 设置严格的CSP，仅允许同源资源
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'"
    );
    
    // 防止点击劫持
    res.setHeader('X-Frame-Options', 'DENY');
    
    // 禁止MIME类型嗅探
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // 跨域资源策略
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    
    // 跨源隔离
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    
    // 跨源嵌入策略
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    
    next();
  });
  
  // 注册路由
  app.use('/api/payment', paymentRoutes);
  app.use('/api/payment/config', configRoutes);
  
  // 在开发环境启用循环依赖检测
  if (process.env.NODE_ENV !== 'production') {
    const { 
      initCircularDependencyDetector,
      exportDependencyGraph
    } = require('./utils/circularDependencyDetector');
    
    // 初始化循环依赖检测器
    initCircularDependencyDetector({
      ignorePaths: ['node_modules', 'test'],
      ignorePackages: ['express', 'mongoose', 'winston']
    });
    
    // 导出依赖图
    process.on('SIGINT', () => {
      exportDependencyGraph('payment-dependency-graph.json');
      process.exit(0);
    });
  }
  
  // 返回支付模块API
  return {
    createPayment: PaymentFactory.createPayment,
    getAvailableProviders: PaymentFactory.getAvailableProviders,
    keyManager,
    startKeyRotationSchedule,  // 导出启动函数，允许手动控制
    stopKeyRotationSchedule: () => {
      if (keyRotationInterval) {
        clearInterval(keyRotationInterval);
        keyRotationInterval = null;
        return true;
      }
      return false;
    }
  };
}

module.exports = initPaymentModule; 