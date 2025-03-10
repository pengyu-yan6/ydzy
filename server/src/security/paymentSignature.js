/**
 * 支付签名验证模块 - 军事级安全
 * 提供高安全性的支付验证机制
 */
const crypto = require('crypto');
const config = require('../config/security.config');
const logger = require('../utils/logger');
const { promisify } = require('util');
const randomBytes = promisify(crypto.randomBytes);

// 可选择使用Redis存储防重放保护
let redisClient;
try {
  redisClient = require('../services/redis');
} catch (error) {
  logger.info('Redis客户端不可用，将使用内存存储进行防重放保护');
}

class PaymentSignature {
  constructor() {
    // 加密设置
    this.algorithm = 'sha256';
    this.encoding = 'hex';
    this.hmacAlgorithm = 'sha384'; // 增强HMAC安全性

    // 防重放攻击设置
    this.nonceStore = new Map();
    this.maxNonceAge = 24 * 60 * 60 * 1000; // 24小时
    this.cleanupInterval = 30 * 60 * 1000; // 30分钟清理一次
    
    // 时间窗口设置
    this.defaultTimeWindow = 5 * 60 * 1000; // 5分钟
    this.strictTimeWindow = 60 * 1000; // 1分钟（用于高风险操作）
    
    // 交易ID存储
    this.processedTransactions = new Map();
    
    // 并发处理锁
    this.processingLocks = new Map();
    
    // 审计
    this.verificationAudit = [];
    this.maxAuditEntries = 1000;
    
    // 启动清理定时器
    this._startCleanupTimer();
  }

  /**
   * 启动清理定时器
   * @private
   */
  _startCleanupTimer() {
    // 定期清理过期nonce和交易记录
    setInterval(() => {
      this._cleanupExpiredData();
    }, this.cleanupInterval);
  }

