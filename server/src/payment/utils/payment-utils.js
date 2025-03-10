/**
 * 支付工具模块
 */

const crypto = require('crypto');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * 生成订单ID
 * @returns {String} 订单ID
 */
function generateOrderId() {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `PAY${timestamp}${random}`;
}

/**
 * 生成签名
 * @param {Object} params - 需要签名的参数
 * @param {String} secret - 密钥
 * @param {String} algorithm - 签名算法
 * @returns {String} 签名结果
 */
function generateSignature(params, secret, algorithm = 'sha256') {
  if (!params) {
    throw new Error('必须提供参数');
  }
  
  if (!secret) {
    throw new Error('必须提供密钥');
  }
  
  // 创建参数副本，避免修改原始对象
  const paramsToSign = { ...params };
  
  // 删除签名字段（如果存在）
  delete paramsToSign.sign;
  delete paramsToSign.sign_type;
  
  // 按字母顺序排序键
  const sortedKeys = Object.keys(paramsToSign).sort();
  
  // 构建签名字符串
  const signStr = sortedKeys
    .filter(key => paramsToSign[key] !== undefined && paramsToSign[key] !== null && paramsToSign[key] !== '')
    .map(key => `${key}=${paramsToSign[key]}`)
    .join('&') + `&key=${secret}`;
  
  // 计算签名
  return crypto
    .createHash(algorithm)
    .update(signStr)
    .digest('hex')
    .toUpperCase();
}

/**
 * 验证签名（使用恒定时间比较避免时序攻击）
 * @param {Object} params - 包含签名的参数
 * @param {String} secret - 密钥
 * @param {String} algorithm - 签名算法
 * @returns {Boolean} 验证结果
 */
