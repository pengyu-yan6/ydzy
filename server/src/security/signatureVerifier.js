const crypto = require('crypto');
const config = require('../config/security.config');
const logger = require('../utils/logger');

/**
 * 请求签名验证机制
 * 用于验证客户端请求的合法性，防止请求伪造和中间人攻击
 */
class SignatureVerifier {
  // nonce缓存 (生产环境应使用Redis替代内存存储)
  static nonceCache = new Map();
  static maxCacheSize = 10000; // 最大缓存数量
  
  /**
   * 签名生成算法（服务端使用相同算法验证）
   * @param {Object} payload - 请求负载
   * @param {String} timestamp - 请求时间戳
   * @param {String} nonce - 随机字符串
   * @param {String} secretKey - 密钥
   * @returns {String} - 生成的签名
   */
  static generateSignature(payload, timestamp, nonce, secretKey) {
    // 将参数按照字典序排序
    const params = {
      ...payload,
      timestamp,
      nonce,
    };
    
    // 将对象转为键值对数组并排序
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => {
        // 深度转换对象为字符串，确保对象序列化的一致性
        let value = params[key];
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            // 对数组进行稳定排序（如果是简单值的数组）
            value = [...value].sort().map(item => 
              typeof item === 'object' && item !== null ? 
                this.sortObjectDeep(item) : item
            );
          } else {
            // 对对象进行递归排序
            value = this.sortObjectDeep(value);
          }
          value = JSON.stringify(value);
        }
        return `${key}=${value}`;
      })
      .join('&');
    
    // 使用HMAC-SHA256生成签名
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(sortedParams);
    return hmac.digest('hex');
  }
  
  /**
   * 递归排序对象的所有键
   * @param {Object} obj - 需要排序的对象
   * @returns {Object} - 排序后的对象
   */
  static sortObjectDeep(obj) {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectDeep(item));
    }
    
    return Object.keys(obj).sort().reduce((result, key) => {
      result[key] = this.sortObjectDeep(obj[key]);
      return result;
    }, {});
  }
  
  /**
   * 验证请求签名
   * @param {Object} req - Express请求对象
   * @returns {Boolean} - 签名是否有效
   */
  static verifyRequestSignature(req) {
    try {
      const { signature, timestamp, nonce } = req.headers;
      
      // 检查必要的头信息是否存在
      if (!signature || !timestamp || !nonce) {
        logger.warn('缺少必要的签名参数', {
          ip: req.ip,
          path: req.path,
          headers: req.headers
        });
        return false;
      }
      
      // 验证时间戳是否在有效期内（防止重放攻击）
      const currentTime = Math.floor(Date.now() / 1000);
      const requestTime = parseInt(timestamp, 10);
      
      if (isNaN(requestTime) || requestTime > currentTime || 
          currentTime - requestTime > config.security.signatureTimeWindow) {
        logger.warn('请求时间戳过期或无效', {
          currentTime,
          requestTime,
          ip: req.ip,
          path: req.path
        });
        return false;
      }
      
      // 检查nonce是否已使用过（使用单例模式的内存缓存或Redis）
      if (this.isNonceUsed(nonce, requestTime)) {
        logger.warn('请求nonce已被使用过，可能是重放攻击', {
          nonce,
          timestamp: requestTime,
          ip: req.ip,
          path: req.path
        });
        return false;
      }
      
      // 获取请求体数据
      const payload = { ...req.body };
      
      // 根据请求类型确定密钥（可以根据不同的请求使用不同的密钥）
      const secretKey = this.getSecretKeyForRequest(req);
      
      // 生成签名并比较
      const calculatedSignature = this.generateSignature(payload, timestamp, nonce, secretKey);
      
      // 使用时间安全的比较以防止时序攻击
      let isValid = false;
      try {
        isValid = crypto.timingSafeEqual(
          Buffer.from(calculatedSignature, 'hex'),
          Buffer.from(signature, 'hex')
        );
      } catch (error) {
        // 签名长度不一致时会抛出错误
        isValid = false;
        logger.warn('签名比较错误', {
          error: error.message,
          ip: req.ip
        });
      }
      
      if (isValid) {
        // 签名有效，记录使用过的nonce
        this.markNonceAsUsed(nonce, requestTime);
      } else {
        logger.warn('请求签名验证失败', {
          ip: req.ip,
          path: req.path,
          expectedSignature: calculatedSignature,
          receivedSignature: signature
        });
      }
      
      return isValid;
    } catch (error) {
      logger.error('签名验证过程发生错误', {
        error: error.message,
        ip: req.ip,
        path: req.path
      });
      return false;
    }
  }
  
  /**
   * 根据请求选择适当的密钥
   * @param {Object} req - Express请求对象
   * @returns {String} - 适用于此请求的密钥
   */
  static getSecretKeyForRequest(req) {
    // 根据请求路径或类型选择不同的密钥
    if (req.path.startsWith('/api/payment')) {
      return config.security.paymentSecretKey;
    } else if (req.path.startsWith('/api/game/battle')) {
      return config.security.battleSecretKey;
    } else {
      return config.security.defaultSecretKey;
    }
  }
  
  /**
   * 创建Express中间件，用于验证请求签名
   * @param {Object} options - 可选配置项
   * @returns {Function} - Express中间件函数
   */
  static createMiddleware(options = {}) {
    const { 
      excludePaths = [],
      isRequired = true,
      onInvalid = null
    } = options;
    
    return (req, res, next) => {
      // 检查是否为排除路径
      if (excludePaths.some(path => {
        return typeof path === 'string' 
          ? req.path === path 
          : (path instanceof RegExp ? path.test(req.path) : false);
      })) {
        return next();
      }
      
      const isValid = this.verifyRequestSignature(req);
      
      // 如果签名有效或非必需，继续处理
      if (isValid || !isRequired) {
        // 将验证结果添加到请求对象，以便后续处理可以获取
        req.signatureValid = isValid;
        return next();
      }
      
      // 自定义处理无效签名的回调
      if (typeof onInvalid === 'function') {
        return onInvalid(req, res, next);
      }
      
      // 默认处理：返回401错误
      return res.status(401).json({
        success: false,
        message: '无效的请求签名',
        error: 'INVALID_SIGNATURE'
      });
    };
  }
  
  /**
   * 检查nonce是否已被使用
   * @param {String} nonce - 请求nonce
   * @param {Number} timestamp - 请求时间戳
   * @returns {Boolean} - 是否已被使用
   */
  static isNonceUsed(nonce, timestamp) {
    return this.nonceCache.has(nonce);
  }
  
  /**
   * 将nonce标记为已使用
   * @param {String} nonce - 请求nonce
   * @param {Number} timestamp - 请求时间戳
   */
  static markNonceAsUsed(nonce, timestamp) {
    // 限制缓存大小，防止内存溢出
    if (this.nonceCache.size >= this.maxCacheSize) {
      // 删除最早添加的10%条目
      const keysToDelete = Array.from(this.nonceCache.keys())
        .slice(0, Math.floor(this.maxCacheSize * 0.1));
      
      keysToDelete.forEach(key => this.nonceCache.delete(key));
    }
    
    // 存储nonce和过期时间
    const expiryTime = timestamp + config.security.signatureTimeWindow;
    this.nonceCache.set(nonce, expiryTime);
    
    // 设置定时清理任务，过期后自动删除
    setTimeout(() => {
      this.nonceCache.delete(nonce);
    }, (expiryTime - Math.floor(Date.now() / 1000)) * 1000);
  }
  
  /**
   * 清理过期的nonce（可定期调用）
   */
  static cleanExpiredNonces() {
    const currentTime = Math.floor(Date.now() / 1000);
    
    for (const [nonce, expiryTime] of this.nonceCache.entries()) {
      if (currentTime > expiryTime) {
        this.nonceCache.delete(nonce);
      }
    }
  }
}

module.exports = SignatureVerifier; 