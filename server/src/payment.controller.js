/**
 * 支付网关控制器
 * 处理游戏内购买和支付功能
 */

const crypto = require('crypto');
const User = require('./models/user.model');
const Payment = require('./models/payment.model');
const Shop = require('./models/shop.model');
const config = require('./config');
const mongoose = require('mongoose');
const { maskSensitiveData } = require('./controllers/encryption');
const { 
  generateOrderId, 
  generatePaymentSignature, 
  validatePaymentRequest,
  logPaymentEvent,
  simulatePaymentGateway
} = require('./controllers/payment-utils');

/**
 * 创建支付订单
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.createOrder = async (req, res) => {
  try {
    const { productId, paymentMethod } = req.body;
    const userId = req.user._id;
    
    // 验证必填字段
    if (!productId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: '商品ID和支付方式为必填项'
      });
    }
    
    // 验证支付方式是否有效
    const validPaymentMethods = Object.values(config.payment.channels);
    if (!validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: `无效的支付方式，支持的方式: ${validPaymentMethods.join(', ')}`
      });
    }
    
    // 防止ObjectId注入
    let objectId;
    try {
      objectId = new mongoose.Types.ObjectId(productId);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: '无效的商品ID格式'
      });
    }
    
    // 查找商品
    const product = await Shop.findById(objectId);
    
    // 检查商品是否存在
    if (!product) {
      return res.status(404).json({
        success: false,
        message: '商品不存在'
      });
    }
    
    // 检查商品是否可购买
    if (!product.isAvailable) {
      return res.status(400).json({
        success: false,
        message: '该商品当前不可购买'
      });
    }
    
    // 检查商品价格是否有效
    if (product.price <= 0) {
      return res.status(400).json({
        success: false,
        message: '商品价格无效'
      });
    }
    
    // 检查用户是否有购买此商品的权限
    if (typeof product.canPurchase === 'function') {
      const canPurchaseResult = product.canPurchase(req.user);
      if (!canPurchaseResult.canPurchase) {
        return res.status(403).json({
          success: false,
          message: canPurchaseResult.reason || '您无法购买此商品'
        });
      }
    }
    
    // 幂等性检查：防止重复下单
    const recentOrderCutoff = new Date(Date.now() - 5 * 60 * 1000); // 5分钟内
    const existingOrder = await Payment.findOne({
      userId,
      productId: product._id,
      status: 'pending',
      createdAt: { $gte: recentOrderCutoff }
    });
    
    if (existingOrder) {
      return res.status(409).json({
        success: false,
        message: '您有一个相同商品的未完成订单，请勿重复下单',
        orderId: existingOrder.orderId
      });
    }
    
    // 生成时间戳和订单号
    const timestamp = Date.now().toString();
    const orderId = generateOrderId();
    
    // 创建支付订单
    const payment = new Payment({
      orderId,
      userId,
      productId: product._id,
      amount: product.price,
      _rawAmount: product.price, // 存储原始金额用于内部验证
      currency: 'CNY',
      paymentMethod,
      status: 'pending',
      description: `购买 ${product.name}`,
      productDetails: {
        name: product.name,
        description: product.description,
        category: product.category
      },
      clientIp: req.ip // 记录客户端IP，用于风控
    });
    
    // 保存支付订单
    await payment.save();
    
    // 生成支付签名
    const signature = generatePaymentSignature(
      orderId,
      product.price,
      userId.toString(),
      product._id.toString(),
      config.payment.secret,
      timestamp
    );
    
    // 构建支付网关请求参数
    const gatewayParams = {
      orderId,
      amount: product.price,
      currency: 'CNY',
      productName: product.name,
      productId: product._id.toString(),
      paymentMethod,
      redirectUrl: config.payment.callbackUrl,
      notifyUrl: `${config.payment.callbackUrl}/notify`,
      userId: userId.toString(),
      timestamp,
      signature
    };
    
    // 调用支付网关API
    const paymentUrl = process.env.NODE_ENV === 'development' 
      ? simulatePaymentGateway(gatewayParams)
      : await callRealPaymentGateway(gatewayParams);
    
    // 返回支付信息
    res.status(200).json({
      success: true,
      message: '支付订单创建成功',
      orderInfo: {
        orderId,
        amount: product.price,
        currency: 'CNY',
        productName: product.name,
        paymentMethod,
        status: 'pending',
        createdAt: payment.createdAt,
        expireTime: new Date(Date.now() + 30 * 60 * 1000) // 30分钟有效期
      },
      paymentUrl
    });
    
    // 记录订单创建审计日志
    logPaymentEvent('订单创建', {
      userId: userId.toString(),
      orderId,
      amount: product.price,
      productName: product.name
    });
  } catch (error) {
    console.error('创建支付订单错误:', error);
    res.status(500).json({
      success: false,
      message: '创建支付订单失败，请稍后再试',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
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
    // 获取支付网关回调数据
    const {
      orderId,
      paymentStatus,
      amount,
      userId,
      productId,
      timestamp,
      signature,
      transactionId
    } = req.body;
    
    // 验证必填字段
    const requiredFields = ['orderId', 'paymentStatus', 'amount', 'userId', 'productId', 'timestamp', 'signature'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `回调参数不完整，缺少: ${missingFields.join(', ')}`
      });
    }
    
    // 验证签名
    let expectedSignature;
    try {
      expectedSignature = generatePaymentSignature(
        orderId,
        amount,
        userId,
        productId,
        config.payment.secret,
        timestamp
      );
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: e.message
      });
    }
    
    if (signature !== expectedSignature) {
      logPaymentEvent('签名验证失败', {
        orderId,
        expectedSignature,
        receivedSignature: signature
      });
      
      return res.status(403).json({
        success: false,
        message: '签名验证失败'
      });
    }
    
    // 查找订单
    const payment = await Payment.findOne({ orderId });
    
    // 验证支付请求有效性
    const validationResult = validatePaymentRequest(req, payment, {
      checkUser: true,
      checkAmount: true,
      checkTimeWindow: true,
      timeWindowMs: 10 * 60 * 1000 // 10分钟
    });
    
    if (!validationResult.isValid) {
      return res.status(400).json({
        success: false,
        message: validationResult.reason
      });
    }
    
    // 开始数据库事务
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // 更新订单状态
      payment.status = paymentStatus === 'success' ? 'completed' : 'failed';
      payment.statusMessage = paymentStatus === 'success' ? '支付成功' : '支付失败';
      payment.completedAt = new Date();
      payment.gatewayResponse = req.body;
      payment.transactionId = transactionId || null;
      
      await payment.save({ session });
      
      // 如果支付成功，处理商品发放
      if (paymentStatus === 'success') {
        // 查找用户
        const user = await User.findById(userId);
        if (!user) {
          throw new Error(`找不到用户: ${userId}`);
        }
        
        // 查找商品
        const product = await Shop.findById(payment.productId);
        if (!product) {
          throw new Error(`找不到商品: ${payment.productId}`);
        }
        
        // 根据商品类型发放相应的道具或特权
        if (product) {
          // 发放钻石 - 使用安全的数值操作
          if (product.rewards.diamond > 0) {
            user.gameProfile.diamond = (user.gameProfile.diamond || 0) + product.rewards.diamond;
          }
          
          // 发放金币 - 使用安全的数值操作
          if (product.rewards.gold > 0) {
            user.gameProfile.gold = (user.gameProfile.gold || 0) + product.rewards.gold;
          }
          
          // 发放VIP特权 - 增加安全检查
          if (product.rewards.vip && 
              product.rewards.vip.level > 0 && 
              product.rewards.vip.days > 0) {
            
            // 更新VIP等级（取最高等级）
            const currentVipLevel = user.paymentInfo.vipLevel || 0;
            user.paymentInfo.vipLevel = Math.max(currentVipLevel, product.rewards.vip.level);
            
            // 更新VIP过期时间 - 安全处理
            const now = new Date();
            let vipExpiry = user.paymentInfo.vipExpiry || now;
            
            // 如果VIP已过期，从现在开始计算
            if (vipExpiry < now) {
              vipExpiry = now;
            }
            
            // 添加天数 - 防止整数溢出
            const daysToAdd = Math.min(product.rewards.vip.days, 3650); // 限制最多10年
            const msToAdd = daysToAdd * 24 * 60 * 60 * 1000;
            user.paymentInfo.vipExpiry = new Date(vipExpiry.getTime() + msToAdd);
          }
          
          // 更新用户总消费金额 - 使用安全的数值操作
          const currentSpent = user.paymentInfo.totalSpent || 0;
          user.paymentInfo.totalSpent = currentSpent + parseFloat(payment._rawAmount || amount);
          
          // 保存用户数据
          await user.save({ session });
          
          // 更新商品销售统计
          if (product.soldCount !== undefined) {
            product.soldCount += 1;
            await product.save({ session });
          }
        }
      }
      
      // 提交事务
      await session.commitTransaction();
      
      // 记录审计日志
      logPaymentEvent('支付完成', {
        orderId,
        userId,
        status: payment.status,
        completedAt: payment.completedAt
      });
      
      // 返回成功响应
      res.status(200).json({
        success: true,
        message: '支付回调处理成功',
        orderId
      });
    } catch (error) {
      // 回滚事务
      await session.abortTransaction();
      throw error;
    } finally {
      // 结束会话
      session.endSession();
    }
  } catch (error) {
    console.error('处理支付回调错误:', error);
    res.status(500).json({
      success: false,
      message: '处理支付回调失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
};

// 实际支付网关API调用函数
async function callRealPaymentGateway(params) {
  // 实际应用中应该实现对接真实支付网关的逻辑
  // 这里仅作为示例
  
  // 记录请求日志（脱敏）
  logPaymentEvent('调用支付网关', {
    orderId: params.orderId,
    productId: params.productId,
    paymentMethod: params.paymentMethod
  });
  
  // 模拟异步操作
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(simulatePaymentGateway(params));
    }, 100);
  });
} 