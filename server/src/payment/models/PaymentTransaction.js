/**
 * 支付交易记录模型
 * 存储所有支付交易的记录和状态
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const encryption = require('../../utils/encryption');

/**
 * 支付交易记录Schema
 */
const PaymentTransactionSchema = new Schema({
  // 订单ID（内部使用）
  orderId: {
    type: String,
    required: [true, '订单ID不能为空'],
    trim: true,
    unique: true,
    index: true
  },
  
  // 商户订单号（外部系统使用）
  outTradeNo: {
    type: String,
    trim: true,
    index: true
  },
  
  // 交易流水号（支付渠道返回）
  transactionId: {
    type: String,
    trim: true,
    sparse: true,
    index: true
  },
  
  // 支付提供商
  provider: {
    type: String,
    required: [true, '支付提供商不能为空'],
    trim: true,
    index: true
  },
  
  // 支付配置ID
  configId: {
    type: Schema.Types.ObjectId,
    ref: 'PaymentConfig',
    required: [true, '支付配置ID不能为空']
  },
  
  // 用户ID
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, '用户ID不能为空'],
    index: true
  },
  
  // 商品ID
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, '商品ID不能为空']
  },
  
  // 订单金额
  amount: {
    type: Number,
    required: [true, '订单金额不能为空'],
    min: [0.01, '订单金额必须大于0']
  },
  
  // 手续费金额
  feeAmount: {
    type: Number,
    default: 0
  },
  
  // 货币类型
  currency: {
    type: String,
    default: 'CNY',
    uppercase: true,
    trim: true
  },
  
  // 支付方式
  paymentMethod: {
    type: String,
    trim: true
  },
  
  // 交易状态
  status: {
    type: String,
    enum: [
      'pending',    // 待支付
      'processing', // 处理中
      'success',    // 支付成功
      'failed',     // 支付失败
      'refunding',  // 退款中
      'refunded',   // 已退款
      'cancelled',  // 已取消
      'expired'     // 已过期
    ],
    default: 'pending',
    index: true
  },
  
  // 状态详情
  statusMessage: {
    type: String,
    trim: true
  },
  
  // 商品描述
  body: {
    type: String,
    trim: true
  },
  
  // 支付完成时间
  payTime: {
    type: Date
  },
  
  // 订单过期时间
  expireTime: {
    type: Date
  },
  
  // 回调通知次数
  notifyCount: {
    type: Number,
    default: 0
  },
  
  // 最后通知时间
  lastNotifyTime: {
    type: Date
  },
  
  // 商品详情（快照）
  productDetail: {
    name: String,
    description: String,
    price: Number,
    quantity: {
      type: Number,
      default: 1
    }
  },
  
  // 支付渠道返回的原始数据
  rawData: {
    type: Object
  },
  
  // 客户端IP
  clientIp: {
    type: String,
    trim: true
  },
  
  // 用户设备信息
  userAgent: {
    type: String,
    trim: true
  },
  
  // 回调通知URL
  notifyUrl: {
    type: String,
    trim: true
  },
  
  // 支付页面返回URL
  returnUrl: {
    type: String,
    trim: true
  },
  
  // 支付链接URL（微信支付二维码、支付宝支付链接等）
  paymentUrl: {
    type: String,
    trim: true
  },
  
  // 额外参数（存储自定义数据）
  extraData: {
    type: Object
  },
  
  // 是否为测试交易
  isTest: {
    type: Boolean,
    default: false
  },
  
  // 创建时间
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // 更新时间
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// 索引
PaymentTransactionSchema.index({ userId: 1, createdAt: -1 });
PaymentTransactionSchema.index({ status: 1, createdAt: -1 });
PaymentTransactionSchema.index({ provider: 1, status: 1 });
PaymentTransactionSchema.index({ expireTime: 1 }, { expireAfterSeconds: 0 });

/**
 * 生成待加密字段的列表
 */
const ENCRYPTED_FIELDS = ['paymentUrl'];

/**
 * 保存前加密敏感字段
 */
PaymentTransactionSchema.pre('save', async function(next) {
  try {
    // 如果是新记录，生成过期时间（默认2小时）
    if (this.isNew && !this.expireTime) {
      this.expireTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
    }
    
    // 加密敏感字段
    for (const field of ENCRYPTED_FIELDS) {
      if (this[field] && this.isModified(field)) {
        this[field] = encryption.encrypt(this[field]);
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * 查询后解密敏感字段
 */
PaymentTransactionSchema.post('find', function(docs) {
  if (!docs) return;
  
  docs.forEach(doc => {
    ENCRYPTED_FIELDS.forEach(field => {
      if (doc[field]) {
        try {
          doc[field] = encryption.decrypt(doc[field]);
        } catch (error) {
          // 解密失败，保持原样
        }
      }
    });
  });
});

PaymentTransactionSchema.post('findOne', function(doc) {
  if (!doc) return;
  
  ENCRYPTED_FIELDS.forEach(field => {
    if (doc[field]) {
      try {
        doc[field] = encryption.decrypt(doc[field]);
      } catch (error) {
        // 解密失败，保持原样
      }
    }
  });
});

/**
 * 生成订单ID
 * @returns {String} 订单ID
 */
PaymentTransactionSchema.statics.generateOrderId = function() {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `PAY${timestamp}${random}`;
};

/**
 * 获取可退款金额
 * @returns {Number} 可退款金额
 */
PaymentTransactionSchema.methods.getRefundableAmount = function() {
  // 只有成功支付的订单才可退款
  if (this.status !== 'success') {
    return 0;
  }
  
  // 如果已全额退款，返回0
  if (this.status === 'refunded') {
    return 0;
  }
  
  // TODO: 计算已退款金额，返回剩余可退款金额
  return this.amount;
};

/**
 * 是否可以退款
 * @returns {Boolean} 是否可退款
 */
PaymentTransactionSchema.methods.isRefundable = function() {
  return this.status === 'success' && this.getRefundableAmount() > 0;
};

const PaymentTransaction = mongoose.model('PaymentTransaction', PaymentTransactionSchema);

module.exports = PaymentTransaction; 