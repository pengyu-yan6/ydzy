/**
 * API密钥管理模块
 * 实现密钥的安全存储、加密和访问
 */

const crypto = require('crypto');
const encryption = require('../../utils/encryption');
const logger = require('../../utils/logger');
const config = require('../../config');
const PaymentConfigModel = require('../models/PaymentConfig');

/**
 * 生成随机密钥
 * @param {Number} length - 密钥长度
 * @returns {String} 随机密钥
 */
function generateRandomKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * 安全地存储密钥
 * @param {String} provider - 支付提供商
 * @param {String} keyType - 密钥类型
 * @param {String} keyValue - 密钥值
 * @param {Number} validityDays - 有效期天数（默认90天）
 * @returns {Promise<Boolean>} 是否成功
 */
async function storeKey(provider, keyType, keyValue, validityDays = 90) {
  try {
    // 加密密钥
    const encryptedKey = encryption.encrypt(keyValue);
    
    // 计算过期时间
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + validityDays);
    
    // 存储到数据库
    const result = await PaymentConfigModel.updateOne(
      { provider }, 
      { 
        $set: { 
          [`config.${keyType}`]: encryptedKey,
          [`config.${keyType}ExpiryDate`]: expiryDate,
          updatedAt: new Date()
        } 
      },
      { upsert: true }
    );
    
    logger.info(`成功更新密钥`, { 
      provider, 
      keyType,
      expiryDate,
      success: result.acknowledged
    });
    
    return true;
  } catch (error) {
    logger.error(`存储密钥失败`, {
      provider,
      keyType,
      error: error.message,
      stack: error.stack
    });
    
    return false;
  }
}

/**
 * 获取已存储的密钥
 * @param {String} provider - 支付提供商
 * @param {String} keyType - 密钥类型
 * @returns {Promise<Object>} 解密后的密钥及过期信息
 */
async function getKey(provider, keyType) {
  try {
    // 从数据库获取配置
    const paymentConfig = await PaymentConfigModel.findOne({ provider });
    
    if (!paymentConfig || !paymentConfig.config || !paymentConfig.config[keyType]) {
      logger.warn(`未找到密钥`, { provider, keyType });
      return null;
    }
    
    // 检查密钥是否过期
    const expiryDate = paymentConfig.config[`${keyType}ExpiryDate`];
    const isExpired = expiryDate && new Date() > new Date(expiryDate);
    
    // 解密密钥
    const keyValue = encryption.decrypt(paymentConfig.config[keyType]);
    
    return {
      value: keyValue,
      expiryDate,
      isExpired
    };
  } catch (error) {
    logger.error(`获取密钥失败`, {
      provider,
      keyType,
      error: error.message,
      stack: error.stack
    });
    
    return null;
  }
}

/**
 * 验证密钥有效性
 * @param {String} provider - 支付提供商
 * @returns {Promise<Boolean>} 是否有效
 */
async function validateKeys(provider) {
  try {
    const paymentConfig = await PaymentConfigModel.findOne({ provider });
    
    if (!paymentConfig || !paymentConfig.config) {
      return false;
    }
    
    // 根据不同支付提供商验证必要的密钥
    switch (provider) {
      case 'weixin':
        return !!(paymentConfig.config.appId && 
                 paymentConfig.config.mchId && 
                 paymentConfig.config.mchKey);
      
      case 'zhifubao':
        return !!(paymentConfig.config.appId && 
                 paymentConfig.config.privateKey);
      
      default:
        return false;
    }
  } catch (error) {
    logger.error(`验证密钥失败`, {
      provider,
      error: error.message,
      stack: error.stack
    });
    
    return false;
  }
}

/**
 * 轮换密钥
 * @param {String} provider - 支付提供商
 * @param {String} keyType - 密钥类型
 * @returns {Promise<Object>} 新密钥信息
 */
