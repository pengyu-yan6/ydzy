/**
 * 支付配置管理控制器
 * 处理支付配置的增删改查
 */

const mongoose = require('mongoose');
const PaymentConfig = require('../models/PaymentConfig');
const PaymentFactory = require('../core/PaymentFactory');
const keyManager = require('../core/keyManager');
const logger = require('../../utils/logger');
const encryption = require('../../utils/encryption');

/**
 * 获取所有支付配置
 */
exports.getAllConfigs = async (req, res) => {
  try {
    // 权限检查
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问支付配置'
      });
    }
    
    // 获取配置列表，但不返回敏感信息
    const configs = await PaymentConfig.find()
      .select('-config.privateKey -config.mchKey -config.pfx -config.pfxPassword -config.appSecret -config.secret -config.securityKey')
      .sort({ createdAt: -1 });
    
    // 处理配置数据，移除所有隐式的敏感信息
    const sanitizedConfigs = configs.map(config => {
      const sanitizedConfig = config.toObject();
      
      // 递归检查并掩码敏感字段
      const sensitiveFields = ['key', 'secret', 'password', 'token', 'privateKey', 'private', 'certificate'];
      
      const maskSensitiveData = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        
        Object.keys(obj).forEach(key => {
          // 检查键名是否包含敏感字段名
          if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
            if (typeof obj[key] === 'string' && obj[key].length > 0) {
              obj[key] = '******';
            }
          } else if (typeof obj[key] === 'object') {
            maskSensitiveData(obj[key]);
          }
        });
      };
      
      maskSensitiveData(sanitizedConfig.config);
      
      return sanitizedConfig;
    });
    
    return res.status(200).json({
      success: true,
      data: sanitizedConfigs
    });
  } catch (error) {
    logger.error('获取支付配置列表失败', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: '获取支付配置列表失败'
    });
  }
};

/**
 * 获取支付配置详情
 */
exports.getConfigById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 权限检查
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '没有权限访问支付配置'
      });
    }
    
    // 验证ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: '无效的配置ID'
      });
    }
    
    // 获取配置，但不返回敏感信息
    const config = await PaymentConfig.findById(id)
      .select('-config.privateKey -config.mchKey -config.pfx -config.pfxPassword');
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: '未找到支付配置'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('获取支付配置详情失败', {
      id: req.params.id,
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: '获取支付配置详情失败'
    });
  }
};

/**
 * 创建支付配置
 */
