/**
 * 支付工具函数
 * 安全增强版的支付相关工具函数
 */

const crypto = require('crypto');
const { maskSensitiveData } = require('./encryption');

/**
 * 生成订单ID - 安全增强版
 * @returns {String} 订单ID
 */
exports.generateOrderId = () => {
  // 生成随机字节作为熵源
  const randomBytes = crypto.randomBytes(8).toString('hex');
  const timestamp = new Date().getTime().toString();
  return `ORD${timestamp}${randomBytes}`;
};

/**
 * 生成支付签名 - 安全增强版
 * @param {String} orderId - 订单ID
 * @param {Number} amount - 支付金额
 * @param {String} userId - 用户ID
 * @param {String} productId - 商品ID
 * @param {String} secret - 密钥
 * @param {String} timestamp - 时间戳
 * @returns {String} 支付签名
 */
exports.generatePaymentSignature = (orderId, amount, userId, productId, secret, timestamp) => {
  // 强制要求时间戳参数
  if (!timestamp) {
    throw new Error('必须提供时间戳参数');
  }
  
  // 验证其他参数是否有效
  if (!orderId || !amount || !userId || !productId || !secret) {
    throw new Error('签名参数不完整');
  }
  
  // 按字母顺序排列参数，防止参数顺序混淆
  const paramsToSign = {
    amount: String(amount),
    orderId: String(orderId),
    productId: String(productId),
    timestamp: String(timestamp),
    userId: String(userId)
  };
  
  // 构建签名字符串
  const stringToSign = Object.entries(paramsToSign)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  // 使用HMAC替代简单哈希提升安全性
  return crypto.createHmac('sha256', secret)
    .update(stringToSign)
    .digest('hex');
};

/**
 * 验证支付请求的有效性 - 全面安全检查
 * @param {Object} req - 请求对象
 * @param {Object} payment - 支付订单
 * @param {Object} options - 验证选项
 * @returns {Object} 验证结果对象 {isValid, reason}
 */
exports.validatePaymentRequest = (req, payment, options = {}) => {
  const result = { isValid: true, reason: null };
  
  // 1. 验证订单是否存在
  if (!payment) {
    result.isValid = false;
    result.reason = '订单不存在';
    return result;
  }
  
  // 2. 验证订单状态
  if (payment.status !== 'pending') {
    result.isValid = false;
    result.reason = `订单已${payment.status === 'completed' ? '完成' : '处理'}，不可重复操作`;
    return result;
  }
  
  // 3. 验证用户ID
  if (options.checkUser && req.body.userId && payment.userId.toString() !== req.body.userId) {
    result.isValid = false;
    result.reason = '用户ID不匹配';
    return result;
  }
  
  // 4. 验证金额
  if (options.checkAmount && req.body.amount) {
    // 使用安全的金额比较
    if (!payment.compareAmount(req.body.amount)) {
      result.isValid = false;
      result.reason = '订单金额不匹配';
      return result;
    }
  }
  
  // 5. 验证时间窗口
  if (options.checkTimeWindow && req.body.timestamp) {
    const now = Date.now();
    const requestTime = parseInt(req.body.timestamp, 10);
    const maxAgeMs = options.timeWindowMs || 5 * 60 * 1000; // 默认5分钟
    
    if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAgeMs) {
      result.isValid = false;
      result.reason = '请求已过期或时间戳无效';
      return result;
    }
  }
  
  return result;
};

/**
 * 安全记录支付信息
 * @param {String} event - 事件名称
 * @param {Object} data - 支付数据
 */
exports.logPaymentEvent = (event, data) => {
  // 确保敏感数据被脱敏
  const safeData = maskSensitiveData(data);
  
  // 安全日志记录
  console.info(`支付事件: ${event}`, safeData);
};

/**
 * 模拟支付网关响应（安全增强版）- 仅用于开发测试
 * @param {Object} params - 支付参数
 * @returns {String} 支付URL
 */
exports.simulatePaymentGateway = (params) => {
  // 验证必要参数
  const requiredParams = ['orderId', 'amount', 'userId', 'productId', 'timestamp', 'signature'];
  const missingParams = requiredParams.filter(param => !params[param]);
  
  if (missingParams.length > 0) {
    throw new Error(`缺少必要参数: ${missingParams.join(', ')}`);
  }
  
  // 对参数进行安全编码
  const safeParams = {};
  for (const [key, value] of Object.entries(params)) {
    safeParams[key] = encodeURIComponent(String(value));
  }
  
  // 构造安全的查询字符串
  const queryString = Object.entries(safeParams)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  return `http://localhost:3000/test-payment?${queryString}`;
}; 