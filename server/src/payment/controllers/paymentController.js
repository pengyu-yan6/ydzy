/**
 * 支付处理控制器
 * 处理支付相关的请求
 */

const mongoose = require('mongoose');
const PaymentFactory = require('../core/PaymentFactory');
const PaymentTransaction = require('../models/PaymentTransaction');
const PaymentConfig = require('../models/PaymentConfig');
const User = require('../../models/user.model');
const Product = require('../../models/product.model');
const RefundRecord = require('../models/RefundRecord');
const logger = require('../../utils/logger');
const { generateOrderId } = require('../utils/payment-utils');

/**
 * 创建支付订单
 */
exports.createOrder = async (req, res) => {
  // 获取MongoDB会话，用于事务
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { 
      provider, productId, quantity = 1, 
      extraData, useBalance = false
    } = req.body;
    
    const userId = req.user._id;
    
    // 验证参数
    if (!provider) {
      return res.status(400).json({
        success: false,
        message: '支付提供商不能为空'
      });
    }
    
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: '商品ID不能为空'
      });
    }
    
    // 验证ObjectId格式
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: '无效的商品ID格式'
      });
    }
    
    // 获取支付配置
    const paymentConfig = await PaymentConfig.findOne({ 
      provider, 
      isActive: true 
    }).session(session);
    
    if (!paymentConfig) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `未找到有效的${provider}支付配置`
      });
    }
    
    // 获取商品信息
    const product = await Product.findById(productId).session(session);
    
    if (!product || !product.isAvailable) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: '商品不存在或不可购买'
      });
    }
    
    // 验证数量
    if (!Number.isInteger(quantity) || quantity <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: '商品数量必须是正整数'
      });
    }
    
    // 计算订单金额
    let totalAmount = product.price * quantity;
    
    // 验证订单金额是否在限制范围内
    const amountValidation = paymentConfig.validateAmount(totalAmount);
    if (!amountValidation.valid) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: amountValidation.message
      });
    }
    
    // 获取用户信息
    const user = await User.findById(userId).session(session);
    
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 检查是否使用余额支付部分金额
    let balanceAmount = 0;
    if (useBalance && user.balance > 0) {
      balanceAmount = Math.min(totalAmount, user.balance);
      totalAmount -= balanceAmount;
    }
    
    // 如果使用余额后金额为0，直接完成支付
    if (totalAmount <= 0) {
      try {
        // 扣除用户余额
        user.balance -= balanceAmount;
        await user.save({ session });
        
        // 创建支付交易记录
        const orderId = generateOrderId();
        const transaction = new PaymentTransaction({
          orderId,
          provider: 'balance',
          configId: paymentConfig._id,
          userId,
          productId,
          amount: balanceAmount,
          currency: 'CNY',
          status: 'success',
          payTime: new Date(),
          productDetail: {
            name: product.name,
            description: product.description,
            price: product.price,
            quantity
          },
          clientIp: req.ip,
          userAgent: req.headers['user-agent'],
          extraData: extraData || {}
        });
        
        await transaction.save({ session });
        
        // 处理商品发放
        await handleProductDelivery(userId, productId, quantity, session);
        
        await session.commitTransaction();
        session.endSession();
        
        return res.status(200).json({
          success: true,
          message: '余额支付成功',
          data: {
            orderId,
            amount: balanceAmount,
            status: 'success',
            payTime: new Date()
          }
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
      }
    }
    
    // 创建第三方支付订单
    const orderId = generateOrderId();
    
    // 创建支付交易记录
    const transaction = new PaymentTransaction({
      orderId,
      outTradeNo: orderId,
      provider,
      configId: paymentConfig._id,
      userId,
      productId,
      amount: totalAmount,
      currency: 'CNY',
      status: 'pending',
      productDetail: {
        name: product.name,
        description: product.description,
        price: product.price,
        quantity
      },
      clientIp: req.ip,
      userAgent: req.headers['user-agent'],
      notifyUrl: paymentConfig.notifyUrl,
      extraData: {
        ...extraData,
        balanceAmount,
        originalAmount: product.price * quantity
      }
    });
    
    await transaction.save({ session });
    
    // 计算手续费
    const feeAmount = paymentConfig.calculateFee(totalAmount);
    
    try {
      // 创建支付处理器
      const payment = await PaymentFactory.createPayment(provider);
      
      // 构造支付参数
      const orderData = {
        outTradeNo: orderId,
        subject: product.name,
        body: product.description,
        totalAmount,
        totalFee: totalAmount, // 微信支付使用
        clientIp: req.ip,
        notifyUrl: paymentConfig.notifyUrl,
        returnUrl: req.body.returnUrl || paymentConfig.config.returnUrl
      };
      
      // 根据不同支付方式添加额外参数
      if (provider === 'weixin') {
        orderData.tradeType = req.body.tradeType || 'NATIVE';
        orderData.productId = productId;
      } else if (provider === 'zhifubao') {
        orderData.qrCode = req.body.qrCode || false;
      }
      
      // 调用支付接口
      const paymentResult = await payment.createOrder(orderData);
      
      if (!paymentResult.success) {
        // 更新交易状态
        transaction.status = 'failed';
        transaction.statusMessage = paymentResult.errorMessage;
        await transaction.save({ session });
        
        await session.commitTransaction();
        session.endSession();
        
        return res.status(400).json({
          success: false,
          message: '创建支付订单失败',
          error: paymentResult.errorMessage
        });
      }
      
      // 更新交易信息
      transaction.transactionId = paymentResult.tradeNo || null;
      transaction.paymentUrl = paymentResult.paymentUrl || null;
      transaction.extraData = {
        ...transaction.extraData,
        codeUrl: paymentResult.qrCode || null,
        prepayId: paymentResult.prepayId || null
      };
      transaction.rawData = paymentResult.rawData;
      
      await transaction.save({ session });
      
      // 提交事务
      await session.commitTransaction();
      session.endSession();
      
      return res.status(200).json({
        success: true,
        message: '支付订单创建成功',
        data: {
          orderId,
          amount: totalAmount,
          feeAmount,
          currency: 'CNY',
          paymentUrl: paymentResult.paymentUrl,
          qrCode: paymentResult.qrCode,
          paymentParams: paymentResult.paymentParams,
          balanceAmount,
          provider
        }
      });
    } catch (error) {
      // 回滚事务
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    // 确保回滚事务
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    
    logger.error('创建支付订单失败', {
      error: error.message,
      stack: error.stack,
      user: req.user._id,
      productId: req.body.productId
    });
    
    return res.status(500).json({
      success: false,
      message: '创建支付订单失败',
      error: error.message
    });
  }
};

/**
 * 验证资源所有权
 * @private
 */
async function verifyResourceOwnership(resourceId, userId, resourceType, req) {
  // 管理员可以访问所有资源
  if (req.user && req.user.role === 'admin') {
    return true;
  }
  
  // 转换为字符串进行比较
  const resourceUserId = String(resourceId);
  const requestUserId = String(userId);
  
  // 严格比较用户ID
  if (resourceUserId !== requestUserId) {
    logger.warn('资源所有权验证失败', {
      resourceType,
      resourceUserId,
      requestUserId,
      ip: req.ip
    });
    
    // 记录可能的权限提升尝试
    if (req.app.locals.securityEvents) {
      req.app.locals.securityEvents.push({
        type: 'AUTH_VIOLATION',
        timestamp: new Date(),
        userId: requestUserId,
        ip: req.ip,
        resourceType,
        resourceId: resourceId
      });
    }
    
    return false;
  }
  
  return true;
}

/**
 * 查询订单状态
 */
exports.queryOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // 验证权限
    const transaction = await PaymentTransaction.findOne({ orderId });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }
    
    // 使用增强的权限验证
    const hasAccess = await verifyResourceOwnership(
      transaction.userId.toString(),
      req.user._id.toString(),
      'payment_transaction',
      req
    );
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: '无权查询此订单'
      });
    }
    
    // 如果状态已经是成功或失败，直接返回
    if (transaction.status === 'success' || transaction.status === 'failed' || 
        transaction.status === 'refunded' || transaction.status === 'cancelled') {
      return res.status(200).json({
        success: true,
        data: {
          orderId: transaction.orderId,
          status: transaction.status,
          statusMessage: transaction.statusMessage,
          amount: transaction.amount,
          payTime: transaction.payTime,
          provider: transaction.provider
        }
      });
    }
    
    // 查询第三方支付状态
    const payment = await PaymentFactory.createPayment(transaction.provider);
    const queryResult = await payment.queryOrder(transaction.outTradeNo || transaction.orderId);
    
    if (!queryResult.success) {
      return res.status(200).json({
        success: true,
        data: {
          orderId: transaction.orderId,
          status: transaction.status,
          statusMessage: '支付处理中',
          provider: transaction.provider
        }
      });
    }
    
    // 判断支付状态
    let status = transaction.status;
    let statusMessage = '';
    
    if (transaction.provider === 'weixin') {
      if (queryResult.tradeState === 'SUCCESS') {
        status = 'success';
        statusMessage = '支付成功';
      } else if (queryResult.tradeState === 'REFUND') {
        status = 'refunded';
        statusMessage = '已退款';
      } else if (queryResult.tradeState === 'NOTPAY') {
        status = 'pending';
        statusMessage = '待支付';
      } else if (queryResult.tradeState === 'CLOSED') {
        status = 'cancelled';
        statusMessage = '已关闭';
      } else if (queryResult.tradeState === 'USERPAYING') {
        status = 'processing';
        statusMessage = '支付处理中';
      } else if (queryResult.tradeState === 'PAYERROR') {
        status = 'failed';
        statusMessage = '支付失败';
      }
    } else if (transaction.provider === 'zhifubao') {
      if (queryResult.tradeStatus === 'TRADE_SUCCESS' || queryResult.tradeStatus === 'TRADE_FINISHED') {
        status = 'success';
        statusMessage = '支付成功';
      } else if (queryResult.tradeStatus === 'WAIT_BUYER_PAY') {
        status = 'pending';
        statusMessage = '待支付';
      } else if (queryResult.tradeStatus === 'TRADE_CLOSED') {
        status = 'cancelled';
        statusMessage = '已关闭';
      }
    }
    
    // 如果状态有变化且变成了成功，处理商品发放
    if (status === 'success' && transaction.status !== 'success') {
      // 使用事务处理
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // 更新交易状态
        transaction.status = status;
        transaction.statusMessage = statusMessage;
        transaction.payTime = queryResult.payTime || new Date();
        transaction.transactionId = queryResult.transactionId || transaction.transactionId;
        transaction.rawData = queryResult.rawData;
        
        await transaction.save({ session });
        
        // 处理商品发放
        await handleProductDelivery(
          transaction.userId, 
          transaction.productId, 
          transaction.productDetail.quantity, 
          session
        );
        
        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } else if (status !== transaction.status) {
      // 只更新状态
      await PaymentTransaction.findByIdAndUpdate(transaction._id, {
        $set: {
          status,
          statusMessage,
          transactionId: queryResult.transactionId || transaction.transactionId,
          rawData: queryResult.rawData
        }
      });
    }
    
    return res.status(200).json({
      success: true,
      data: {
        orderId: transaction.orderId,
        status,
        statusMessage,
        amount: transaction.amount,
        payTime: queryResult.payTime || transaction.payTime,
        provider: transaction.provider,
        rawData: queryResult.rawData
      }
    });
  } catch (error) {
    logger.error('查询订单状态失败', {
      error: error.message,
      stack: error.stack,
      orderId: req.params.orderId
    });
    
    return res.status(500).json({
      success: false,
      message: '查询订单状态失败',
      error: error.message
    });
  }
};