exports.createConfig = async (req, res) => {
  try {
    // 权限检查
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '没有权限创建支付配置'
      });
    }
    
    const { 
      provider, name, description, icon, 
      environment, config, feeSettings, 
      limits, reconciliationSettings, 
      notifyUrl, allowedIps
    } = req.body;
    
    // 验证必填字段
    if (!provider || !name || !config) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的配置信息'
      });
    }
    
    // 检查同名配置是否已存在
    const existingConfig = await PaymentConfig.findOne({ provider, name });
    if (existingConfig) {
      return res.status(400).json({
        success: false,
        message: `同名的${provider}支付配置已存在`
      });
    }
    
    // 加密敏感信息
    const secureConfig = { ...config };
    
    if (provider === 'weixin') {
      if (secureConfig.mchKey) {
        secureConfig.mchKey = encryption.encrypt(secureConfig.mchKey);
      }
      if (secureConfig.pfxPassword) {
        secureConfig.pfxPassword = encryption.encrypt(secureConfig.pfxPassword);
      }
    } else if (provider === 'zhifubao') {
      if (secureConfig.privateKey) {
        secureConfig.privateKey = encryption.encrypt(secureConfig.privateKey);
      }
    }
    
    // 创建新配置
    const newConfig = new PaymentConfig({
      provider,
      name,
      description,
      icon,
      environment: environment || 'sandbox',
      config: secureConfig,
      feeSettings,
      limits,
      reconciliationSettings,
      notifyUrl,
      allowedIps,
      createdBy: req.user._id
    });
    
    // 保存到数据库
    await newConfig.save();
    
    // 验证配置是否有效
    try {
      const testConfig = { ...config }; // 使用未加密的配置进行测试
      const testResult = await PaymentFactory.validateConfig(provider, testConfig);
      
      if (!testResult.isValid) {
        logger.warn('支付配置验证失败', {
          provider,
          message: testResult.message
        });
      }
      
      // 更新验证结果
      await PaymentConfig.findByIdAndUpdate(newConfig._id, {
        $set: {
          isActive: testResult.isValid
        }
      });
      
      // 返回创建成功的配置（不含敏感信息）
      const createdConfig = await PaymentConfig.findById(newConfig._id)
        .select('-config.privateKey -config.mchKey -config.pfx -config.pfxPassword');
      
      return res.status(201).json({
        success: true,
        data: createdConfig,
        message: testResult.isValid 
          ? '支付配置创建成功并已激活' 
          : `支付配置创建成功但验证失败: ${testResult.message}`
      });
    } catch (validationError) {
      logger.error('支付配置验证出错', {
        provider,
        error: validationError.message,
        stack: validationError.stack
      });
      
      // 返回创建成功的配置
      const createdConfig = await PaymentConfig.findById(newConfig._id)
        .select('-config.privateKey -config.mchKey -config.pfx -config.pfxPassword');
      
      return res.status(201).json({
        success: true,
        data: createdConfig,
        message: '支付配置创建成功，但配置验证过程中发生错误'
      });
    }
  } catch (error) {
    logger.error('创建支付配置失败', {
      provider: req.body.provider,
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: `创建支付配置失败: ${error.message}`
    });
  }
};

/**
 * 更新支付配置
 */