async function rotateKey(provider, keyType) {
  try {
    // 生成新密钥
    const newKey = generateRandomKey();
    
    // 存储新密钥
    const success = await storeKey(provider, keyType, newKey);
    
    if (success) {
      logger.info(`成功轮换密钥`, { 
        provider, 
        keyType
      });
      
      return {
        success: true,
        key: newKey
      };
    }
    
    return {
      success: false,
      message: '存储新密钥失败'
    };
  } catch (error) {
    logger.error(`轮换密钥失败`, {
      provider,
      keyType,
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 根据提供商获取加密方法
 * @param {String} provider - 支付提供商
 * @returns {Function} 加密方法
 */
function getEncryptionMethodForProvider(provider) {
  switch (provider) {
    case 'weixin':
      return (data, key) => {
        // 微信支付的MD5签名
        return crypto
          .createHash('md5')
          .update(`${data}&key=${key}`)
          .digest('hex')
          .toUpperCase();
      };
      
    case 'zhifubao':
      return (data, privateKey) => {
        // 支付宝的RSA签名
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(data);
        return sign.sign(privateKey, 'base64');
      };
      
    default:
      return (data) => data; // 默认不加密
  }
}

/**
 * 检查密钥是否即将过期
 * @param {String} provider - 支付提供商
 * @param {Number} daysThreshold - 提前多少天警告（默认7天）
 * @returns {Promise<Array>} 即将过期的密钥列表
 */
async function checkExpiringKeys(provider, daysThreshold = 7) {
  try {
    const paymentConfig = await PaymentConfigModel.findOne({ provider });
    
    if (!paymentConfig || !paymentConfig.config) {
      return [];
    }
    
    const expiringKeys = [];
    const now = new Date();
    const threshold = new Date();
    threshold.setDate(now.getDate() + daysThreshold);
    
    // 检查每个密钥
    for (const [key, value] of Object.entries(paymentConfig.config)) {
      // 只检查带ExpiryDate后缀的字段
      if (key.endsWith('ExpiryDate')) {
        const keyType = key.replace('ExpiryDate', '');
        const expiryDate = new Date(value);
        
        // 如果过期日期在阈值内
        if (expiryDate <= threshold && expiryDate > now) {
          expiringKeys.push({
            provider,
            keyType,
            expiryDate,
            daysRemaining: Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
          });
        }
      }
    }
    
    return expiringKeys;
  } catch (error) {
    logger.error(`检查即将过期密钥失败`, {
      provider,
      error: error.message,
      stack: error.stack
    });
    
    return [];
  }
}

/**
 * 自动轮换即将过期的密钥
 * @param {Array} providers - 支付提供商列表
 * @param {Number} daysBeforeExpiry - 过期前多少天轮换（默认7天）
 * @returns {Promise<Object>} 轮换结果
 */
async function autoRotateExpiringKeys(providers = ['weixin', 'zhifubao'], daysBeforeExpiry = 7) {
  const results = {
    rotated: [],
    failed: [],
    skipped: []
  };
  
  // 遍历每个提供商
  for (const provider of providers) {
    try {
      // 获取即将过期的密钥
      const expiringKeys = await checkExpiringKeys(provider, daysBeforeExpiry);
      
      if (expiringKeys.length === 0) {
        results.skipped.push({ provider, reason: 'no-expiring-keys' });
        continue;
      }
      
      // 轮换每个即将过期的密钥
      for (const keyInfo of expiringKeys) {
        try {
          // 获取当前密钥
          const currentKey = await getKey(provider, keyInfo.keyType);
          
          if (!currentKey || !currentKey.value) {
            results.failed.push({ 
              provider, 
              keyType: keyInfo.keyType, 
              reason: 'key-not-found'
            });
            continue;
          }
          
          // 生成新密钥
          const newKey = generateRandomKey();
          
          // 存储新密钥，有效期90天
          const success = await storeKey(provider, keyInfo.keyType, newKey, 90);
          
          if (success) {
            results.rotated.push({
              provider,
              keyType: keyInfo.keyType,
              expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            });
            
            logger.info(`已自动轮换密钥`, {
              provider,
              keyType: keyInfo.keyType
            });
          } else {
            results.failed.push({ 
              provider, 
              keyType: keyInfo.keyType, 
              reason: 'store-failed'
            });
          }
        } catch (keyError) {
          results.failed.push({ 
            provider, 
            keyType: keyInfo.keyType, 
            reason: keyError.message
          });
          
          logger.error(`密钥轮换失败`, {
            provider,
            keyType: keyInfo.keyType,
            error: keyError.message
          });
        }
      }
    } catch (providerError) {
      results.failed.push({ 
        provider, 
        reason: providerError.message 
      });
      
      logger.error(`获取即将过期密钥失败`, {
        provider,
        error: providerError.message
      });
    }
  }
  
  return results;
}

module.exports = {
  generateRandomKey,
  storeKey,
  getKey,
  validateKeys,
  rotateKey,
  getEncryptionMethodForProvider,
  checkExpiringKeys,
  autoRotateExpiringKeys
}; 