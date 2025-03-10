/**
 * 支付通知处理控制器
 * 处理支付回调通知
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const PaymentFactory = require('../core/PaymentFactory');
const PaymentTransaction = require('../models/PaymentTransaction');
const PaymentConfig = require('../models/PaymentConfig');
const User = require('../../models/user.model');
const logger = require('../../utils/logger');

// 导入支付处理控制器以使用商品发放函数
const paymentController = require('./paymentController');

// 使用Redis或内存缓存存储已处理的通知
// 这里使用内存实现，生产环境建议使用Redis
const processedNotifications = new Map();

/**
 * 生成通知唯一标识
 * @param {String} provider - 支付提供商
 * @param {String} tradeNo - 交易号
 * @param {String} outTradeNo - 商户订单号
 * @returns {String} 唯一标识
 */
function generateNotificationId(provider, tradeNo, outTradeNo) {
  return crypto
    .createHash('md5')
    .update(`${provider}:${tradeNo || ''}:${outTradeNo || ''}:${Date.now()}`)
    .digest('hex');
}

/**
 * 检查通知是否已处理（防重放）
 * @param {String} notificationId - 通知唯一标识
 * @returns {Boolean} 是否已处理
 */
function isNotificationProcessed(notificationId) {
  return processedNotifications.has(notificationId);
}

/**
 * 标记通知已处理
 * @param {String} notificationId - 通知唯一标识
 * @param {Number} expireTime - 过期时间（毫秒）
 */
function markNotificationProcessed(notificationId, expireTime = 24 * 60 * 60 * 1000) {
  processedNotifications.set(notificationId, Date.now());
  
  // 设置过期时间，避免内存泄漏
  setTimeout(() => {
    processedNotifications.delete(notificationId);
  }, expireTime);
}

/**
 * 清理过期通知记录
 */
function cleanExpiredNotifications() {
  const now = Date.now();
  const expireTime = 24 * 60 * 60 * 1000; // 24小时
  
  for (const [id, timestamp] of processedNotifications.entries()) {
    if (now - timestamp > expireTime) {
      processedNotifications.delete(id);
    }
  }
}

// 定期清理过期通知
setInterval(cleanExpiredNotifications, 60 * 60 * 1000); // 每小时清理一次

/**
 * 处理微信支付回调通知
 */