exports.updateConfig = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 权限检查
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '没有权限更新支付配置'
      });
    }
    
    // 验证ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: '无效的配置ID'
      });
    }
    
    // 查找现有配置
    const existingConfig = await PaymentConfig.findById(id);
    if (!existingConfig) {
      return res.status(404).json({
        success: false,
        message: '未找到支付配置'
      });
    }
    
    const { 
      name, description, icon, 
      environment, config, feeSettings, 
      limits, reconciliationSettings, 
      notifyUrl, allowedIps, isActive
    } = req.body;
    
    // 准备更新数据
    const updateData = {};
    
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (icon) updateData.icon = icon;
    if (environment) updateData.environment = environment;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (feeSettings) updateData.feeSettings = feeSettings;
    if (limits) updateData.limits = limits;
    if (reconciliationSettings) updateData.reconciliationSettings = reconciliationSettings;
    if (notifyUrl) updateData.notifyUrl = notifyUrl;
    if (allowedIps) updateData.allowedIps = allowedIps;
    
    // 处理配置对象更新
    if (config) {
      // 获取现有的加密配置
      const currentConfig = existingConfig.config || {};
      const secureConfig = { ...currentConfig };
      
      // 更新配置对象中的非敏感字段
      Object.keys(config).forEach(key => {
        if (key !== 'mchKey' && key !== 'privateKey' && key !== 'pfxPassword') {
          secureConfig[key] = config[key];
        }
      });
      
      // 更新敏感字段（如果提供了）
      if (existingConfig.provider === 'weixin') {
        if (config.mchKey) {
          secureConfig.mchKey = encryption.encrypt(config.mchKey);
        }
        if (config.pfxPassword) {
          secureConfig.pfxPassword = encryption.encrypt(config.pfxPassword);
        }
      } else if (existingConfig.provider === 'zhifubao') {
        if (config.privateKey) {
          secureConfig.privateKey = encryption.encrypt(config.privateKey);
        }
      }
      
      updateData.config = secureConfig;
    }
    
    // 更新配置
    await PaymentConfig.findByIdAndUpdate(id, { $set: updateData });
    
    // 如果配置内容有更新且标记为激活，则验证配置
    if (config && isActive) {
      try {
        // 构建未加密的测试配置
        const testConfig = { ...existingConfig.config };
        
        // 更新测试配置中的非敏感字段
        Object.keys(config).forEach(key => {
          if (key !== 'mchKey' && key !== 'privateKey' && key !== 'pfxPassword') {
            testConfig[key] = config[key];
          }
        });
        
        // 更新测试配置中的敏感字段（使用未加密的值）
        if (existingConfig.provider === 'weixin') {
          if (config.mchKey) {
            testConfig.mchKey = config.mchKey;
          } else if (testConfig.mchKey) {
            testConfig.mchKey = encryption.decrypt(testConfig.mchKey);
          }
          if (config.pfxPassword) {
            testConfig.pfxPassword = config.pfxPassword;
          } else if (testConfig.pfxPassword) {
            testConfig.pfxPassword = encryption.decrypt(testConfig.pfxPassword);
          }
        } else if (existingConfig.provider === 'zhifubao') {
          if (config.privateKey) {
            testConfig.privateKey = config.privateKey;
          } else if (testConfig.privateKey) {
            testConfig.privateKey = encryption.decrypt(testConfig.privateKey);
          }
        }
        
        // 验证配置
        const testResult = await PaymentFactory.validateConfig(existingConfig.provider, testConfig);
        
        if (!testResult.isValid) {
          // 更新配置状态为未激活
          await PaymentConfig.findByIdAndUpdate(id, { $set: { isActive: false } });
          
          return res.status(200).json({
            success: true,
            message: `支付配置已更新，但验证失败: ${testResult.message}`
          });
        }
      } catch (validationError) {
        logger.error('支付配置验证出错', {
          provider: existingConfig.provider,
          error: validationError.message,
          stack: validationError.stack
        });
      }
    }
    
    // 返回更新后的配置（不含敏感信息）
    const updatedConfig = await PaymentConfig.findById(id)
      .select('-config.privateKey -config.mchKey -config.pfx -config.pfxPassword');
    
    return res.status(200).json({
      success: true,
      data: updatedConfig,
      message: '支付配置更新成功'
    });
  } catch (error) {
    logger.error('更新支付配置失败', {
      id: req.params.id,
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: `更新支付配置失败: ${error.message}`
    });
  }
};

/**
 * 删除支付配置
 */
exports.deleteConfig = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 权限检查
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '没有权限删除支付配置'
      });
    }
    
    // 验证ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: '无效的配置ID'
      });
    }
    
    // 查找并删除配置
    const deletedConfig = await PaymentConfig.findByIdAndDelete(id);
    
    if (!deletedConfig) {
      return res.status(404).json({
        success: false,
        message: '未找到支付配置'
      });
    }
    
    return res.status(200).json({
      success: true,
      message: '支付配置已成功删除'
    });
  } catch (error) {
    logger.error('删除支付配置失败', {
      id: req.params.id,
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: `删除支付配置失败: ${error.message}`
    });
  }
};

/**
 * 获取可用的支付方式列表（前端使用）
 */
exports.getAvailablePaymentMethods = async (req, res) => {
  try {
    // 获取所有启用的支付配置
    const configs = await PaymentConfig.find({ 
      isActive: true 
    }).select('provider name description icon');
    
    // 格式化为前端需要的格式
    const paymentMethods = configs.map(config => ({
      id: config.provider,
      name: config.name,
      description: config.description,
      icon: config.icon
    }));
    
    return res.status(200).json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    logger.error('获取可用支付方式失败', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: '获取可用支付方式失败'
    });
  }
};

/**
 * 测试支付配置连接
 */
