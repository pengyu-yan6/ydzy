/**
 * CDK模型
 * 用于管理游戏内的激活码和礼品码
 */

const mongoose = require('mongoose');
const config = require('../config');

// CDK模式定义
const cdkSchema = new mongoose.Schema({
  // CDK码（唯一）
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  
  // CDK类型
  type: {
    type: String,
    required: true,
    enum: Object.values(config.cdk.types)
  },
  
  // CDK描述
  description: {
    type: String,
    required: true
  },
  
  // CDK奖励内容
  rewards: {
    gold: {
      type: Number,
      default: 0
    },
    diamond: {
      type: Number,
      default: 0
    },
    items: [{
      itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item'
      },
      quantity: {
        type: Number,
        default: 1,
        min: 1
      }
    }],
    heroes: [{
      heroId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hero'
      }
    }],
    vip: {
      level: {
        type: Number,
        min: 0
      },
      days: {
        type: Number,
        min: 0
      }
    }
  },
  
  // 使用限制
  usageLimit: {
    type: Number,
    default: 1, // 默认只能使用一次
    min: 1
  },
  
  // 已使用次数
  usedCount: {
    type: Number,
    default: 0
  },
  
  // 可用性标志
  isActive: {
    type: Boolean,
    default: true
  },
  
  // 创建者（管理员ID）
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // 使用记录
  usageHistory: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    ip: String
  }],
  
  // 有效期
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date
  }
}, {
  timestamps: true
});

// 检查CDK是否仍然有效
cdkSchema.methods.isValid = function() {
  // 检查是否激活
  if (!this.isActive) {
    return false;
  }
  
  // 检查使用次数
  if (this.usedCount >= this.usageLimit) {
    return false;
  }
  
  // 检查有效期
  const now = new Date();
  if (this.validUntil && now > this.validUntil) {
    return false;
  }
  
  return true;
};

// 检查用户是否已使用过此CDK
cdkSchema.methods.isUsedByUser = function(userId) {
  return this.usageHistory.some(record => record.userId.toString() === userId.toString());
};

// 记录用户使用CDK
cdkSchema.methods.useByUser = function(userId, ip) {
  // 添加使用记录
  this.usageHistory.push({
    userId,
    usedAt: new Date(),
    ip
  });
  
  // 增加使用计数
  this.usedCount += 1;
  
  // 如果达到使用上限，自动标记为不可用
  if (this.usedCount >= this.usageLimit) {
    this.isActive = false;
  }
  
  return this.save();
};

// 生成随机CDK码
cdkSchema.statics.generateCode = function(length = config.cdk.length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  // 生成指定长度的随机字符串
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  
  // 每4个字符插入一个连字符以提高可读性
  return code.replace(/(.{4})(?=.)/g, '$1-');
};

// 创建并导出模型
const CDK = mongoose.model('CDK', cdkSchema);
module.exports = CDK; 