/**
 * 关闭订单
 */
exports.closeOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // 验证权限
    const transaction = await PaymentTransaction.findOne({ orderId });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }
    
    // 检查是否是自己的订单或管理员
    if (transaction.userId.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '无权关闭此订单'
      });
    }
    
    // 检查订单状态是否可关闭
    if (transaction.status !== 'pending' && transaction.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: `订单状态为${transaction.status}，无法关闭`
      });
    }
    
    // 调用支付接口关闭订单
    const payment = await PaymentFactory.createPayment(transaction.provider);
    const closeResult = await payment.closeOrder(transaction.outTradeNo || transaction.orderId);
    
    if (!closeResult.success) {
      return res.status(400).json({
        success: false,
        message: '关闭订单失败',
        error: closeResult.errorMessage
      });
    }
    
    // 更新交易状态
    await PaymentTransaction.findByIdAndUpdate(transaction._id, {
      $set: {
        status: 'cancelled',
        statusMessage: '用户取消订单',
        rawData: closeResult.rawData
      }
    });
    
    return res.status(200).json({
      success: true,
      message: '订单已关闭',
      data: {
        orderId: transaction.orderId,
        status: 'cancelled'
      }
    });
  } catch (error) {
    logger.error('关闭订单失败', {
      error: error.message,
      stack: error.stack,
      orderId: req.params.orderId
    });
    
    return res.status(500).json({
      success: false,
      message: '关闭订单失败',
      error: error.message
    });
  }
};

