/**
 * 支付网关控制器
 * 处理游戏内购买和支付功能
 */

const crypto = require('crypto');
const User = require('../models/user.model');
const Payment = require('../models/payment.model');
const Shop = require('../models/shop.model');
const config = require('../config');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { verifyPaymentSignature } = require('../utils/payment-utils');

/**
 * 创建支付订单
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.createOrder = async (req, res) => {
  try {
    const { productId, paymentMethod } = req.body;
    const userId = req.user._id;
    
    // 输入验证
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: '无效的商品ID格式'
      });
    }
    
    // 验证必填字段
    if (!productId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: '商品ID和支付方式为必填项'
      });
    }
    
    // 使用常量进行比较，避免直接使用字符串
    const validPaymentMethods = Object.freeze(config.payment.channels);
    if (!Object.values(validPaymentMethods).includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: '无效的支付方式'
      });
    }
    
    // 添加事务支持
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // 查找商品（在事务中）
      const product = await Shop.findById(productId).session(session);
      
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: '商品不存在'
        });
      }
      
      if (!product.isAvailable) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: '该商品当前不可购买'
        });
      }
      
      // 生成订单号（添加前缀和校验）
      const orderId = generateOrderId(userId);
      
      // 创建支付订单（在事务中）
      const payment = new Payment({
        orderId,
        userId,
        productId,
        amount: product.price,
        currency: config.payment.defaultCurrency,
        paymentMethod,
        status: 'pending',
        description: `购买 ${product.name}`,
        productDetails: {
          name: product.name,
          description: product.description,
          category: product.category
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      await payment.save({ session });
      
      // 生成支付签名（使用更安全的方法）
      const timestamp = Date.now().toString();
      const nonce = crypto.randomBytes(16).toString('hex');
      
      const signature = generatePaymentSignature({
        orderId,
        amount: product.price,
        userId: userId.toString(),
        productId,
        timestamp,
        nonce
      }, config.payment.secret);
      
      // 构建支付网关请求参数（移除敏感信息）
      const gatewayParams = {
        orderId,
        amount: product.price,
        currency: config.payment.defaultCurrency,
        productName: product.name,
        paymentMethod,
        redirectUrl: config.payment.callbackUrl,
        notifyUrl: `${config.payment.callbackUrl}/notify`,
        timestamp,
        nonce,
        signature
      };
      
      await session.commitTransaction();
      
      // 返回支付信息（不暴露敏感信息）
      res.status(200).json({
        success: true,
        message: '支付订单创建成功',
        orderInfo: {
          orderId,
          amount: product.price,
          currency: config.payment.defaultCurrency,
          productName: product.name,
          paymentMethod,
          status: 'pending',
          createdAt: payment.createdAt
        },
        paymentUrl: await generatePaymentUrl(gatewayParams)
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error('创建支付订单失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      productId: req.body.productId
    });
    
    res.status(500).json({
      success: false,
      message: '创建支付订单失败，请稍后再试',
      error: config.server.env === 'development' ? error.message : undefined
    });
  }
};

/**
 * 处理支付回调通知
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.handlePaymentCallback = async (req, res) => {
  try {
    const { orderId, amount, userId, timestamp, signature } = req.body;
    
    // 验证签名
    const isValidSignature = verifyPaymentSignature(req.body);
    if (!isValidSignature) {
      logger.error('支付回调签名验证失败', { orderId, amount, userId });
      return res.status(400).json({
        success: false,
        message: '签名验证失败'
      });
    }
    
    // 查找订单
    const payment = await Payment.findById(orderId);
    if (!payment) {
      logger.error('支付回调：未找到订单', { orderId });
      return res.status(404).json({
        success: false,
        message: '未找到订单'
      });
    }
    
    // 验证金额
    if (payment.amount !== amount) {
      logger.error('支付回调：订单金额不匹配', {
        orderId,
        expectedAmount: payment.amount,
        actualAmount: amount
      });
      return res.status(400).json({
        success: false,
        message: '订单金额不匹配'
      });
    }
    
    // 验证用户
    if (payment.userId.toString() !== userId) {
      logger.error('支付回调：用户ID不匹配', {
        orderId,
        expectedUserId: payment.userId,
        actualUserId: userId
      });
      return res.status(400).json({
        success: false,
        message: '用户ID不匹配'
      });
    }
    
    // 更新订单状态
    payment.status = 'completed';
    payment.completedAt = new Date();
    await payment.save();
    
    logger.info('支付回调处理成功', {
      orderId,
      userId,
      amount
    });
    
    res.status(200).json({
      success: true,
      message: '支付成功'
    });
  } catch (error) {
    logger.error('处理支付回调失败', {
      error: error.message,
      stack: error.stack,
      orderId: req.body.orderId
    });
    
    res.status(500).json({
      success: false,
      message: '处理支付回调失败',
      error: config.server.env === 'development' ? error.message : undefined
    });
  }
};

/**
 * 查询支付订单状态
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.queryOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;
    
    // 查找订单
    const payment = await Payment.findOne({ orderId });
    
    // 检查订单是否存在
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }
    
    // 检查订单是否属于当前用户
    if (payment.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: '无权查看此订单'
      });
    }
    
    // 返回订单信息
    res.status(200).json({
      success: true,
      order: {
        orderId: payment.orderId,
        status: payment.status,
        statusMessage: payment.statusMessage,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        description: payment.description,
        createdAt: payment.createdAt,
        completedAt: payment.completedAt
      }
    });
  } catch (error) {
    console.error('查询订单状态错误:', error);
    res.status(500).json({
      success: false,
      message: '查询订单状态失败，请稍后再试',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取用户支付订单历史
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.getOrderHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // 分页参数
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // 筛选参数
    const filters = { userId };
    
    // 按状态筛选
    if (req.query.status) {
      filters.status = req.query.status;
    }
    
    // 查询总数
    const total = await Payment.countDocuments(filters);
    
    // 查询数据
    const orders = await Payment.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('productId', 'name description price');
    
    // 返回响应
    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: orders.map(order => ({
        orderId: order.orderId,
        status: order.status,
        statusMessage: order.statusMessage,
        amount: order.amount,
        currency: order.currency,
        paymentMethod: order.paymentMethod,
        description: order.description,
        product: order.productId,
        createdAt: order.createdAt,
        completedAt: order.completedAt
      }))
    });
  } catch (error) {
    console.error('获取订单历史错误:', error);
    res.status(500).json({
      success: false,
      message: '获取订单历史失败，请稍后再试',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 辅助函数

/**
 * 生成订单ID
 * @param {String} userId - 用户ID
 * @returns {String} 订单ID
 */
