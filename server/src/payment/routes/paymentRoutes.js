/**
 * 支付处理路由
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const notifyController = require('../controllers/notifyController');
const { verifyToken } = require('../../middlewares/auth.middleware');
const { verifyPaymentRate, verifyPaymentAmount } = require('../../middlewares/payment.middleware');
const { checkPaymentRisk } = require('../../middlewares/payment-risk.middleware');
const PaymentConfig = require('../models/PaymentConfig');
const logger = require('../../utils/logger');
const validatePaymentRequest = require('../middleware/validatePaymentRequest');
const validateCallbackIP = require('../middleware/validateCallbackIP');
const replayProtection = require('../middleware/replayProtection');
const requestTimeout = require('../middleware/timeout');

// 参数验证中间件
const validateOrderId = (req, res, next) => {
  const { orderId } = req.params;
  
  // 验证订单ID格式
  if (!orderId || typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{10,50}$/.test(orderId)) {
    return res.status(400).json({
      success: false,
      message: '无效的订单ID格式'
    });
  }
  
  next();
};

const validateRefundNo = (req, res, next) => {
  const { outRefundNo } = req.params;
  
  // 验证退款单号格式
  if (!outRefundNo || typeof outRefundNo !== 'string' || !/^[a-zA-Z0-9_-]{10,50}$/.test(outRefundNo)) {
    return res.status(400).json({
      success: false,
      message: '无效的退款单号格式'
    });
  }
  
  next();
};

// 验证回调IP白名单
const validateCallbackIP = (req, res, next) => {
  // 获取IP地址
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // 获取支付网关允许的IP白名单
  // 在生产环境中应该从配置或数据库读取
  const paymentProvider = req.path.includes('weixin') ? 'weixin' : 'zhifubao';
  const getAllowedIPs = async () => {
    try {
      const config = await PaymentConfig.findOne({ 
        provider: paymentProvider,
        isActive: true 
      });
      return config?.allowedIps || [];
    } catch (error) {
      logger.error('获取支付配置失败', { error: error.message });
      return [];
    }
  };
  
  // 验证IP白名单
  getAllowedIPs().then(allowedIPs => {
    // 如果白名单为空，允许所有IP（开发环境）
    if (allowedIPs.length === 0 && process.env.NODE_ENV !== 'production') {
      logger.warn(`${paymentProvider}支付回调IP白名单为空`, { clientIP });
      return next();
    }
    
    // 严格验证IP
    if (!allowedIPs.includes(clientIP)) {
      logger.warn(`未授权的${paymentProvider}支付回调IP`, { clientIP, allowedIPs });
      return res.status(403).json({
        success: false,
        message: '未授权的请求来源'
      });
    }
    
    next();
  }).catch(error => {
    logger.error('验证回调IP失败', { error: error.message });
    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  });
};

// 支付订单相关路由
router.post('/create-order', 
  verifyToken, 
  verifyPaymentRate, 
  verifyPaymentAmount, 
  checkPaymentRisk, 
  paymentController.createOrder
);

router.get('/orders/:orderId', 
  verifyToken, 
  validateOrderId,
  paymentController.queryOrder
);

router.post('/orders/:orderId/close', 
  verifyToken, 
  validateOrderId,
  paymentController.closeOrder
);

// 退款相关路由
router.post('/orders/:orderId/refund', 
  verifyToken, 
  validateOrderId,
  paymentController.refundOrder
);

router.get('/refunds/:outRefundNo', 
  verifyToken, 
  validateRefundNo,
  paymentController.queryRefund
);

// 异步通知路由（不需要验证Token，但需要验证IP）
router.post('/notify/weixin', 
  requestTimeout(30000),
  validateCallbackIP,
  replayProtection({
    nonceField: 'out_trade_no',
    timestampField: 'time_end',
    maxAge: 600, // 10分钟
    recordTTL: 86400 // 24小时
  }),
  paymentController.handleWeixinNotify
);

router.post('/notify/zhifubao', 
  requestTimeout(30000),
  validateCallbackIP,
  replayProtection({
    nonceField: 'out_trade_no',
    timestampField: 'notify_time',
    maxAge: 600, // 10分钟
    recordTTL: 86400 // 24小时
  }),
  paymentController.handleAlipayNotify
);

// 创建支付订单 - 设置15秒超时
router.post('/create', 
  requestTimeout(15000),
  validatePaymentRequest,
  paymentController.createPayment
);

// 查询支付订单状态 - 设置10秒超时
router.get('/status/:orderId', 
  requestTimeout(10000),
  paymentController.getPaymentStatus
);

// 关闭支付订单 - 设置10秒超时
router.post('/close/:orderId', 
  requestTimeout(10000),
  paymentController.closePayment
);

module.exports = router; 