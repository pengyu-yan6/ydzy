const mongoose = require('mongoose');
const crypto = require('crypto');
const config = require('../../config');
const encryptionUtils = require('../../utils/encryption');

// CDK类型枚举
const CDK_TYPES = {
  DIAMOND: 'diamond', // 钻石
  VIP: 'vip', // VIP会员
  ITEM: 'item', // 游戏道具
  HERO: 'hero', // 英雄
  SKIN: 'skin', // 皮肤
  CURRENCY: 'currency', // 游戏币
  SPECIAL: 'special', // 特殊礼包
  EVENT: 'event' // 活动礼包
};

// CDK状态枚举
const CDK_STATUS = {
  GENERATED: 'generated', // 已生成
  ACTIVATED: 'activated', // 已激活(准备使用)
  USED: 'used', // 已使用
  EXPIRED: 'expired', // 已过期
  REVOKED: 'revoked' // 已作废
};

// CDK模式枚举
const CDK_MODES = {
  SINGLE_USE: 'single_use', // 一次性使用
  MULTI_USE: 'multi_use', // 多次使用(有使用次数限制)
  UNLIMITED: 'unlimited' // 无限制使用(通常用于活动码)
};

// CDK Schema定义
const CDKSchema = new mongoose.Schema({
  // CDK基本信息
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  // 哈希值，用于验证，避免明文匹配
  codeHash: {
    type: String,
    required: true,
    index: true
  },
  // CDK类型
  type: {
    type: String,
    enum: Object.values(CDK_TYPES),
    required: true
  },
  // CDK使用模式
  mode: {
    type: String,
    enum: Object.values(CDK_MODES),
    default: CDK_MODES.SINGLE_USE
  },
  // CDK状态
  status: {
    type: String,
    enum: Object.values(CDK_STATUS),
    default: CDK_STATUS.GENERATED
  },
  // 当前状态变更时间
  statusChangedAt: {
    type: Date,
    default: Date.now
  },
  // CDK面值或包含物品
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // 面值加密存储（敏感数据）
  valueEncrypted: {
    type: String
  },
  // 数据加密密钥ID
  dataKeyId: {
    type: String
  },
  // 批次ID
  batchId: {
    type: String,
    required: true,
    index: true
  },
  // 创建者
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 过期时间
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  // 激活时间
  activatedAt: {
    type: Date
  },
  // 使用时间
  usedAt: {
    type: Date
  },
  // 使用者ID
  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // 作废时间
  revokedAt: {
    type: Date
  },
  // 作废原因
  revokeReason: {
    type: String
  },
  // 作废操作者
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // 最大使用次数（适用于多次使用模式）
  maxUsageCount: {
    type: Number,
    default: 1
  },
  // 已使用次数
  usageCount: {
    type: Number,
    default: 0
  },
  // 备注
  notes: {
    type: String
  },
  // 渠道标识
  channel: {
    type: String,
    index: true
  },
  // 生成时使用的算法
  algorithm: {
    type: String,
    default: 'sha256'
  },
  // 版本号，用于处理CDK格式变更
  version: {
    type: Number,
    default: 1
  },
  // 安全标记，标识是否为敏感CDK
  securityLevel: {
    type: Number, // 1-低 2-中 3-高
    default: 1
  },
  // 需要2FA验证才能使用
  requires2FA: {
    type: Boolean,
    default: false
  },
  // 数据完整性签名
  integritySignature: {
    type: String
  },
  // 锁定状态（防止并发操作）
  locked: {
    type: Boolean,
    default: false
  },
  // 锁定时间
  lockedAt: {
    type: Date
  },
  // 锁定过期时间（防止死锁）
  lockExpiresAt: {
    type: Date
  },
  // 使用时IP限制
  ipRestrictions: [{
    type: String
  }],
  // 使用时设备限制
  deviceRestrictions: [{
    type: String
  }],
  // 使用记录
  usageHistory: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    ip: String,
    deviceInfo: String,
    action: String, // 'activate', 'use', 'revoke'
    actionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    success: {
      type: Boolean,
      default: true
    },
    reason: String // 失败原因
  }],
  // 审计跟踪
  auditTrail: [{
    action: {
      type: String,
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    details: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// 索引用于提高查询性能
CDKSchema.index({ code: 1, status: 1 });
CDKSchema.index({ batchId: 1, status: 1 });
CDKSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL索引，自动过期处理
CDKSchema.index({ type: 1, status: 1 });
CDKSchema.index({ locked: 1, lockExpiresAt: 1 }); // 锁定状态索引

// 中间件：保存前处理
CDKSchema.pre('save', async function(next) {
  // 如果是新文档或code字段被修改，重新计算哈希
  if (this.isNew || this.isModified('code')) {
    // 使用强化的哈希算法
    this.codeHash = encryptionUtils.generateHash(
      this.code, 
      config.security.cdkSalt
    );
  }
  
  // 如果是高安全级别CDK，加密value字段
  if (this.securityLevel >= 2 && this.isModified('value')) {
    try {
      const valueString = typeof this.value === 'object' 
        ? JSON.stringify(this.value) 
        : String(this.value);
      
      // 创建加密上下文，将加密数据绑定到此CDK
      const encryptionContext = encryptionUtils.createEncryptionContext(
        'CDK', 
        this._id.toString()
      );
      
      // 使用增强的加密方法
      this.valueEncrypted = encryptionUtils.encrypt(
        valueString, 
        { context: encryptionContext }
      );
    } catch (error) {
      return next(new Error('CDK值加密失败: ' + error.message));
    }
  }
  
  // 状态变更时更新状态变更时间
  if (this.isModified('status')) {
    this.statusChangedAt = new Date();
    
    // 根据状态更新对应的时间字段
    if (this.status === CDK_STATUS.ACTIVATED && !this.activatedAt) {
      this.activatedAt = new Date();
    } else if (this.status === CDK_STATUS.USED && !this.usedAt) {
      this.usedAt = new Date();
    } else if (this.status === CDK_STATUS.REVOKED && !this.revokedAt) {
      this.revokedAt = new Date();
    }
  }
  
  // 检查过期状态
  const now = new Date();
  if (this.expiresAt && this.expiresAt < now && this.status !== CDK_STATUS.EXPIRED) {
    this.status = CDK_STATUS.EXPIRED;
    this.statusChangedAt = now;
  }
  
  // 生成数据完整性签名
  if (this.isNew || this.isModified('code') || this.isModified('value') || 
      this.isModified('type') || this.isModified('batchId')) {
    // 对重要字段生成HMAC签名
    const dataToSign = {
      code: this.code,
      type: this.type,
      batchId: this.batchId,
      value: this.value
    };
    
    this.integritySignature = encryptionUtils.generateHMAC(
      dataToSign, 
      config.security.integrityKey || config.security.cdkSalt
    );
  }
  
  // 处理锁定状态自动过期
  if (this.locked && (!this.lockExpiresAt || this.lockExpiresAt < now)) {
    // 锁已过期，自动解锁
    this.locked = false;
    this.lockedAt = null;
    this.lockExpiresAt = null;
  }
  
  next();
});

// 中间件：移除敏感字段
CDKSchema.methods.toJSON = function() {
  const obj = this.toObject();
  
  // 移除哈希值和加密字段，防止泄露
  delete obj.codeHash;
  delete obj.valueEncrypted;
  delete obj.dataKeyId;
  delete obj.integritySignature;
  
  return obj;
};

// 静态方法：验证CDK码
CDKSchema.statics.validateCDK = async function(code) {
  // 首先尝试直接通过code查找
  const cdk = await this.findOne({ code });
  
  // 如果找不到，尝试通过哈希查找（支持多种哈希算法）
  if (!cdk) {
    // 先使用当前推荐算法生成哈希
    const codeHash = encryptionUtils.generateHash(code, config.security.cdkSalt);
    
    const cdkByHash = await this.findOne({ codeHash });
    
    if (cdkByHash) {
      return cdkByHash;
    }
    
    // 如果仍找不到，尝试使用备用算法（兼容旧CDK）
    const algorithms = ['sha256', 'sha1', 'md5']; // 按安全性顺序尝试
    
    for (const algorithm of algorithms) {
      const legacyHash = crypto
        .createHash(algorithm)
        .update(code + config.security.cdkSalt)
        .digest('hex');
      
      const cdkByLegacyHash = await this.findOne({ codeHash: legacyHash });
      
      if (cdkByLegacyHash) {
        return cdkByLegacyHash;
      }
    }
    
    return null;
  }
  
  return cdk;
};

// 锁定CDK（用于防止并发操作）
CDKSchema.methods.lock = async function(lockDuration = 30) {
  const now = new Date();
  const lockExpiry = new Date(now.getTime() + lockDuration * 1000);
  
  // 使用findOneAndUpdate原子操作，加乐观锁
  const updatedCdk = await this.constructor.findOneAndUpdate(
    { 
      _id: this._id, 
      locked: false // 只有当前未锁定才能锁定
    },
    {
      $set: {
        locked: true,
        lockedAt: now,
        lockExpiresAt: lockExpiry
      }
    },
    { new: true }
  );
  
  if (!updatedCdk) {
    throw new Error('CDK已被锁定，请稍后再试');
  }
  
  // 更新当前实例
  this.locked = true;
  this.lockedAt = now;
  this.lockExpiresAt = lockExpiry;
  
  return this;
};

// 解锁CDK
CDKSchema.methods.unlock = async function() {
  await this.constructor.updateOne(
    { _id: this._id },
    {
      $set: {
        locked: false,
        lockedAt: null,
        lockExpiresAt: null
      }
    }
  );
  
  // 更新当前实例
  this.locked = false;
  this.lockedAt = null;
  this.lockExpiresAt = null;
  
  return this;
};

// 验证数据完整性
CDKSchema.methods.verifyIntegrity = function() {
  if (!this.integritySignature) {
    return false;
  }
  
  const dataToSign = {
    code: this.code,
    type: this.type,
    batchId: this.batchId,
    value: this.value
  };
  
  const calculatedSignature = encryptionUtils.generateHMAC(
    dataToSign, 
    config.security.integrityKey || config.security.cdkSalt
  );
  
  return encryptionUtils.secureCompare(
    calculatedSignature, 
    this.integritySignature
  );
};

// 实例方法：使用CDK（已针对并发进行优化）
CDKSchema.methods.redeem = async function(userId, extraData = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 先锁定CDK，防止并发操作
    await this.lock();
    
    // 检查数据完整性
    if (!this.verifyIntegrity()) {
      await this.unlock();
      throw new Error('CDK数据完整性验证失败，可能被篡改');
    }
    
    // 检查CDK是否可以使用
    if (this.status === CDK_STATUS.USED && this.mode === CDK_MODES.SINGLE_USE) {
      // 记录失败使用记录
      this.usageHistory.push({
        timestamp: new Date(),
        userId,
        ip: extraData.ip,
        deviceInfo: extraData.deviceInfo,
        action: 'use',
        actionBy: userId,
        success: false,
        reason: '此CDK已被使用'
      });
      
      await this.save({ session });
      await this.unlock();
      await session.commitTransaction();
      session.endSession();
      
      throw new Error('此CDK已被使用');
    }
    
    if (this.status === CDK_STATUS.EXPIRED) {
      // 记录失败使用记录
      this.usageHistory.push({
        timestamp: new Date(),
        userId,
        ip: extraData.ip,
        deviceInfo: extraData.deviceInfo,
        action: 'use',
        actionBy: userId,
        success: false,
        reason: '此CDK已过期'
      });
      
      await this.save({ session });
      await this.unlock();
      await session.commitTransaction();
      session.endSession();
      
      throw new Error('此CDK已过期');
    }
    
    if (this.status === CDK_STATUS.REVOKED) {
      // 记录失败使用记录
      this.usageHistory.push({
        timestamp: new Date(),
        userId,
        ip: extraData.ip,
        deviceInfo: extraData.deviceInfo,
        action: 'use',
        actionBy: userId,
        success: false,
        reason: '此CDK已被作废'
      });
      
      await this.save({ session });
      await this.unlock();
      await session.commitTransaction();
      session.endSession();
      
      throw new Error('此CDK已被作废');
    }
    
    // 检查是否达到最大使用次数
    if (this.mode === CDK_MODES.MULTI_USE && this.usageCount >= this.maxUsageCount) {
      // 记录失败使用记录
      this.usageHistory.push({
        timestamp: new Date(),
        userId,
        ip: extraData.ip,
        deviceInfo: extraData.deviceInfo,
        action: 'use',
        actionBy: userId,
        success: false,
        reason: '此CDK已达到最大使用次数'
      });
      
      await this.save({ session });
      await this.unlock();
      await session.commitTransaction();
      session.endSession();
      
      throw new Error('此CDK已达到最大使用次数');
    }
    
    // 检查IP限制
    if (this.ipRestrictions && this.ipRestrictions.length > 0) {
      const clientIp = extraData.ip;
      if (!clientIp || !this.ipRestrictions.includes(clientIp)) {
        // 记录失败使用记录
        this.usageHistory.push({
          timestamp: new Date(),
          userId,
          ip: extraData.ip,
          deviceInfo: extraData.deviceInfo,
          action: 'use',
          actionBy: userId,
          success: false,
          reason: '此CDK不允许在当前IP使用'
        });
        
        await this.save({ session });
        await this.unlock();
        await session.commitTransaction();
        session.endSession();
        
        throw new Error('此CDK不允许在当前IP使用');
      }
    }
    
    // 检查设备限制
    if (this.deviceRestrictions && this.deviceRestrictions.length > 0) {
      const deviceInfo = extraData.deviceInfo;
      if (!deviceInfo || !this.deviceRestrictions.includes(deviceInfo)) {
        // 记录失败使用记录
        this.usageHistory.push({
          timestamp: new Date(),
          userId,
          ip: extraData.ip,
          deviceInfo: extraData.deviceInfo,
          action: 'use',
          actionBy: userId,
          success: false,
          reason: '此CDK不允许在当前设备使用'
        });
        
        await this.save({ session });
        await this.unlock();
        await session.commitTransaction();
        session.endSession();
        
        throw new Error('此CDK不允许在当前设备使用');
      }
    }
    
    // 更新使用状态
    this.usageCount += 1;
    this.usedBy = userId;
    
    // 记录使用历史
    this.usageHistory.push({
      timestamp: new Date(),
      userId,
      ip: extraData.ip,
      deviceInfo: extraData.deviceInfo,
      action: 'use',
      actionBy: userId,
      success: true
    });
    
    // 更新状态
    if (this.mode === CDK_MODES.SINGLE_USE || 
        (this.mode === CDK_MODES.MULTI_USE && this.usageCount >= this.maxUsageCount)) {
      this.status = CDK_STATUS.USED;
      this.usedAt = new Date();
    }
    
    // 添加审计记录
    this.auditTrail.push({
      action: 'redeem',
      performedBy: userId,
      timestamp: new Date(),
      ipAddress: extraData.ip,
      details: { deviceInfo: extraData.deviceInfo }
    });
    
    // 保存更改
    await this.save({ session });
    await this.unlock();
    await session.commitTransaction();
    session.endSession();
    
    // 返回CDK价值内容
    if (this.securityLevel >= 2 && this.valueEncrypted) {
      try {
        // 创建解密上下文
        const decryptionContext = encryptionUtils.createEncryptionContext(
          'CDK', 
          this._id.toString()
        );
        
        const decryptedValue = encryptionUtils.decrypt(
          this.valueEncrypted, 
          { context: decryptionContext }
        );
        
        // 尝试解析JSON
        try {
          return JSON.parse(decryptedValue);
        } catch (e) {
          return decryptedValue;
        }
      } catch (error) {
        throw new Error('CDK值解密失败: ' + error.message);
      }
    }
    
    return this.value;
  } catch (error) {
    // 发生错误，回滚事务
    await session.abortTransaction();
    session.endSession();
    
    // 确保解锁（如果之前成功锁定）
    if (this.locked) {
      await this.unlock().catch(() => {});
    }
    
    throw error;
  }
};

// 实例方法：作废CDK
CDKSchema.methods.revoke = async function(adminId, reason) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 先锁定CDK
    await this.lock();
    
    if (this.status === CDK_STATUS.USED) {
      await this.unlock();
      await session.abortTransaction();
      session.endSession();
      throw new Error('已使用的CDK不能作废');
    }
    
    if (this.status === CDK_STATUS.EXPIRED) {
      await this.unlock();
      await session.abortTransaction();
      session.endSession();
      throw new Error('已过期的CDK不能作废');
    }
    
    if (this.status === CDK_STATUS.REVOKED) {
      await this.unlock();
      await session.abortTransaction();
      session.endSession();
      throw new Error('此CDK已经被作废');
    }
    
    this.status = CDK_STATUS.REVOKED;
    this.revokedAt = new Date();
    this.revokeReason = reason || '管理员作废';
    this.revokedBy = adminId;
    
    // 添加审计记录
    this.auditTrail.push({
      action: 'revoke',
      performedBy: adminId,
      timestamp: new Date(),
      details: { reason }
    });
    
    // 添加使用记录
    this.usageHistory.push({
      timestamp: new Date(),
      action: 'revoke',
      actionBy: adminId,
      reason: reason || '管理员作废',
      success: true
    });
    
    await this.save({ session });
    await this.unlock();
    await session.commitTransaction();
    session.endSession();
    
    return this;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    // 确保解锁
    if (this.locked) {
      await this.unlock().catch(() => {});
    }
    
    throw error;
  }
};

