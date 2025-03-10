/**
 * 支付工厂类
 * 用于创建不同支付渠道的实例
 */

const logger = require('../../utils/logger');
const PaymentConfigModel = require('../models/PaymentConfig');

class PaymentFactory {
  /**
   * 可用的支付提供商
   */
  static PROVIDERS = Object.freeze({
    WEIXIN: 'weixin',
    ZHIFUBAO: 'zhifubao'
  });

  /**
   * 创建支付处理器实例
   * @param {String} provider - 支付提供商
   * @param {Object} config - 支付配置（可选，如不提供则从数据库加载）
   * @returns {Promise<Object>} 支付处理器实例
   */
  static async createPayment(provider, config = null) {
    try {
      let paymentConfig = config;

      // 如果未提供配置，则从数据库加载
      if (!paymentConfig) {
        const configDoc = await PaymentConfigModel.findOne({ 
          provider, 
          isActive: true 
        });
        
        if (!configDoc) {
          throw new Error(`未找到有效的${provider}支付配置`);
        }
        
        paymentConfig = configDoc.config;
      }

      // 根据提供商创建对应的支付处理器
      switch (provider.toLowerCase()) {
        case this.PROVIDERS.WEIXIN:
          const WeixinPayment = require('../weixin/WeixinPayment');
          return new WeixinPayment(paymentConfig);
          
        case this.PROVIDERS.ZHIFUBAO:
          const ZhifubaoPayment = require('../zhifubao/ZhifubaoPayment');
          return new ZhifubaoPayment(paymentConfig);
          
        default:
          throw new Error(`不支持的支付提供商: ${provider}`);
      }
    } catch (error) {
      logger.error(`创建支付处理器失败: ${error.message}`, {
        provider,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 获取所有可用的支付提供商
   * @returns {Promise<Array>} 支付提供商列表
   */
  static async getAvailableProviders() {
    try {
      const configs = await PaymentConfigModel.find({ isActive: true })
        .select('provider name description icon');
      
      return configs.map(config => ({
        id: config.provider,
        name: config.name,
        description: config.description,
        icon: config.icon
      }));
    } catch (error) {
      logger.error(`获取支付提供商列表失败: ${error.message}`, {
        stack: error.stack
      });
      return [];
    }
  }

  /**
   * 验证支付配置
   * @param {String} provider - 支付提供商
   * @param {Object} config - 支付配置
   * @returns {Promise<Boolean>} 验证结果
   */
  static async validateConfig(provider, config) {
    try {
      const payment = await this.createPayment(provider, config);
      
      // 调用测试接口验证配置是否有效
      const testResult = await payment.testConnection();
      return { 
        isValid: testResult.success, 
        message: testResult.message 
      };
    } catch (error) {
      logger.error(`验证支付配置失败: ${error.message}`, {
        provider,
        stack: error.stack
      });
      return { 
        isValid: false, 
        message: error.message 
      };
    }
  }
}

module.exports = PaymentFactory; 