exports.testConfig = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 权限检查
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '没有权限测试支付配置'
      });
    }
    
    // 验证ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: '无效的配置ID'
      });
    }
    
    // 查找配置
    const config = await PaymentConfig.findById(id);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: '未找到支付配置'
      });
    }
    
    // 解密敏感信息
    const testConfig = { ...config.config };
    
    if (config.provider === 'weixin') {
      if (testConfig.mchKey) {
        testConfig.mchKey = encryption.decrypt(testConfig.mchKey);
      }
      if (testConfig.pfxPassword) {
        testConfig.pfxPassword = encryption.decrypt(testConfig.pfxPassword);
      }
    } else if (config.provider === 'zhifubao') {
      if (testConfig.privateKey) {
        testConfig.privateKey = encryption.decrypt(testConfig.privateKey);
      }
    }
    
    // 测试连接
    const testResult = await PaymentFactory.validateConfig(config.provider, testConfig);
    
    // 更新配置状态
    await PaymentConfig.findByIdAndUpdate(id, {
      $set: { isActive: testResult.isValid }
    });
    
    return res.status(200).json({
      success: true,
      isValid: testResult.isValid,
      message: testResult.message
    });
  } catch (error) {
    logger.error('测试支付配置连接失败', {
      id: req.params.id,
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: `测试支付配置连接失败: ${error.message}`
    });
  }
};

/**
 * 更新退款手续费设置
 */
exports.updateRefundFeeSettings = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 权限检查
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: '没有权限更新退款手续费设置'
      });
    }
    
    // 验证ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: '无效的配置ID'
      });
    }
    
    // 查找现有配置
    const existingConfig = await PaymentConfig.findById(id);
    if (!existingConfig) {
      return res.status(404).json({
        success: false,
        message: '未找到支付配置'
      });
    }
    
    const { refundFeeSettings } = req.body;
    
    // 验证手续费设置
    if (!refundFeeSettings || typeof refundFeeSettings !== 'object') {
      return res.status(400).json({
        success: false,
        message: '无效的退款手续费设置'
      });
    }
    
    // 验证必要字段
    const requiredFields = ['type', 'value'];
    const missingFields = requiredFields.filter(field => refundFeeSettings[field] === undefined);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `退款手续费设置缺少必要字段: ${missingFields.join(', ')}`
      });
    }
    
    // 验证类型
    if (!['fixed', 'percent'].includes(refundFeeSettings.type)) {
      return res.status(400).json({
        success: false,
        message: '手续费类型必须是fixed或percent'
      });
    }
    
    // 验证值范围
    if (typeof refundFeeSettings.value !== 'number' || refundFeeSettings.value < 0) {
      return res.status(400).json({
        success: false,
        message: '手续费值必须是非负数'
      });
    }
    
    // 更新配置
    const updateResult = await PaymentConfig.findByIdAndUpdate(id, {
      $set: { refundFeeSettings }
    }, { new: true }).select('-config.privateKey -config.mchKey -config.pfx -config.pfxPassword');
    
    return res.status(200).json({
      success: true,
      data: updateResult,
      message: '退款手续费设置更新成功'
    });
  } catch (error) {
    logger.error('更新退款手续费设置失败', {
      id: req.params.id,
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: `更新退款手续费设置失败: ${error.message}`
    });
  }
};

/**
 * 计算退款手续费预览
 */
exports.calculateRefundFee = async (req, res) => {
  try {
    const { configId, amount } = req.body;
    
    // 验证参数
    if (!configId || !amount) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    // 验证金额
    const refundAmount = parseFloat(amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: '无效的退款金额'
      });
    }
    
    // 查找配置
    const config = await PaymentConfig.findById(configId);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: '未找到支付配置'
      });
    }
    
    // 计算手续费
    const feeAmount = config.calculateRefundFee(refundAmount);
    const actualAmount = refundAmount - feeAmount;
    
    return res.status(200).json({
      success: true,
      data: {
        refundAmount,
        feeAmount,
        actualAmount,
        feeSettings: config.refundFeeSettings
      }
    });
  } catch (error) {
    logger.error('计算退款手续费失败', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: '计算退款手续费失败'
    });
  }
}; 