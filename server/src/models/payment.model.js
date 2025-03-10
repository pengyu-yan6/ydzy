/**
 * 支付订单模型
 * 用于记录用户的支付订单信息
 */

const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

// 支付订单模式定义
const paymentSchema = new mongoose.Schema({
  // 订单ID（唯一）
  orderId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  // 用户ID
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // 商品ID
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true
  },
  
  // 支付金额 - 加密存储
  amount: {
    type: String, // 改为字符串以存储加密数据
    required: true,
    set: function(amount) {
      // 存储时加密
      if (amount) {
        const amountStr = String(amount);
        return encrypt(amountStr);
      }
      return amount;
    },
    get: function(encryptedAmount) {
      // 读取时解密
      if (encryptedAmount) {
        try {
          const decrypted = decrypt(encryptedAmount);
          return isNaN(decrypted) ? 0 : parseFloat(decrypted);
        } catch (e) {
          console.error('金额解密失败:', e);
          return 0;
        }
      }
      return 0;
    }
  },
  
  // 原始金额 - 仅用于内部校验，不加密
  _rawAmount: {
    type: Number,
    min: 0,
    select: false
  },
  
  // 货币类型
  currency: {
    type: String,
    default: 'CNY'
  },
  
  // 支付方式
  paymentMethod: {
    type: String,
    required: true,
    enum: ['alipay', 'wechat', 'credit_card']
  },
  
  // 订单状态
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending'
  },
  
  // 状态描述
  statusMessage: {
    type: String
  },
  
  // 订单描述
  description: {
    type: String
  },
  
  // 商品详情（冗余存储，防止商品变更）
  productDetails: {
    name: String,
    description: String,
    category: String
  },
  
  // 支付完成时间
  completedAt: {
    type: Date
  },
  
  // 支付网关返回数据
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // 客户端IP
  clientIp: {
    type: String
  },
  
  // 信用卡信息 - 加密存储
  cardInfo: {
    type: String,
    set: function(cardInfo) {
      if (cardInfo) {
        return encrypt(JSON.stringify(cardInfo));
      }
      return null;
    },
    get: function(encryptedCardInfo) {
      if (encryptedCardInfo) {
        try {
          return JSON.parse(decrypt(encryptedCardInfo));
        } catch (e) {
          console.error('卡信息解密失败:', e);
          return null;
        }
      }
      return null;
    },
    select: false // 默认不返回此字段
  },
  
  // 退款信息
  refund: {
    amount: Number,
    reason: String,
    requestedAt: Date,
    processedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed']
    }
  },
  
  // 风控信息
  riskInfo: {
    level: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low'
    },
    score: {
      type: Number,
      default: 0
    },
    flags: [String],
    notes: String
  },
  
  // 交易ID（外部支付系统的ID）
  transactionId: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// 保存前的钩子
paymentSchema.pre('save', function(next) {
  // 保存原始金额以便内部验证
  if (this.isModified('amount')) {
    const decryptedAmount = this.amount;
    this._rawAmount = decryptedAmount;
  }
  next();
});

// 模型方法 - 安全比较金额
paymentSchema.methods.compareAmount = function(amount) {
  const decryptedAmount = this.amount;
  // 使用固定小数位比较，避免浮点数精度问题
  return parseFloat(decryptedAmount).toFixed(2) === parseFloat(amount).toFixed(2);
};

// 模型方法 - 获取脱敏信息（用于日志）
paymentSchema.methods.getSafeLogInfo = function() {
  return {
    orderId: this.orderId,
    userId: this.userId,
    status: this.status,
    paymentMethod: this.paymentMethod,
    createdAt: this.createdAt,
    amount: '******' // 完全遮蔽金额
  };
};

// 创建并导出模型
const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment; 