/**
 * 申请退款
 */
exports.refundOrder = async (req, res) => {
  // 创建一个分布式锁标识
  const lockKey = `refund:${req.params.orderId}`;
  
  // 尝试获取分布式锁（在生产环境中应该使用Redis实现）
  if (req.app.locals.locks && req.app.locals.locks.has(lockKey)) {
    return res.status(409).json({
      success: false,
      message: '该订单正在处理退款，请稍后再试'
    });
  }
  
  // 设置锁
  if (!req.app.locals.locks) {
    req.app.locals.locks = new Map();
  }
  
  req.app.locals.locks.set(lockKey, Date.now());
  
  try {
    const { orderId } = req.params;
    const { reason, amount } = req.body;
    
    // 验证权限
    const transaction = await PaymentTransaction.findOne({ orderId });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }
    
    // 检查是否是自己的订单或管理员
    if (transaction.userId.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '无权申请此订单退款'
      });
    }
    
    // 检查订单是否可退款
    if (transaction.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: `订单状态为${transaction.status}，不可申请退款`
      });
    }
    
    // 检查是否已经有退款申请在处理中
    const existingRefund = await RefundRecord.findOne({
      orderId,
      status: { $in: ['pending', 'processing'] }
    });
    
    if (existingRefund) {
      return res.status(409).json({
        success: false,
        message: '该订单已有退款申请正在处理',
        refundId: existingRefund.outRefundNo
      });
    }
    
    // 检查退款金额
    const refundAmount = parseFloat(amount) || transaction.amount;
    if (refundAmount <= 0 || refundAmount > transaction.amount) {
      return res.status(400).json({
        success: false,
        message: '无效的退款金额'
      });
    }
    
    // 检查金额精度，避免浮点数精度问题，最多两位小数
    const refundAmountStr = refundAmount.toString();
    const decimalPlaces = refundAmountStr.includes('.') ? 
      refundAmountStr.split('.')[1].length : 0;
      
    if (decimalPlaces > 2) {
      return res.status(400).json({
        success: false,
        message: '退款金额最多支持两位小数'
      });
    }
    
    // 检查是否为合法数值（非NaN和Infinity）
    if (!Number.isFinite(refundAmount)) {
      return res.status(400).json({
        success: false,
        message: '退款金额格式不正确'
      });
    }
    
    // 获取支付配置以计算手续费
    const paymentConfig = await PaymentConfig.findById(transaction.configId);
    if (!paymentConfig) {
      return res.status(404).json({
        success: false,
        message: '支付配置不存在'
      });
    }
    
    // 计算退款手续费
    const feeAmount = paymentConfig.calculateRefundFee(refundAmount);
    // 计算实际退款金额（扣除手续费）
    const actualRefundAmount = refundAmount - feeAmount;
    
    // 生成退款单号
    const outRefundNo = `REF${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    // 创建退款记录
    const refundRecord = new RefundRecord({
      orderId: transaction.orderId,
      outRefundNo,
      transactionId: transaction._id,
      userId: transaction.userId,
      amount: refundAmount,
      actualAmount: actualRefundAmount,
      feeAmount: feeAmount,
      reason: reason || '用户申请退款',
      status: 'pending',
      requestedBy: req.user._id
    });
    
    await refundRecord.save();
    
    // 调用支付接口申请退款
    const payment = await PaymentFactory.createPayment(transaction.provider);
    const refundResult = await payment.refund({
      outTradeNo: transaction.outTradeNo || transaction.orderId,
      outRefundNo,
      totalFee: transaction.amount,
      refundFee: actualRefundAmount, // 发送给支付网关的是实际退款金额
      refundReason: reason || '用户申请退款'
    });
    
    if (!refundResult.success) {
      // 更新退款记录状态
      await RefundRecord.findByIdAndUpdate(refundRecord._id, {
        $set: {
          status: 'failed',
          statusMessage: refundResult.errorMessage,
          rawData: refundResult
        }
      });
      
      return res.status(400).json({
        success: false,
        message: '申请退款失败',
        error: refundResult.errorMessage
      });
    }
    
    // 更新退款记录和交易状态
    await RefundRecord.findByIdAndUpdate(refundRecord._id, {
      $set: {
        status: 'processing',
        statusMessage: '退款处理中',
        refundId: refundResult.refundId,
        rawData: refundResult
      }
    });
    
    // 如果全额退款，更新交易状态
    if (refundAmount === transaction.amount) {
      await PaymentTransaction.findByIdAndUpdate(transaction._id, {
        $set: {
          status: 'refunding',
          statusMessage: '退款处理中'
        }
      });
    }
    
    return res.status(200).json({
      success: true,
      message: '退款申请已提交',
      data: {
        orderId: transaction.orderId,
        outRefundNo,
        refundAmount,
        feeAmount,
        actualRefundAmount,
        status: 'processing'
      }
    });
  } catch (error) {
    logger.error('申请退款失败', {
      error: error.message,
      stack: error.stack,
      orderId: req.params.orderId
    });
    
    return res.status(500).json({
      success: false,
      message: '申请退款失败',
      error: error.message
    });
  } finally {
    // 无论如何释放锁
    if (req.app.locals.locks) {
      req.app.locals.locks.delete(lockKey);
    }
    
    // 设置锁过期，防止死锁（可选）
    setTimeout(() => {
      if (req.app.locals.locks && req.app.locals.locks.has(lockKey)) {
        req.app.locals.locks.delete(lockKey);
      }
    }, 30000); // 30秒超时
  }
};

/**
 * 查询退款状态
 */
exports.queryRefund = async (req, res) => {
  try {
    const { outRefundNo } = req.params;
    
    // 查询退款记录
    const refundRecord = await RefundRecord.findOne({ outRefundNo });
    
    if (!refundRecord) {
      return res.status(404).json({
        success: false,
        message: '退款记录不存在'
      });
    }
    
    // 检查是否是自己的退款或管理员
    if (refundRecord.userId.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '无权查询此退款'
      });
    }
    
    // 如果状态已经是成功或失败，直接返回
    if (refundRecord.status === 'success' || refundRecord.status === 'failed') {
      return res.status(200).json({
        success: true,
        data: {
          outRefundNo: refundRecord.outRefundNo,
          orderId: refundRecord.orderId,
          status: refundRecord.status,
          statusMessage: refundRecord.statusMessage,
          amount: refundRecord.amount,
          actualAmount: refundRecord.actualAmount,
          feeAmount: refundRecord.feeAmount,
          refundTime: refundRecord.completedAt
        }
      });
    }
    
    // 查询交易记录
    const transaction = await PaymentTransaction.findById(refundRecord.transactionId);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: '订单不存在'
      });
    }
    
    // 查询第三方退款状态
    const payment = await PaymentFactory.createPayment(transaction.provider);
    const queryResult = await payment.queryRefund({
      outTradeNo: transaction.outTradeNo || transaction.orderId,
      outRefundNo: refundRecord.outRefundNo
    });
    
    if (!queryResult.success) {
      return res.status(200).json({
        success: true,
        data: {
          outRefundNo: refundRecord.outRefundNo,
          orderId: refundRecord.orderId,
          status: refundRecord.status,
          statusMessage: '退款处理中',
          amount: refundRecord.amount,
          actualAmount: refundRecord.actualAmount,
          feeAmount: refundRecord.feeAmount
        }
      });
    }
    
    // 判断退款状态
    let status = refundRecord.status;
    let statusMessage = '';
    
    if (transaction.provider === 'weixin') {
      if (queryResult.refundStatus === 'SUCCESS') {
        status = 'success';
        statusMessage = '退款成功';
      } else if (queryResult.refundStatus === 'PROCESSING') {
        status = 'processing';
        statusMessage = '退款处理中';
      } else if (queryResult.refundStatus === 'REFUNDCLOSE') {
        status = 'failed';
        statusMessage = '退款关闭';
      } else if (queryResult.refundStatus === 'CHANGE') {
        status = 'failed';
        statusMessage = '退款异常';
      }
    } else if (transaction.provider === 'zhifubao') {
      if (queryResult.refundStatus === 'SUCCESS') {
        status = 'success';
        statusMessage = '退款成功';
      } else if (queryResult.refundStatus === 'PROCESSING') {
        status = 'processing';
        statusMessage = '退款处理中';
      } else {
        status = 'failed';
        statusMessage = '退款失败';
      }
    }
    
    // 如果状态有变化且变成了成功，更新交易状态
    if (status === 'success' && refundRecord.status !== 'success') {
      // 使用事务处理
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // 更新退款记录状态
        refundRecord.status = status;
        refundRecord.statusMessage = statusMessage;
        refundRecord.completedAt = new Date();
        refundRecord.rawData = queryResult.rawData;
        
        await refundRecord.save({ session });
        
        // 如果是全额退款，更新交易状态
        if (refundRecord.amount === transaction.amount) {
          transaction.status = 'refunded';
          transaction.statusMessage = '已退款';
          await transaction.save({ session });
        }
        
        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } else if (status !== refundRecord.status) {
      // 只更新退款记录状态
      await RefundRecord.findByIdAndUpdate(refundRecord._id, {
        $set: {
          status,
          statusMessage,
          rawData: queryResult.rawData
        }
      });
    }
    
    return res.status(200).json({
      success: true,
      data: {
        outRefundNo: refundRecord.outRefundNo,
        orderId: refundRecord.orderId,
        status,
        statusMessage,
        amount: refundRecord.amount,
        actualAmount: refundRecord.actualAmount,
        feeAmount: refundRecord.feeAmount,
        refundTime: status === 'success' ? new Date() : null,
        rawData: queryResult.rawData
      }
    });
  } catch (error) {
    logger.error('查询退款状态失败', {
      error: error.message,
      stack: error.stack,
      outRefundNo: req.params.outRefundNo
    });
    
    return res.status(500).json({
      success: false,
      message: '查询退款状态失败',
      error: error.message
    });
  }
};

/**
 * 处理商品发放
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