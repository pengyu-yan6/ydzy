/**
 * 支付风控中间件
 * 用于检测和防止可疑支付
 */

const Payment = require('../models/payment.model');
const User = require('../models/user.model');
const config = require('../config');
const logger = require('../utils/logger');
const { isValidIP } = require('../utils/ip-utils');

// 风控规则配置
const RISK_RULES = Object.freeze({
  DUPLICATE_AMOUNT: {
    threshold: 3,
    timeWindow: 3600000 // 1小时
  },
  SUDDEN_AMOUNT_INCREASE: {
    multiplier: 5
  },
  FREQUENT_SMALL_PAYMENTS: {
    threshold: 5,
    amount: 10,
    timeWindow: 3600000 // 1小时
  },
  MULTIPLE_CARDS: {
    threshold: 3,
    timeWindow: 86400000 // 24小时
  }
});

/**
 * 支付风控检查中间件
 */
exports.checkPaymentRisk = async (req, res, next) => {
  try {
    const { userId, amount, cardInfo } = req.body;
    const clientIP = req.ip;
    
    // 验证用户
    const user = await User.findById(userId).select('+riskScore +paymentHistory');
    if (!user) {
      logger.warn('支付风控：用户不存在', { userId });
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 检查用户风险分数
    if (user.riskScore >= config.payment.maxRiskScore) {
      logger.warn('支付风控：用户风险分数过高', {
        userId,
        riskScore: user.riskScore
      });
      return res.status(403).json({
        success: false,
        message: '账户存在风险，请联系客服'
      });
    }
    
    // 检查IP风险
    if (!isValidIP(clientIP)) {
      logger.warn('支付风控：无效的IP地址', { ip: clientIP });
      return res.status(400).json({
        success: false,
        message: '无效的请求来源'
      });
    }
    
    // 获取用户当日支付记录
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayPayments = await Payment.find({
      userId,
      createdAt: { $gte: today },
      status: 'completed'
    }).select('amount cardInfo createdAt');
    
    // 计算当日总额
    const todayTotal = todayPayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    // 检查单日限额
    const dailyLimit = config.payment.dailyLimit || 10000;
    if (todayTotal + amount > dailyLimit) {
      logger.warn('支付风控：超出单日限额', {
        userId,
        amount,
        todayTotal,
        dailyLimit,
        ip: clientIP
      });
      
      // 增加用户风险分数
      user.riskScore = (user.riskScore || 0) + 10;
      await user.save();
      
      return res.status(400).json({
        success: false,
        message: '超出单日支付限额'
      });
    }
    
    // 检查单笔限额
    const singleLimit = config.payment.singleLimit || 5000;
    if (amount > singleLimit) {
      logger.warn('支付风控：超出单笔限额', {
        userId,
        amount,
        singleLimit,
        ip: clientIP
      });
      
      return res.status(400).json({
        success: false,
        message: '超出单笔支付限额'
      });
    }
    
    // 获取近期支付记录
    const recentPayments = await Payment.find({
      userId,
      createdAt: { $gte: new Date(Date.now() - RISK_RULES.DUPLICATE_AMOUNT.timeWindow) }
    }).select('amount cardInfo createdAt');
    
    // 检查可疑支付模式
    const riskPatterns = await checkSuspiciousPatterns(recentPayments, {
      amount,
      cardInfo,
      userId,
      clientIP
    });
    
    if (riskPatterns.length > 0) {
      // 记录风险事件
      logger.warn('支付风控：检测到异常支付行为', {
        userId,
        patterns: riskPatterns,
        amount,
        ip: clientIP
      });
      
      // 更新用户风险分数
      user.riskScore = (user.riskScore || 0) + riskPatterns.length * 5;
      await user.save();
      
      return res.status(400).json({
        success: false,
        message: '检测到异常支付行为，请稍后再试'
      });
    }
    
    // 添加风控信息到请求
    req.riskInfo = {
      score: user.riskScore,
      patterns: riskPatterns,
      dailyTotal: todayTotal
    };
    
    next();
  } catch (error) {
    logger.error('支付风控检查失败', {
      error: error.message,
      stack: error.stack,
      userId: req.body.userId,
      ip: req.ip
    });
    
    res.status(500).json({
      success: false,
      message: '支付风控检查失败',
      error: config.server.env === 'development' ? error.message : undefined
    });
  }
};

/**
 * 检查可疑的支付模式
 * @private
 */
async function checkSuspiciousPatterns(payments, currentPayment) {
  const patterns = [];
  
  // 检查重复金额
  const recentAmounts = payments.map(p => p.amount);
  const amountFrequency = new Map();
  recentAmounts.forEach(amount => {
    amountFrequency.set(amount, (amountFrequency.get(amount) || 0) + 1);
  });
  
  if (Array.from(amountFrequency.values()).some(freq => freq >= RISK_RULES.DUPLICATE_AMOUNT.threshold)) {
    patterns.push('DUPLICATE_AMOUNT');
  }
  
  // 检查金额突增
  const maxPreviousAmount = Math.max(...recentAmounts, 0);
  if (currentPayment.amount > maxPreviousAmount * RISK_RULES.SUDDEN_AMOUNT_INCREASE.multiplier) {
    patterns.push('SUDDEN_AMOUNT_INCREASE');
  }
  
  // 检查频繁小额支付
  const smallPayments = payments.filter(p => p.amount < RISK_RULES.FREQUENT_SMALL_PAYMENTS.amount);
  if (smallPayments.length >= RISK_RULES.FREQUENT_SMALL_PAYMENTS.threshold) {
    patterns.push('FREQUENT_SMALL_PAYMENTS');
  }
  
  // 检查多卡支付
  if (currentPayment.cardInfo) {
    const recentCards = new Set(payments
      .filter(p => p.cardInfo)
      .map(p => p.cardInfo.last4));
    
    if (recentCards.size >= RISK_RULES.MULTIPLE_CARDS.threshold) {
      patterns.push('MULTIPLE_CARDS');
    }
  }
  
  return patterns;
} 