// 实例方法：激活CDK
CDKSchema.methods.activate = async function(adminId, extraData = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 先锁定CDK
    await this.lock();
    
    if (this.status !== CDK_STATUS.GENERATED) {
      await this.unlock();
      await session.abortTransaction();
      session.endSession();
      throw new Error(`不能激活当前状态为${this.status}的CDK`);
    }
    
    this.status = CDK_STATUS.ACTIVATED;
    this.activatedAt = new Date();
    
    // 记录激活历史
    this.usageHistory.push({
      timestamp: new Date(),
      ip: extraData.ip,
      action: 'activate',
      actionBy: adminId,
      success: true
    });
    
    // 添加审计记录
    this.auditTrail.push({
      action: 'activate',
      performedBy: adminId,
      timestamp: new Date(),
      ipAddress: extraData.ip,
      details: { reason: extraData.reason }
    });
    
    await this.save({ session });
    await this.unlock();
    await session.commitTransaction();
    session.endSession();
    
    return this;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    // 确保解锁
    if (this.locked) {
      await this.unlock().catch(() => {});
    }
    
    throw error;
  }
};

// 模型创建
const CDK = mongoose.model('CDK', CDKSchema);

// 导出模型、类型和状态
module.exports = {
  CDK,
  CDK_TYPES,
  CDK_STATUS,
  CDK_MODES
}; 