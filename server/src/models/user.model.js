/**
 * 用户模型
 * 用于存储用户账号信息和游戏数据
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt'); // 使用bcrypt而非bcryptjs，性能更好
const config = require('../config');
const crypto = require('crypto');

// 用户模式定义
const userSchema = new mongoose.Schema({
  // 账号信息
  username: {
    type: String,
    required: [true, '用户名不能为空'],
    unique: true,
    trim: true,
    minlength: [3, '用户名长度不能少于3个字符'],
    maxlength: [20, '用户名长度不能超过20个字符'],
    validate: {
      validator: function(v) {
        // 用户名只允许字母、数字、下划线和中文
        return /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(v);
      },
      message: '用户名只能包含字母、数字、下划线和中文字符'
    }
  },
  email: {
    type: String,
    required: [true, '邮箱不能为空'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, '请提供有效的邮箱地址']
  },
  password: {
    type: String,
    required: [true, '密码不能为空'],
    minlength: [config.security.minPasswordLength, `密码长度不能少于${config.security.minPasswordLength}个字符`],
    select: false, // 默认查询不返回密码
    validate: {
      validator: function(v) {
        // 密码必须包含数字、小写字母、大写字母和特殊字符
        return /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/.test(v);
      },
      message: '密码必须包含至少一个数字、一个小写字母、一个大写字母和一个特殊字符'
    }
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'superadmin'],
    default: 'user'
  },
  
  // 个人资料
  nickname: {
    type: String,
    trim: true,
    maxlength: [20, '昵称长度不能超过20个字符']
  },
  avatar: {
    type: String,
    default: '/images/default-avatar.png'
  },
  bio: {
    type: String,
    maxlength: [200, '个人简介不能超过200个字符']
  },
  
  // 游戏数据
  gameProfile: {
    level: {
      type: Number,
      default: config.game.initialLevel
    },
    exp: {
      type: Number,
      default: config.game.initialExp
    },
    gold: {
      type: Number,
      default: config.game.initialGold
    },
    diamond: {
      type: Number,
      default: 0
    },
    heroes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hero'
    }],
    items: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item'
    }],
  },
  
  // 游戏统计
  stats: {
    totalGames: {
      type: Number,
      default: 0
    },
    wins: {
      type: Number,
      default: 0
    },
    top4: {
      type: Number,
      default: 0
    },
    rank: {
      type: Number,
      default: 0
    },
    rankPoints: {
      type: Number,
      default: 0
    },
    rankTier: {
      type: String,
      enum: ['铁', '铜', '银', '金', '铂金', '钻石', '大师', '宗师', '王者'],
      default: '铁'
    }
  },
  
  // 账号状态
  status: {
    type: String,
    enum: ['active', 'inactive', 'banned'],
    default: 'active'
  },
  banReason: {
    type: String
  },
  
  // 登录和安全信息
  lastLoginAt: {
    type: Date
  },
  lastLogoutAt: {
    type: Date
  },
  loginIp: {
    type: String
  },
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lastFailedLoginAt: {
    type: Date
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  passwordChangedAt: {
    type: Date
  },
  
  // 密码重置相关字段
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  
  // 支付信息
  paymentInfo: {
    totalSpent: {
      type: Number,
      default: 0
    },
    vipLevel: {
      type: Number,
      default: 0
    },
    vipExpiry: {
      type: Date
    },
    // 敏感信息 - 在存储时加密
    cardInfo: {
      type: Object,
      select: false
    },
    billingInfo: {
      type: Object,
      select: false
    },
    // 存储加密方法信息
    encryptionMethod: {
      type: String,
      select: false
    }
  },
  
  // 账户验证
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  
  // 双因素认证
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    select: false
  },
  
  // 登录会话
  activeSessions: [{
    token: String,
    device: String,
    ip: String,
    lastActive: Date,
    expiresAt: Date
  }],
  
  // 时间戳（使用mongoose的timestamps自动添加）
}, {
  timestamps: true, // 自动添加createdAt和updatedAt字段
  toJSON: { virtuals: true }, // 在转换为JSON时包含虚拟字段
  toObject: { virtuals: true } // 在转换为对象时包含虚拟字段
});

// 索引优化
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'paymentInfo.vipLevel': -1 });
userSchema.index({ 'gameProfile.level': -1 });
userSchema.index({ 'stats.rankPoints': -1 });

// 保存前加密密码
userSchema.pre('save', async function(next) {
  // 只有密码被修改时才重新加密
  if (!this.isModified('password')) return next();
  
  try {
    // 验证密码复杂度
    if (this.password.length < config.security.minPasswordLength) {
      throw new Error(`密码长度不能少于${config.security.minPasswordLength}个字符`);
    }
    
    // 生成盐并加密密码
    const salt = await bcrypt.genSalt(config.bcrypt.saltRounds);
    this.password = await bcrypt.hash(this.password, salt);
    
    // 如果更改了密码，更新密码更改时间
    if (!this.isNew) {
      this.passwordChangedAt = new Date();
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// 更新时更新updatedAt字段
userSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// 验证密码方法
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('密码验证失败');
  }
};

// 加密敏感字段
userSchema.methods.encryptSensitiveData = function(data, fieldPath) {
  if (!data) return null;
  
  try {
    // 使用加密密钥进行加密
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm', 
      Buffer.from(config.security.encryptionKey, 'hex'), 
      iv
    );
    
    // 对数据进行加密
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // 获取认证标签
    const authTag = cipher.getAuthTag().toString('hex');
    
    // 储存加密方法信息
    this.set(`${fieldPath}.encryptionMethod`, 'aes-256-gcm');
    
    // 返回加密结果（包含IV和认证标签）
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag
    };
  } catch (error) {
    console.error(`加密失败: ${fieldPath}`);
    throw new Error('数据加密失败');
  }
};

// 解密敏感字段
userSchema.methods.decryptSensitiveData = function(encryptedData) {
  if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv || !encryptedData.authTag) {
    return null;
  }
  
  try {
    // 使用加密密钥进行解密
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(config.security.encryptionKey, 'hex'),
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    // 设置认证标签
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    // 解密数据
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // 解析JSON字符串
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('解密失败');
    return null;
  }
};

// 获取游戏数据方法
userSchema.methods.getGameData = function() {
  return {
    id: this._id,
    username: this.username,
    nickname: this.nickname || this.username,
    avatar: this.avatar,
    level: this.gameProfile.level,
    exp: this.gameProfile.exp,
    gold: this.gameProfile.gold,
    diamond: this.gameProfile.diamond,
    heroes: this.gameProfile.heroes,
    items: this.gameProfile.items,
    stats: this.stats,
    vipLevel: this.paymentInfo.vipLevel
  };
};

// 安全的获取用户资料方法
userSchema.methods.getProfile = function() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    nickname: this.nickname || this.username,
    avatar: this.avatar,
    role: this.role,
    bio: this.bio,
    status: this.status,
    gameProfile: {
      level: this.gameProfile.level,
      exp: this.gameProfile.exp
    },
    stats: this.stats,
    vipInfo: {
      level: this.paymentInfo.vipLevel,
      expiry: this.paymentInfo.vipExpiry
    },
    createdAt: this.createdAt
  };
};

// 检查账户是否被锁定（登录失败次数过多）
userSchema.methods.isAccountLocked = function() {
  if (!this.lastFailedLoginAt || this.failedLoginAttempts < config.security.maxFailedAttempts) {
    return false;
  }
  
  // 检查锁定是否已过期
  const lockExpiration = new Date(this.lastFailedLoginAt);
  lockExpiration.setMinutes(lockExpiration.getMinutes() + config.security.ipLockTime);
  
  return lockExpiration > new Date();
};

// 生成用于电子邮件验证的令牌
userSchema.methods.generateVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = token;
  this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时有效
  return token;
};

// 添加钻石虚拟字段（游戏货币）
userSchema.virtual('diamonds').get(function() {
  return this.gameProfile.diamond;
});

// 添加金币虚拟字段（游戏货币）
userSchema.virtual('gold').get(function() {
  return this.gameProfile.gold;
});

// 计算胜率的虚拟字段
userSchema.virtual('winRate').get(function() {
  if (!this.stats.totalGames) return 0;
  return (this.stats.wins / this.stats.totalGames * 100).toFixed(2);
});

// 创建并导出模型
const User = mongoose.model('User', userSchema);
module.exports = User; 