  /**
   * 清理过期数据
   * @private
   */
  _cleanupExpiredData() {
    try {
      const now = Date.now();
      let nonceCount = 0;
      let txCount = 0;

      // 清理过期nonce
      for (const [key, data] of this.nonceStore.entries()) {
        if (now - data.timestamp > this.maxNonceAge) {
          this.nonceStore.delete(key);
          nonceCount++;
        }
      }

      // 清理过期交易记录
      for (const [txId, timestamp] of this.processedTransactions.entries()) {
        if (now - timestamp > this.maxNonceAge) {
          this.processedTransactions.delete(txId);
          txCount++;
        }
      }

      // 清理过期锁
      for (const [lockKey, lockTime] of this.processingLocks.entries()) {
        if (now - lockTime > 30000) { // 30秒超时
          this.processingLocks.delete(lockKey);
        }
      }

      // 清理审计记录
      if (this.verificationAudit.length > this.maxAuditEntries) {
        this.verificationAudit = this.verificationAudit.slice(-this.maxAuditEntries);
      }

      logger.debug('清理过期支付数据', {
        noncesCleared: nonceCount,
        transactionsCleared: txCount
      });
    } catch (error) {
      logger.error('清理过期支付数据失败', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * 生成支付签名
   * @param {Object} paymentData - 支付数据
   * @param {string} merchantKey - 商户密钥
   * @param {Object} options - 签名选项
   * @returns {string} 签名
   */
  async generateSignature(paymentData, merchantKey, options = {}) {
    try {
      // 生成nonce
      const nonce = options.nonce || (await randomBytes(16)).toString('hex');
      
      // 获取时间戳
      const timestamp = options.timestamp || Date.now();
      
      // 合并数据
      const dataToSign = {
        ...paymentData,
        nonce,
        timestamp
      };
      
      // 按字段名称排序
      const sortedData = this._sortObjectKeys(dataToSign);
      
      // 构建签名字符串
      const signString = this._buildSignString(sortedData);
      
      // 使用HMAC生成签名
      const signature = crypto.createHmac(this.hmacAlgorithm, merchantKey)
        .update(signString)
        .digest(this.encoding);
      
      // 返回完整签名包
      return {
        signature,
        nonce,
        timestamp
      };
    } catch (error) {
      logger.error('生成支付签名失败', {
        error: error.message,
        paymentData: this._sanitizeData(paymentData),
        stack: error.stack
      });
      throw new Error('生成支付签名失败');
    }
  }

  /**
   * 验证支付签名
   * @param {Object} paymentData - 支付数据
   * @param {string} signature - 待验证的签名
   * @param {string} merchantKey - 商户密钥
   * @param {Object} options - 验证选项
   * @returns {boolean} 验证结果
   */
  async verifySignature(paymentData, signature, merchantKey, options = {}) {
    try {
      const { nonce, timestamp } = options;
      
      // 验证必要参数
      if (!signature || !nonce || !timestamp) {
        this._addVerificationAudit('SIGNATURE_MISSING_PARAMS', {
          paymentData: this._sanitizeData(paymentData)
        });
        return false;
      }
      
      // 验证时间戳 (默认5分钟窗口)
      const timeWindow = options.strict 
        ? this.strictTimeWindow 
        : (options.timeWindow || this.defaultTimeWindow);
      
      const now = Date.now();
      const signTime = parseInt(timestamp);
      
      if (isNaN(signTime) || Math.abs(now - signTime) > timeWindow) {
        this._addVerificationAudit('SIGNATURE_TIMESTAMP_INVALID', {
          timestamp,
          now,
          window: timeWindow
        });
        return false;
      }
      
      // 验证nonce未被使用过 (防重放)
      if (!await this._verifyNonceUnique(nonce, options.merchantId)) {
        this._addVerificationAudit('SIGNATURE_NONCE_REUSED', {
          nonce
        });
        return false;
      }
      
      // 合并数据
      const dataToVerify = {
        ...paymentData,
        nonce,
        timestamp
      };
      
      // 按字段名称排序
      const sortedData = this._sortObjectKeys(dataToVerify);
      
      // 构建签名字符串
      const signString = this._buildSignString(sortedData);
      
      // 生成签名
      const calculatedSignature = crypto.createHmac(this.hmacAlgorithm, merchantKey)
        .update(signString)
        .digest(this.encoding);
      
      // 比较签名 (使用常量时间比较防止计时攻击)
      const isValid = crypto.timingSafeEqual(
        Buffer.from(calculatedSignature, this.encoding),
        Buffer.from(signature, this.encoding)
      );
      
      // 如果验证成功，标记nonce为已使用
      if (isValid) {
        await this._markNonceAsUsed(nonce, options.merchantId);
        
        this._addVerificationAudit('SIGNATURE_VALID', {
          paymentData: this._sanitizeData(paymentData)
        });
      } else {
        this._addVerificationAudit('SIGNATURE_INVALID', {
          paymentData: this._sanitizeData(paymentData)
        });
      }
      
      return isValid;
    } catch (error) {
      logger.error('验证支付签名失败', {
        error: error.message,
        paymentData: this._sanitizeData(paymentData),
        stack: error.stack
      });
      
      this._addVerificationAudit('SIGNATURE_VERIFICATION_ERROR', {
        error: error.message,
        paymentData: this._sanitizeData(paymentData)
      });
      
      return false;
    }
  }

  /**
   * 验证支付通知
   * @param {Object} notifyData - 支付通知数据
   * @param {Object} options - 验证选项
   * @returns {boolean} 验证结果
   */
  async verifyPaymentNotify(notifyData, options = {}) {
    // 获取锁以确保同一通知不会并发处理
    const notifyId = notifyData.transactionId || notifyData.orderId || 'unknown';
    const lockKey = `notify:${notifyId}`;
    
    if (this.processingLocks.has(lockKey)) {
      logger.warn('支付通知正在处理中，忽略重复请求', { notifyId });
      return false;
    }
    
    try {
      // 设置处理锁
      this.processingLocks.set(lockKey, Date.now());
      
      const {
        signature,
        timestamp,
        nonce,
        transactionId,
        ...paymentData
      } = notifyData;

      // 验证必要字段
      if (!signature || !timestamp || !nonce || !transactionId) {
        this._addVerificationAudit('NOTIFY_MISSING_PARAMS', {
          notifyData: this._sanitizeData(notifyData)
        });
        return false;
      }

      // 验证时间戳
      const now = Date.now();
      const notifyTime = parseInt(timestamp);
      if (isNaN(notifyTime) || Math.abs(now - notifyTime) > config.payment.notifyTimeWindow) {
        this._addVerificationAudit('NOTIFY_TIMESTAMP_INVALID', {
          timestamp,
          now,
          window: config.payment.notifyTimeWindow
        });
        return false;
      }

      // 验证交易ID是否已处理（幂等性检查）
      if (await this._isTransactionProcessed(transactionId)) {
        this._addVerificationAudit('NOTIFY_DUPLICATE_TRANSACTION', {
          transactionId
        });
        return false;
      }
      
      // 使用严格模式验证签名
      const isValid = await this.verifySignature(
        { ...paymentData, transactionId },
        signature, 
        config.payment.merchantKey,
        { 
          nonce,
          timestamp,
          strict: true,
          merchantId: config.payment.merchantId
        }
      );
      
      // 如果验证成功，标记交易为已处理
      if (isValid) {
        await this._markTransactionAsProcessed(transactionId);
        
        this._addVerificationAudit('NOTIFY_VALID', {
          transactionId,
          amount: paymentData.amount
        });
      }

      return isValid;
    } catch (error) {
      logger.error('验证支付通知失败', {
        error: error.message,
        notifyData: this._sanitizeData(notifyData),
        stack: error.stack
      });
      
      this._addVerificationAudit('NOTIFY_VERIFICATION_ERROR', {
        error: error.message,
        notifyId
      });
      
      return false;
    } finally {
      // 释放处理锁
      this.processingLocks.delete(lockKey);
    }
  }

  /**
   * 验证Nonce是否唯一
   * @private
   * @param {string} nonce - 验证的nonce
   * @param {string} merchantId - 商户ID
   * @returns {boolean} 是否唯一
   */
  async _verifyNonceUnique(nonce, merchantId = 'default') {
    const key = `${merchantId}:${nonce}`;
    
    // 优先使用Redis进行分布式验证
    if (redisClient) {
      try {
        // 使用Redis SETNX原子操作
        const result = await redisClient.set(
          `payment:nonce:${key}`,
          '1',
          'NX',
          'EX',
          Math.floor(this.maxNonceAge / 1000)
        );
        return result === 'OK';
      } catch (error) {
        logger.warn('Redis nonce验证失败，回退到内存存储', {
          error: error.message
        });
        // 回退到内存存储
      }
    }
    
    // 使用内存存储
    if (this.nonceStore.has(key)) {
      return false;
    }
    
    return true;
  }

  /**
   * 标记Nonce为已使用
   * @private
   * @param {string} nonce - 要标记的nonce
   * @param {string} merchantId - 商户ID
   */
  async _markNonceAsUsed(nonce, merchantId = 'default') {
    const key = `${merchantId}:${nonce}`;
    
    // 如果已经在Redis中设置，无需重复设置
    if (!redisClient) {
      this.nonceStore.set(key, {
        timestamp: Date.now(),
        merchantId
      });
    }
  }

  /**
   * 检查交易是否已处理
   * @private
   * @param {string} transactionId - 交易ID
   * @returns {boolean} 是否已处理
   */
  async _isTransactionProcessed(transactionId) {
    // 优先使用Redis进行分布式检查
    if (redisClient) {
      try {
        const exists = await redisClient.exists(`payment:tx:${transactionId}`);
        return exists === 1;
      } catch (error) {
        logger.warn('Redis交易检查失败，回退到内存存储', {
          error: error.message
        });
        // 回退到内存存储
      }
    }
    
    // 使用内存存储
    return this.processedTransactions.has(transactionId);
  }

  /**
   * 标记交易为已处理
   * @private
   * @param {string} transactionId - 交易ID
   */
  async _markTransactionAsProcessed(transactionId) {
    // 优先使用Redis进行分布式标记
    if (redisClient) {
      try {
        // 设置过期时间为24小时
        await redisClient.setex(
          `payment:tx:${transactionId}`,
          Math.floor(this.maxNonceAge / 1000),
          Date.now().toString()
        );
        return;
      } catch (error) {
        logger.warn('Redis标记交易失败，回退到内存存储', {
          error: error.message
        });
        // 回退到内存存储
      }
    }
    
    // 使用内存存储
    this.processedTransactions.set(transactionId, Date.now());
  }

  /**
   * 对象按键名排序
   * @private
   * @param {Object} obj - 待排序对象
   * @returns {Object} 排序后的对象
   */
  _sortObjectKeys(obj) {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        if (obj[key] !== undefined && obj[key] !== null) {
          acc[key] = obj[key];
        }
        return acc;
      }, {});
  }

  /**
   * 构建签名字符串
   * @private
   * @param {Object} data - 数据对象
   * @returns {string} 签名字符串
   */
  _buildSignString(data) {
    return Object.entries(data)
      .map(([key, value]) => {
        // 如果值是对象，则进行JSON序列化
        const stringValue = typeof value === 'object' 
          ? JSON.stringify(value)
          : String(value);
        
        return `${key}=${stringValue}`;
      })
      .join('&');
  }
  
  /**
   * 添加验证审计记录
   * @private
   * @param {string} action - 操作类型
   * @param {Object} data - 审计数据
   */
  _addVerificationAudit(action, data) {
    const auditEntry = {
      timestamp: Date.now(),
      action,
      data
    };
    
    this.verificationAudit.push(auditEntry);
    
    // 限制审计记录数量
    if (this.verificationAudit.length > this.maxAuditEntries) {
      this.verificationAudit.shift();
    }
    
    // 严重错误记录到日志
    if (['NOTIFY_VERIFICATION_ERROR', 'SIGNATURE_INVALID', 'NOTIFY_DUPLICATE_TRANSACTION'].includes(action)) {
      logger.warn('支付验证安全事件', { action, ...data });
    }
  }
  
  /**
   * 脱敏敏感数据用于日志
   * @private
   * @param {Object} data - 原始数据
   * @returns {Object} 脱敏后的数据
   */
  _sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    const sensitiveFields = [
      'cardNumber', 'cvv', 'password', 'secret', 'key', 
      'token', 'account', 'credentials', 'securityCode'
    ];
    
    const result = { ...data };
    
    for (const key in result) {
      // 检查字段名是否包含敏感信息
      const isFieldSensitive = sensitiveFields.some(
        field => key.toLowerCase().includes(field.toLowerCase())
      );
      
      if (isFieldSensitive) {
        // 脱敏但保留部分信息以便调试
        if (typeof result[key] === 'string' && result[key].length > 4) {
          result[key] = `${result[key].substring(0, 2)}****${result[key].substring(result[key].length - 2)}`;
        } else {
          result[key] = '****';
        }
      } else if (typeof result[key] === 'object' && result[key] !== null) {
        // 递归处理嵌套对象
        result[key] = this._sanitizeData(result[key]);
      }
    }
    
    return result;
  }
  