exports.handleWeixinNotify = async (req, res) => {
  try {
    // 获取原始XML数据
    const xmlData = req.body;
    
    logger.info('收到微信支付回调', { 
      timestamp: new Date().toISOString() 
    });
    
    // 创建微信支付处理器
    const payment = await PaymentFactory.createPayment('weixin');
    
    // 验证通知数据
    const verifyResult = await payment.verifyNotification(xmlData);
    
    if (!verifyResult.success) {
      logger.error('微信支付回调验证失败', { 
        error: verifyResult.errorMessage 
      });
      
      return res.send(payment.generateFailResponse('验证失败'));
    }
    
    // 获取订单信息
    const { outTradeNo, transactionId, totalFee, isSuccess } = verifyResult;
    
    // 防重放攻击检查
    const notificationId = generateNotificationId('weixin', transactionId, outTradeNo);
    if (isNotificationProcessed(notificationId)) {
      logger.warn('重复的微信支付回调', { 
        outTradeNo, 
        transactionId,
        notificationId
      });
      
      // 对于重复通知，仍返回成功避免微信重试
      return res.send(payment.generateSuccessResponse());
    }
    
    if (!isSuccess) {
      logger.warn('微信支付失败通知', { 
        outTradeNo, 
        transactionId
      });
      
      return res.send(payment.generateSuccessResponse());
    }
    
    // 查询订单记录
    const transaction = await PaymentTransaction.findOne({ orderId: outTradeNo });
    
    if (!transaction) {
      logger.error('微信支付回调：未找到订单', { 
        outTradeNo, 
        transactionId 
      });
      
      return res.send(payment.generateSuccessResponse());
    }
    
    // 检查订单状态
    if (transaction.status === 'success' || transaction.status === 'refunded') {
      logger.info('微信支付回调：订单已处理', { 
        outTradeNo,
        transactionId, 
        status: transaction.status 
      });
      
      // 标记通知已处理
      markNotificationProcessed(notificationId);
      
      return res.send(payment.generateSuccessResponse());
    }
    
    // 验证订单金额（分转换为元）
    if (Math.abs(transaction.amount - totalFee) > 0.01) {
      logger.error('微信支付回调：订单金额不匹配', {
        outTradeNo,
        expectedAmount: transaction.amount,
        receivedAmount: totalFee
      });
      
      return res.send(payment.generateFailResponse('订单金额不匹配'));
    }
    
    // 添加支付渠道信息验证
    if (transaction.provider !== 'weixin') {
      logger.error('微信支付回调：支付渠道不匹配', {
        outTradeNo,
        expectedProvider: transaction.provider,
        receivedProvider: 'weixin'
      });
      
      return res.send(payment.generateFailResponse('支付渠道不匹配'));
    }
    
    // 使用事务处理
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // 更新交易状态
      transaction.status = 'success';
      transaction.statusMessage = '支付成功';
      transaction.transactionId = transactionId;
      transaction.payTime = verifyResult.payTime || new Date();
      transaction.rawData = verifyResult.rawData;
      transaction.notifyCount = (transaction.notifyCount || 0) + 1;
      transaction.lastNotifyTime = new Date();
      
      await transaction.save({ session });
      
      // 处理商品发放
      await handleProductDelivery(
        transaction.userId, 
        transaction.productId, 
        transaction.productDetail.quantity, 
        session
      );
      
      await session.commitTransaction();
      
      // 标记通知已处理
      markNotificationProcessed(notificationId);
      
      logger.info('微信支付回调处理成功', {
        outTradeNo,
        transactionId,
        userId: transaction.userId
      });
      
      return res.send(payment.generateSuccessResponse());
    } catch (error) {
      await session.abortTransaction();
      
      logger.error('微信支付回调处理失败', {
        outTradeNo,
        transactionId,
        error: error.message,
        stack: error.stack
      });
      
      return res.send(payment.generateFailResponse('处理失败'));
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error('处理微信支付回调异常', {
      error: error.message,
      stack: error.stack
    });
    
    // 返回失败响应
    try {
      const payment = await PaymentFactory.createPayment('weixin');
      return res.send(payment.generateFailResponse('系统异常'));
    } catch (innerError) {
      return res.status(500).send('系统异常');
    }
  }
};

/**
 * 处理支付宝回调通知
 */
exports.handleZhifubaoNotify = async (req, res) => {
  try {
    // 获取表单格式的通知数据
    const notifyData = req.body;
    
    logger.info('收到支付宝回调', { 
      outTradeNo: notifyData.out_trade_no,
      timestamp: new Date().toISOString()
    });
    
    // 创建支付宝支付处理器
    const payment = await PaymentFactory.createPayment('zhifubao');
    
    // 验证通知数据
    const verifyResult = await payment.verifyNotification(notifyData);
    
    if (!verifyResult.success) {
      logger.error('支付宝回调验证失败', { 
        error: verifyResult.errorMessage 
      });
      
      return res.send(payment.generateFailResponse());
    }
    
    // 获取订单信息
    const { outTradeNo, tradeNo, totalAmount, isSuccess, tradeStatus } = verifyResult;
    
    // 只处理交易成功或交易完成的通知
    if (!isSuccess) {
      logger.warn('支付宝支付未成功通知', { 
        outTradeNo, 
        tradeNo, 
        tradeStatus 
      });
      
      return res.send(payment.generateSuccessResponse());
    }
    
    // 查询订单记录
    const transaction = await PaymentTransaction.findOne({ orderId: outTradeNo });
    
    if (!transaction) {
      logger.error('支付宝回调：未找到订单', { 
        outTradeNo, 
        tradeNo 
      });
      
      return res.send(payment.generateSuccessResponse());
    }
    
    // 检查订单状态
    if (transaction.status === 'success' || transaction.status === 'refunded') {
      logger.info('支付宝回调：订单已处理', { 
        outTradeNo,
        tradeNo, 
        status: transaction.status 
      });
      
      return res.send(payment.generateSuccessResponse());
    }
    
    // 验证订单金额
    if (Math.abs(transaction.amount - totalAmount) > 0.01) {
      logger.error('支付宝回调：订单金额不匹配', {
        outTradeNo,
        expectedAmount: transaction.amount,
        receivedAmount: totalAmount
      });
      
      return res.send(payment.generateFailResponse());
    }
    
    // 使用事务处理
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // 更新交易状态
      transaction.status = 'success';
      transaction.statusMessage = '支付成功';
      transaction.transactionId = tradeNo;
      transaction.payTime = verifyResult.payTime || new Date();
      transaction.rawData = verifyResult.rawData;
      transaction.notifyCount = (transaction.notifyCount || 0) + 1;
      transaction.lastNotifyTime = new Date();
      
      await transaction.save({ session });
      
      // 处理商品发放
      await handleProductDelivery(
        transaction.userId, 
        transaction.productId, 
        transaction.productDetail.quantity, 
        session
      );
      
      await session.commitTransaction();
      
      logger.info('支付宝回调处理成功', {
        outTradeNo,
        tradeNo,
        userId: transaction.userId
      });
      
      return res.send(payment.generateSuccessResponse());
    } catch (error) {
      await session.abortTransaction();
      
      logger.error('支付宝回调处理失败', {
        outTradeNo,
        tradeNo,
        error: error.message,
        stack: error.stack
      });
      
      return res.send(payment.generateFailResponse());
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error('处理支付宝回调异常', {
      error: error.message,
      stack: error.stack
    });
    
    // 返回失败响应
    try {
      const payment = await PaymentFactory.createPayment('zhifubao');
      return res.send(payment.generateFailResponse());
    } catch (innerError) {
      return res.status(500).send('fail');
    }
  }
};

