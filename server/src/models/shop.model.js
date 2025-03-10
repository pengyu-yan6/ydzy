/**
 * 商城模型
 * 用于管理游戏内的商品信息
 */

const mongoose = require('mongoose');

// 商品模式定义
const shopSchema = new mongoose.Schema({
  // 商品名称
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // 商品描述
  description: {
    type: String,
    required: true
  },
  
  // 商品分类
  category: {
    type: String,
    required: true,
    enum: ['diamond', 'gold', 'vip', 'combo', 'hero', 'item', 'skin']
  },
  
  // 商品价格（人民币）
  price: {
    type: Number,
    required: true,
    min: 0
  },
  
  // 商品原价（用于显示折扣）
  originalPrice: {
    type: Number,
    min: 0
  },
  
  // 商品图片
  image: {
    type: String
  },
  
  // 商品图标
  icon: {
    type: String
  },
  
  // 商品奖励内容
  rewards: {
    gold: {
      type: Number,
      default: 0
    },
    diamond: {
      type: Number,
      default: 0
    },
    heroes: [{
      heroId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hero'
      }
    }],
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
    skins: [{
      skinId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skin'
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
  
  // 商品排序
  sortOrder: {
    type: Number,
    default: 0
  },
  
  // 是否热销
  isHot: {
    type: Boolean,
    default: false
  },
  
  // 是否推荐
  isRecommended: {
    type: Boolean,
    default: false
  },
  
  // 是否为限时商品
  isLimited: {
    type: Boolean,
    default: false
  },
  
  // 限时商品有效期
  limitedTimeStart: {
    type: Date
  },
  limitedTimeEnd: {
    type: Date
  },
  
  // 是否可用
  isAvailable: {
    type: Boolean,
    default: true
  },
  
  // 购买限制
  purchaseLimit: {
    // 每个用户最多购买次数（0表示不限制）
    perUser: {
      type: Number,
      default: 0,
      min: 0
    },
    // 总销售量限制（0表示不限制）
    total: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // 已售数量
  soldCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // VIP等级要求（0表示无要求）
  vipLevelRequired: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // 标签
  tags: [String],
  
  // 创建者（管理员ID）
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// 检查商品是否可购买
shopSchema.methods.canPurchase = function(user) {
  // 检查商品是否可用
  if (!this.isAvailable) {
    return { canPurchase: false, reason: '商品当前不可用' };
  }
  
  // 检查VIP等级
  if (this.vipLevelRequired > 0) {
    const userVipLevel = user.paymentInfo?.vipLevel || 0;
    if (userVipLevel < this.vipLevelRequired) {
      return { canPurchase: false, reason: `需要VIP${this.vipLevelRequired}及以上等级` };
    }
  }
  
  // 检查是否限时商品
  if (this.isLimited) {
    const now = new Date();
    if (this.limitedTimeStart && now < this.limitedTimeStart) {
      return { canPurchase: false, reason: '商品尚未开售' };
    }
    if (this.limitedTimeEnd && now > this.limitedTimeEnd) {
      return { canPurchase: false, reason: '商品已结束销售' };
    }
  }
  
  // 检查总销售量限制
  if (this.purchaseLimit.total > 0 && this.soldCount >= this.purchaseLimit.total) {
    return { canPurchase: false, reason: '商品已售罄' };
  }
  
  // 检查用户购买次数限制
  if (this.purchaseLimit.perUser > 0) {
    // 需要另外查询用户购买记录来实现这个限制
    // 为简化示例，这里省略具体实现
  }
  
  return { canPurchase: true };
};

// 创建并导出模型
const Shop = mongoose.model('Shop', shopSchema);
module.exports = Shop; 