function verifySignature(params, secret, algorithm = 'sha256') {
  if (!params || !params.sign) {
    return false;
  }
  
  const receivedSign = params.sign;
  const calculatedSign = generateSignature(params, secret, algorithm);
  
  // 使用恒定时间比较避免时序攻击
  if (receivedSign.length !== calculatedSign.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < receivedSign.length; i++) {
    result |= receivedSign.charCodeAt(i) ^ calculatedSign.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * 验证支付参数是否有效
 * @param {Object} params - 支付参数
 * @returns {Object} 验证结果
 */
function validatePaymentParams(params) {
  const requiredParams = ['orderId', 'amount', 'userId', 'productId'];
  const missingParams = requiredParams.filter(param => !params[param]);
  
  if (missingParams.length > 0) {
    return {
      valid: false,
      message: `缺少必要参数: ${missingParams.join(', ')}`
    };
  }
  
  // 验证金额格式
  const amount = parseFloat(params.amount);
  if (isNaN(amount) || amount <= 0) {
    return {
      valid: false,
      message: '无效的金额格式'
    };
  }
  
  return {
    valid: true
  };
}

/**
 * 验证支付回调参数是否有效
 * @param {Object} params - 回调参数
 * @returns {Boolean} 验证结果
 */
function verifyPaymentCallback(params) {
  // 验证必要参数
  const requiredParams = ['orderId', 'status', 'amount', 'timestamp', 'sign'];
  const missingParams = requiredParams.filter(param => !params[param]);
  
  if (missingParams.length > 0) {
    logger.warn('支付回调缺少必要参数', { missingParams });
    return false;
  }
  
  // 验证时间戳
  const timestamp = parseInt(params.timestamp);
  const now = Date.now();
  const maxTimeGap = 5 * 60 * 1000; // 5分钟
  
  if (isNaN(timestamp) || Math.abs(now - timestamp) > maxTimeGap) {
    logger.warn('支付回调时间戳验证失败', { 
      timestamp,
      now,
      timeDiff: Math.abs(now - timestamp)
    });
    return false;
  }
  
  // 验证签名
  return verifySignature(params, config.payment.secret);
}

/**
 * 计算手续费
 * @param {Number} amount - 交易金额
 * @param {Object} feeConfig - 手续费配置
 * @returns {Number} 手续费金额
 */
function calculateFee(amount, feeConfig) {
  if (!feeConfig) {
    return 0;
  }
  
  const { type, value, minFee = 0, maxFee = 0 } = feeConfig;
  
  let fee = 0;
  
  if (type === 'fixed') {
    fee = value;
  } else if (type === 'percent') {
    fee = amount * (value / 100);
  }
  
  // 应用最低和最高限制
  if (minFee > 0 && fee < minFee) {
    fee = minFee;
  }
  
  if (maxFee > 0 && fee > maxFee) {
    fee = maxFee;
  }
  
  // 保留两位小数
  return Math.round(fee * 100) / 100;
}

/**
 * 掩码敏感信息
 * @param {String} text - 原始文本
 * @param {Number} prefixLength - 前缀长度
 * @param {Number} suffixLength - 后缀长度
 * @returns {String} 掩码后的文本
 */
function maskSensitiveInfo(text, prefixLength = 4, suffixLength = 4) {
  if (!text) {
    return '';
  }
  
  const textStr = String(text);
  
  if (textStr.length <= prefixLength + suffixLength) {
    return '*'.repeat(textStr.length);
  }
  
  const prefix = textStr.substring(0, prefixLength);
  const suffix = textStr.substring(textStr.length - suffixLength);
  const mask = '*'.repeat(textStr.length - prefixLength - suffixLength);
  
  return prefix + mask + suffix;
}

/**
 * 规范化支付参数，去除不安全字符，统一格式
 * @param {Object} params - 原始参数
 * @returns {Object} 规范化后的参数
 */
function normalizePaymentParams(params) {
  if (!params || typeof params !== 'object') {
    return {};
  }
  
  const normalized = {};
  
  // 处理每个参数
  for (const [key, value] of Object.entries(params)) {
    // 跳过空值
    if (value === undefined || value === null) {
      continue;
    }
    
    // 根据不同类型规范化
    if (typeof value === 'string') {
      // 字符串：去除首尾空格，过滤危险字符
      normalized[key] = value.trim().replace(/[<>'"\\]/g, '');
    } else if (typeof value === 'number') {
      // 数字：确保有效数字
      if (Number.isFinite(value)) {
        normalized[key] = value;
      } else {
        normalized[key] = 0;
      }
    } else if (Array.isArray(value)) {
      // 数组：递归规范化
      normalized[key] = value.map(item => {
        if (typeof item === 'object') {
          return normalizePaymentParams(item);
        }
        return item;
      });
    } else if (typeof value === 'object') {
      // 对象：递归规范化
      normalized[key] = normalizePaymentParams(value);
    } else {
      // 其他类型：直接使用
      normalized[key] = value;
    }
  }
  
  return normalized;
}

/**
 * 验证金额格式
 * @param {Number|String} amount - 金额
 * @returns {Object} 验证结果
 */
function validateAmountFormat(amount) {
  // 转换为数字
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  // 检查是否为有效数字
  if (isNaN(numAmount) || !Number.isFinite(numAmount)) {
    return {
      valid: false,
      message: '无效的金额格式'
    };
  }
  
  // 检查是否为正数
  if (numAmount <= 0) {
    return {
      valid: false,
      message: '金额必须大于0'
    };
  }
  
  // 检查精度（最多两位小数）
  const amountStr = numAmount.toString();
  const decimalParts = amountStr.split('.');
  if (decimalParts.length > 1 && decimalParts[1].length > 2) {
    return {
      valid: false,
      message: '金额最多支持两位小数'
    };
  }
  
  return {
    valid: true,
    amount: numAmount
  };
}

/**
 * 净化MongoDB查询条件，防止注入攻击
 * @param {Object} query - 原始查询对象
 * @returns {Object} 安全的查询对象
 */
function sanitizeMongoQuery(query) {
  if (!query || typeof query !== 'object') {
    return {};
  }
  
  const sanitized = {};
  
  // 遍历查询字段
  Object.keys(query).forEach(key => {
    const value = query[key];
    
    // 检查MongoDB操作符
    if (key.startsWith('$')) {
      // 禁止直接使用敏感操作符
      if (['$where', '$expr', '$function'].includes(key)) {
        logger.warn('检测到危险的MongoDB查询操作符', { key });
        return;
      }
    }
    
    // 如果值是对象，递归处理
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeMongoQuery(value);
    } else if (Array.isArray(value)) {
      // 如果是数组，对每个元素进行处理
      sanitized[key] = value.map(item => {
        if (item && typeof item === 'object') {
          return sanitizeMongoQuery(item);
        }
        return item;
      });
    } else {
      // 直接值
      sanitized[key] = value;
    }
  });
  
  return sanitized;
}

/**
 * 防止XSS攻击，过滤输入字符串中的HTML标签和危险字符
 * @param {String} input - 输入字符串
 * @returns {String} 过滤后的安全字符串
 */
function sanitizeForXSS(input) {
  if (typeof input !== 'string') {
    return input;
  }
  
  // 过滤HTML标签和常见XSS攻击载体
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/\\/g, '&#x5C;')
    .replace(/`/g, '&#96;')
    .replace(/\(/g, '&#40;')
    .replace(/\)/g, '&#41;')
    .replace(/==/g, '&#61;&#61;')
    .replace(/=/g, '&#61;')
    .replace(/\+/g, '&#43;')
    .replace(/-/g, '&#45;')
    .replace(/;/g, '&#59;');
}

/**
 * 递归对对象中的所有字符串值进行XSS过滤
 * @param {Object} obj - 输入对象
 * @returns {Object} 过滤后的对象
 */
function sanitizeObjectForXSS(obj) {
  if (!obj || typeof obj !== 'object') {
    return sanitizeForXSS(obj);
  }
  
  // 如果是数组
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectForXSS(item));
  }
  
  // 如果是对象
  const result = {};
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (typeof value === 'string') {
      result[key] = sanitizeForXSS(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeObjectForXSS(value);
    } else {
      result[key] = value;
    }
  });
  
  return result;
}

/**
 * 对支付数据进行脱敏处理
 * @param {Object} paymentData - 需要脱敏的支付数据
 * @returns {Object} 脱敏后的数据
 */
function maskSensitiveData(paymentData) {
  if (!paymentData) return paymentData;
  
  // 创建数据副本，避免修改原始数据
  const maskedData = {...paymentData};
  
  // 脱敏卡号 - 仅保留前6位和后4位
  if (maskedData.cardNumber) {
    const len = maskedData.cardNumber.length;
    if (len > 10) {
      maskedData.cardNumber = `${maskedData.cardNumber.substring(0, 6)}${'*'.repeat(len - 10)}${maskedData.cardNumber.substring(len - 4)}`;
    }
  }
  
  // 脱敏手机号 - 仅保留前3位和后4位
  if (maskedData.phoneNumber) {
    const len = maskedData.phoneNumber.length;
    if (len >= 7) {
      maskedData.phoneNumber = `${maskedData.phoneNumber.substring(0, 3)}${'*'.repeat(len - 7)}${maskedData.phoneNumber.substring(len - 4)}`;
    }
  }
  
  // 脱敏身份证 - 仅保留前4位和后4位
  if (maskedData.idCard) {
    const len = maskedData.idCard.length;
    if (len >= 8) {
      maskedData.idCard = `${maskedData.idCard.substring(0, 4)}${'*'.repeat(len - 8)}${maskedData.idCard.substring(len - 4)}`;
    }
  }
  
  // 脱敏地址信息
  if (maskedData.address) {
    if (typeof maskedData.address === 'string' && maskedData.address.length > 8) {
      maskedData.address = `${maskedData.address.substring(0, 6)}...`;
    } else if (maskedData.address.detail) {
      maskedData.address.detail = `${maskedData.address.detail.substring(0, 6)}...`;
    }
  }
  
  // 脱敏邮箱 - 仅显示域名和用户名的第一个字符
  if (maskedData.email && maskedData.email.includes('@')) {
    const [username, domain] = maskedData.email.split('@');
    if (username.length > 1) {
      maskedData.email = `${username.charAt(0)}${'*'.repeat(username.length - 1)}@${domain}`;
    }
  }
  
  // 脱敏姓名 - 仅保留姓氏，名字用*代替
  if (maskedData.name && maskedData.name.length >= 2) {
    maskedData.name = `${maskedData.name.charAt(0)}${'*'.repeat(maskedData.name.length - 1)}`;
  }
  
  // 对敏感金额数据进行脱敏处理 - 只在日志中使用，接口返回不脱敏
  if (maskedData.amount && process.env.NODE_ENV === 'production') {
    maskedData.amount = '***';
  }
  
  return maskedData;
}

/**
 * 字段级加密 - 用于敏感字段的加密存储
 * @param {string} value - 需要加密的值
 * @param {string} key - 加密密钥
 * @returns {string} 加密后的值
 */
function encryptField(value, key) {
  if (!value) return value;
  
  try {
    const crypto = require('crypto');
    // 使用随机IV以增强安全性
    const iv = crypto.randomBytes(16);
    // 使用AES-256-CBC算法
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // 返回IV和加密数据的组合
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    logger.error('字段加密失败', { error: error.message });
    throw new Error('加密操作失败');
  }
}

/**
 * 字段级解密
 * @param {string} encryptedValue - 加密的值
 * @param {string} key - 解密密钥
 * @returns {string} 解密后的值
 */
function decryptField(encryptedValue, key) {
  if (!encryptedValue || !encryptedValue.includes(':')) return encryptedValue;
  
  try {
    const crypto = require('crypto');
    // 分离IV和加密数据
    const [ivHex, encryptedData] = encryptedValue.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('字段解密失败', { error: error.message });
    throw new Error('解密操作失败');
  }
}

module.exports = {
  generateOrderId,
  generateSignature,
  verifySignature,
  validatePaymentParams,
  verifyPaymentCallback,
  calculateFee,
  maskSensitiveInfo,
  normalizePaymentParams,
  validateAmountFormat,
  sanitizeMongoQuery,
  sanitizeForXSS,
  sanitizeObjectForXSS,
  maskSensitiveData,
  encryptField,
  decryptField
}; 