  /**
   * 生成安全的随机交易ID
   * @returns {string} 交易ID
   */
  async generateTransactionId() {
    try {
      // 生成32字节的随机数
      const randomId = (await randomBytes(32)).toString('hex');
      // 添加时间戳前缀
      return `tx-${Date.now()}-${randomId}`;
    } catch (error) {
      logger.error('生成交易ID失败', {
        error: error.message,
        stack: error.stack
      });
      // 回退方案
      return `tx-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }
  }
  
  /**
   * 获取验证审计记录
   * @param {Object} query - 查询条件
   * @returns {Array} 审计记录
   */
  getVerificationAudit(query = {}) {
    let logs = [...this.verificationAudit];
    
    // 按条件筛选
    if (query.action) {
      logs = logs.filter(log => log.action === query.action);
    }
    
    if (query.startTime) {
      logs = logs.filter(log => log.timestamp >= query.startTime);
    }
    
    if (query.endTime) {
      logs = logs.filter(log => log.timestamp <= query.endTime);
    }
    
    // 按时间排序
    logs.sort((a, b) => b.timestamp - a.timestamp);
    
    // 分页
    if (query.limit) {
      const start = query.offset || 0;
      const end = start + query.limit;
      logs = logs.slice(start, end);
    }
    
    return logs;
  }
}

// 导出单例
module.exports = new PaymentSignature(); 