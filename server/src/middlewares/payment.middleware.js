/**
 * 支付安全中间件
 * 用于保护支付相关API和校验支付回调
 */

const config = require('../config');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const { isValidIP } = require('../utils/ip-utils');

// 创建IP限制器
const ipLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100次请求
  message: '请求过于频繁，请稍后再试',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * 验证支付网关请求来源IP
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件函数
 */
exports.verifyPaymentSource = (req, res, next) => {
  // 从配置中获取支付网关IP白名单
  const allowedIPs = config.payment.gatewayIPs || [];
  
  // 获取客户端IP
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // 开发环境跳过验证（可选）
  if (process.env.NODE_ENV === 'development' && !allowedIPs.length) {
    console.warn('开发环境跳过支付网关IP验证');
    return next();
  }
  
  // 验证IP是否在白名单中
  if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
    console.error(`未授权的支付回调请求来源: ${clientIP}`);
    return res.status(403).json({
      success: false,
      message: '未授权的请求来源'
    });
  }
  
  // 继续处理请求
  next();
};

/**
 * 验证支付回调请求时间窗口
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件函数
 */
exports.verifyPaymentTimestamp = (req, res, next) => {
  const { timestamp } = req.body;
  
  if (!timestamp) {
    return res.status(400).json({
      success: false,
      message: '缺少时间戳参数'
    });
  }
  
  // 验证时间戳在有效期内（默认5分钟）
  const maxAgeMs = 5 * 60 * 1000; // 5分钟
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  
  if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAgeMs) {
    return res.status(400).json({
      success: false,
      message: '请求已过期或时间戳无效'
    });
  }
  
  next();
};

/**
 * 验证支付回调来源IP
 */
exports.verifyCallbackSource = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // 验证IP格式
  if (!isValidIP(clientIP)) {
    logger.warn('无效的IP地址格式', { ip: clientIP });
    return res.status(400).json({
      success: false,
      message: '无效的请求来源'
    });
  }
  
  const allowedIPs = config.payment.allowedCallbackIPs || [];
  
  // 验证IP白名单
  if (!allowedIPs.includes(clientIP)) {
    logger.warn('未授权的支付回调请求来源', {
      ip: clientIP,
      path: req.path,
      method: req.method,
      headers: JSON.stringify(req.headers)
    });
    
    return res.status(403).json({
      success: false,
      message: '未授权的请求来源'
    });
  }
  
  next();
};

/**
 * 验证支付请求频率
 */
exports.verifyPaymentRate = (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: '未授权的访问'
    });
  }
  
  const now = Date.now();
  const minInterval = config.payment.minRequestInterval || 1000;
  
  // 使用 Redis 或其他分布式存储来跟踪请求频率
  const lastPaymentTime = req.app.locals.paymentRequests?.get(userId) || 0;
  
  if (now - lastPaymentTime < minInterval) {
    logger.warn('支付请求频率过高', {
      userId,
      interval: now - lastPaymentTime,
      minInterval,
      ip: req.ip
    });
    
    return res.status(429).json({
      success: false,
      message: '请求过于频繁，请稍后再试',
      retryAfter: Math.ceil((minInterval - (now - lastPaymentTime)) / 1000)
    });
  }
  
  if (!req.app.locals.paymentRequests) {
    req.app.locals.paymentRequests = new Map();
  }
  req.app.locals.paymentRequests.set(userId, now);
  
  // 应用IP限制
  ipLimiter(req, res, next);
};

/**
 * 验证支付金额
 */
exports.verifyPaymentAmount = (req, res, next) => {
  const { amount } = req.body;
  
  // 验证金额格式
  if (typeof amount !== 'number' || isNaN(amount)) {
    return res.status(400).json({
      success: false,
      message: '无效的支付金额格式'
    });
  }
  
  const minAmount = config.payment.minAmount || 0.01;
  const maxAmount = config.payment.maxAmount || 100000;
  
  // 验证金额范围
  if (amount < minAmount || amount > maxAmount) {
    logger.warn('无效的支付金额', {
      amount,
      minAmount,
      maxAmount,
      userId: req.user?.id,
      ip: req.ip
    });
    
    return res.status(400).json({
      success: false,
      message: `支付金额必须在 ${minAmount} 和 ${maxAmount} 之间`
    });
  }
  
  // 验证金额精度
  const decimalPlaces = (amount.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    return res.status(400).json({
      success: false,
      message: '支付金额最多支持两位小数'
    });
  }
  
  next();
};

/**
 * 验证支付签名
 */
exports.verifyPaymentSignature = (req, res, next) => {
  const { signature, timestamp, ...params } = req.body;
  
  if (!signature || !timestamp) {
    return res.status(400).json({
      success: false,
      message: '缺少必要的签名参数'
    });
  }
  
  // 验证时间戳
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  const maxAge = config.payment.signatureMaxAge || 300000; // 5分钟
  
  if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAge) {
    return res.status(400).json({
      success: false,
      message: '请求已过期'
    });
  }
  
  // 验证签名
  try {
    const expectedSignature = generatePaymentSignature(params, config.payment.secret);
    if (signature !== expectedSignature) {
      logger.warn('支付签名验证失败', {
        params: JSON.stringify(params),
        expectedSignature,
        receivedSignature: signature
      });
      
      return res.status(400).json({
        success: false,
        message: '无效的支付签名'
      });
    }
    
    next();
  } catch (error) {
    logger.error('支付签名验证错误', { error: error.message });
    return res.status(500).json({
      success: false,
      message: '签名验证失败'
    });
  }
}; 