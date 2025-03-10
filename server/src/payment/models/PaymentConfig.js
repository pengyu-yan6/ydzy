/**
 * 支付配置数据模型
 * 存储各种支付渠道的配置信息
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// 通用配置属性验证器
const configValidator = {
  validator: function(config) {
    // 根据提供商验证必要的配置项
    switch (this.provider) {
      case 'weixin':
        return config && config.appId && config.mchId;
      case 'zhifubao':
        return config && config.appId && config.privateKey;
      default:
        return true;
    }
  },
  message: '缺少必要的配置项'
};

/**
 * 支付配置Schema
 */
const PaymentConfigSchema = new Schema({
  // 支付提供商（weixin, zhifubao等）
  provider: {
    type: String,
    required: [true, '支付提供商不能为空'],
    lowercase: true,
    trim: true,
    index: true
  },
  
  // 配置名称
  name: {
    type: String,
    required: [true, '配置名称不能为空'],
    trim: true
  },
  
  // 配置描述
  description: {
    type: String,
    trim: true
  },
  
  // 图标URL
  icon: {
    type: String,
    trim: true
  },
  
  // 是否启用
  isActive: {
    type: Boolean,
    default: false
  },
  
  // 环境（production, sandbox）
  environment: {
    type: String,
    enum: ['production', 'sandbox', 'development'],
    default: 'sandbox'
  },
  
  // 支付配置（各提供商不同）
  config: {
    type: Object,
    required: [true, '支付配置不能为空'],
    validate: configValidator
  },
  
  // 支付手续费设置
  feeSettings: {
    // 手续费类型（fixed固定金额，percent百分比）
    type: {
      type: String,
      enum: ['fixed', 'percent'],
      default: 'percent'
    },
    // 手续费值
    value: {
      type: Number,
      default: 0
    },
    // 最低手续费
    minFee: {
      type: Number,
      default: 0
    },
    // 最高手续费
    maxFee: {
      type: Number,
      default: 0
    }
  },
  
  // 退款手续费设置
  refundFeeSettings: {
    // 手续费类型（fixed固定金额，percent百分比）
    type: {
      type: String,
      enum: ['fixed', 'percent'],
      default: 'percent'
    },
    // 手续费值
    value: {
      type: Number,
      default: 0
    },
    // 最低手续费
    minFee: {
      type: Number,
      default: 0
    },
    // 最高手续费
    maxFee: {
      type: Number,
      default: 0
    },
    // 是否启用
    enabled: {
      type: Boolean,
      default: false
    }
  },
  
  // 交易限额
  limits: {
    // 单笔最小金额
    minAmount: {
      type: Number,
      default: 0.01
    },
    // 单笔最大金额
    maxAmount: {
      type: Number,
      default: 50000
    },
    // 日累计最大金额
    dailyLimit: {
      type: Number,
      default: 100000
    }
  },
  
  // 对账设置
  reconciliationSettings: {
    // 自动对账
    autoReconcile: {
      type: Boolean,
      default: false
    },
    // 对账时间（每天几点）
    reconcileHour: {
      type: Number,
      min: 0,
      max: 23,
      default: 1
    },
    // 对账文件存储路径
    filePath: {
      type: String,
      default: './reconciliation'
    }
  },
  
  // 回调通知URL
  notifyUrl: {
    type: String,
    trim: true
  },
  
  // 允许的IP列表（用于回调IP白名单）
  allowedIps: [{
    type: String,
    trim: true
  }],
  
  // 创建时间
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // 更新时间
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // 创建人ID
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// 索引
PaymentConfigSchema.index({ provider: 1, isActive: 1 });
PaymentConfigSchema.index({ createdAt: -1 });

/**
 * 计算手续费
 * @param {Number} amount - 交易金额
 * @returns {Number} 手续费金额
 */
PaymentConfigSchema.methods.calculateFee = function(amount) {
  const { type, value, minFee, maxFee } = this.feeSettings;
  
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
};

/**
 * 计算退款手续费
 * @param {Number} amount - 退款金额
 * @returns {Number} 退款手续费金额
 */
PaymentConfigSchema.methods.calculateRefundFee = function(amount) {
  // 如果未启用退款手续费，返回0
  if (!this.refundFeeSettings || !this.refundFeeSettings.enabled) {
    return 0;
  }
  
  const { type, value, minFee, maxFee } = this.refundFeeSettings;
  
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
};

/**
 * 验证交易金额是否在限额范围内
 * @param {Number} amount - 交易金额
 * @returns {Object} 验证结果
 */
PaymentConfigSchema.methods.validateAmount = function(amount) {
  const { minAmount, maxAmount } = this.limits;
  
  if (amount < minAmount) {
    return {
      valid: false,
      message: `支付金额不能小于${minAmount}`
    };
  }
  
  if (amount > maxAmount) {
    return {
      valid: false,
      message: `支付金额不能大于${maxAmount}`
    };
  }
  
  return {
    valid: true
  };
};

const PaymentConfig = mongoose.model('PaymentConfig', PaymentConfigSchema);

module.exports = PaymentConfig; 