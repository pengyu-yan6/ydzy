/**
 * 支付基类
 * 定义支付处理的基本接口和共通功能
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');
const encryption = require('../../utils/encryption');

class PaymentBase {
  /**
   * 初始化支付处理器
   * @param {Object} config - 支付配置
   */
  constructor(config) {
    this.config = config;
    this.provider = 'base';
    this.validateConfig();
  }

  /**
   * 验证配置是否有效
   * @throws {Error} 配置无效时抛出异常
   */
  validateConfig() {
    if (!this.config) {
      throw new Error('支付配置不能为空');
    }
  }

  /**
   * 统一下单接口
   * @param {Object} orderData - 订单数据
   * @returns {Promise<Object>} 支付结果
   */
  async createOrder(orderData) {
    throw new Error('子类必须实现createOrder方法');
  }

  /**
   * 查询订单状态
   * @param {String} orderId - 订单ID
   * @returns {Promise<Object>} 订单状态
   */
  async queryOrder(orderId) {
    throw new Error('子类必须实现queryOrder方法');
  }

  /**
   * 订单退款
   * @param {Object} refundData - 退款数据
   * @returns {Promise<Object>} 退款结果
   */
  async refund(refundData) {
    throw new Error('子类必须实现refund方法');
  }

  /**
   * 查询退款状态
   * @param {String} refundId - 退款ID
   * @returns {Promise<Object>} 退款状态
   */
  async queryRefund(refundId) {
    throw new Error('子类必须实现queryRefund方法');
  }

  /**
   * 验证异步通知
   * @param {Object} notifyData - 通知数据
   * @returns {Boolean} 验证结果
   */
  verifyNotification(notifyData) {
    throw new Error('子类必须实现verifyNotification方法');
  }

  /**
   * 处理异步通知
   * @param {Object} notifyData - 通知数据
   * @returns {Promise<Object>} 处理结果
   */
  async handleNotification(notifyData) {
    throw new Error('子类必须实现handleNotification方法');
  }

  /**
   * 下载对账单
   * @param {String} date - 对账日期 YYYYMMDD
   * @returns {Promise<Object>} 对账单数据
   */
  async downloadReconciliation(date) {
    throw new Error('子类必须实现downloadReconciliation方法');
  }

  /**
   * 计算签名
   * @param {Object} params - 需要签名的参数
   * @param {String} secretKey - 密钥
   * @param {String} algorithm - 签名算法
   * @returns {String} 签名结果
   */
  generateSignature(params, secretKey, algorithm = 'sha256') {
    // 对参数按字母顺序排序
    const sortedParams = Object.keys(params).sort().reduce(
      (result, key) => {
        // 跳过签名字段和空值
        if (key !== 'sign' && params[key] !== '' && params[key] != null) {
          result[key] = params[key];
        }
        return result;
      }, {}
    );

    // 构建签名字符串
    const signStr = Object.entries(sortedParams)
      .map(([key, value]) => `${key}=${value}`)
      .join('&') + `&key=${secretKey}`;

    // 计算签名
    return crypto
      .createHash(algorithm)
      .update(signStr, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  /**
   * 验证签名
   * @param {Object} params - 包含签名的参数
   * @param {String} secretKey - 密钥
   * @param {String} algorithm - 签名算法
   * @returns {Boolean} 验证结果
   */
  verifySignature(params, secretKey, algorithm = 'sha256') {
    if (!params.sign) {
      logger.warn('缺少签名字段', { provider: this.provider });
      return false;
    }

    const receivedSign = params.sign;
    const calculatedSign = this.generateSignature(params, secretKey, algorithm);

    return receivedSign === calculatedSign;
  }

  /**
   * 安全记录日志（过滤敏感信息）
   * @param {String} level - 日志级别
   * @param {String} message - 日志消息
   * @param {Object} data - 日志数据
   */
  logSafe(level, message, data = {}) {
    // 定义需要掩码的敏感字段
    const sensitiveFields = [
      'mchKey', 'appSecret', 'privateKey', 'password', 'cardNumber',
      'cvv', 'idCard', 'phone', 'email', 'bankAccount'
    ];

    // 深拷贝数据以避免修改原始对象
    const safeData = JSON.parse(JSON.stringify(data));

    // 遍历对象递归掩码敏感字段
    const maskSensitiveData = (obj) => {
      if (typeof obj !== 'object' || obj === null) {
        return;
      }

      for (const key in obj) {
        if (sensitiveFields.includes(key)) {
          obj[key] = '******';
        } else if (typeof obj[key] === 'object') {
          maskSensitiveData(obj[key]);
        }
      }
    };

    maskSensitiveData(safeData);

    // 添加支付提供商信息
    safeData.provider = this.provider;

    // 记录日志
    logger[level](message, safeData);
  }
}

module.exports = PaymentBase; 