function generateOrderId(userId) {
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(4).toString('hex');
  const userPrefix = userId.toString().slice(-4);
  const checksum = crypto
    .createHash('sha256')
    .update(`${timestamp}${random}${userPrefix}${config.payment.secret}`)
    .digest('hex')
    .slice(0, 4);
    
  return `ORD${timestamp}${userPrefix}${random}${checksum}`;
}

/**
 * 生成支付签名 - 增强版
 * @param {Object} params - 支付参数
 * @param {String} secret - 密钥
 * @returns {String} 支付签名
 */
function generatePaymentSignature(params, secret) {
  // 按字母顺序排列参数，防止参数顺序混淆
  const stringToSign = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  // 使用HMAC替代简单哈希提升安全性
  return crypto.createHmac('sha256', secret)
    .update(stringToSign)
    .digest('hex');
}

/**
 * 生成支付URL（异步，支持验证）
 */
async function generatePaymentUrl(params) {
  // 在实际应用中，这里应该调用支付网关的API
  // 这里仅作示例
  const baseUrl = config.payment.gatewayUrl;
  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  
  // 添加请求超时和验证
  try {
    const url = `${baseUrl}?${queryString}`;
    await validatePaymentUrl(url);
    return url;
  } catch (error) {
    logger.error('生成支付URL失败', { error: error.message });
    throw new Error('生成支付链接失败');
  }
}

/**
 * 验证支付URL
 */
async function validatePaymentUrl(url) {
  try {
    const parsedUrl = new URL(url);
    
    // 验证URL协议
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
      throw new Error('无效的支付URL协议');
    }
    
    // 验证域名白名单
    const allowedDomains = config.payment.allowedDomains || [];
    if (!allowedDomains.includes(parsedUrl.hostname)) {
      throw new Error('未授权的支付网关域名');
    }
    
    return true;
  } catch (error) {
    logger.error('支付URL验证失败', { error: error.message });
    throw new Error('无效的支付URL');
  }
} 