/**
 * 处理退款通知
 */
exports.handleRefundNotify = async (req, res) => {
  // 退款通知处理逻辑（根据不同支付渠道实现）
  // 通常退款不一定会有回调通知，需要主动查询退款状态
};

/**
 * 处理商品发放（简化版，实际应从paymentController导入）
 * @private
 */
async function handleProductDelivery(userId, productId, quantity, session) {
  try {
    // 查找用户
    const user = await User.findById(userId).session(session);
    
    if (!user) {
      throw new Error(`找不到用户: ${userId}`);
    }
    
    // 查找商品
    const product = await Product.findById(productId).session(session);
    
    if (!product) {
      throw new Error(`找不到商品: ${productId}`);
    }
    
    // 根据商品类型处理不同的发放逻辑
    switch (product.type) {
      case 'diamond':
        // 发放钻石
        user.gameProfile.diamond = (user.gameProfile.diamond || 0) + (product.value * quantity);
        break;
        
      case 'gold':
        // 发放金币
        user.gameProfile.gold = (user.gameProfile.gold || 0) + (product.value * quantity);
        break;
        
      case 'vip':
        // 处理VIP会员
        if (product.vipInfo) {
          const now = new Date();
          
          // 检查是否已有VIP
          if (user.gameProfile.vip && user.gameProfile.vipExpiryDate && user.gameProfile.vipExpiryDate > now) {
            // 已有VIP，增加天数
            user.gameProfile.vipExpiryDate = new Date(
              user.gameProfile.vipExpiryDate.getTime() + 
              (product.vipInfo.durationDays * 24 * 60 * 60 * 1000 * quantity)
            );
          } else {
            // 新VIP
            user.gameProfile.vip = product.vipInfo.level;
            user.gameProfile.vipExpiryDate = new Date(
              now.getTime() + (product.vipInfo.durationDays * 24 * 60 * 60 * 1000 * quantity)
            );
          }
        }
        break;
        
      case 'item':
        // 发放道具
        if (!user.gameProfile.items) {
          user.gameProfile.items = [];
        }
        
        const existingItem = user.gameProfile.items.find(item => item.itemId === product.itemId);
        
        if (existingItem) {
          // 已有道具，增加数量
          existingItem.quantity += quantity;
        } else {
          // 新道具
          user.gameProfile.items.push({
            itemId: product.itemId,
            name: product.name,
            quantity,
            expiryDate: product.itemInfo?.expiry ? new Date(Date.now() + product.itemInfo.expiry * 1000) : null
          });
        }
        break;
        
      default:
        logger.warn('未知的商品类型', { type: product.type, productId });
    }
    
    // 更新用户累计消费金额
    user.paymentInfo = user.paymentInfo || {};
    user.paymentInfo.totalSpent = (user.paymentInfo.totalSpent || 0) + (product.price * quantity);
    
    // 保存用户信息
    await user.save({ session });
    
    logger.info('商品发放成功', {
      userId,
      productId,
      quantity,
      type: product.type
    });
    
    return true;
  } catch (error) {
    logger.error('商品发放失败', {
      error: error.message,
      stack: error.stack,
      userId,
      productId,
      quantity
    });
    
    throw error;
  }
} 