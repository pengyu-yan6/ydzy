const mongoose = require('mongoose');
const { CDK_TYPES, CDK_MODES } = require('./CDK');

// CDK批次模型
const CDKBatchSchema = new mongoose.Schema({
  // 批次唯一标识符
  batchId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  // 批次名称
  name: {
    type: String,
    required: true,
    trim: true
  },
  // 批次描述
  description: {
    type: String,
    trim: true
  },
  // CDK类型
  cdkType: {
    type: String,
    enum: Object.values(CDK_TYPES),
    required: true
  },
  // CDK使用模式
  cdkMode: {
    type: String,
    enum: Object.values(CDK_MODES),
    default: CDK_MODES.SINGLE_USE
  },
  // 批次创建者
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 生成的CDK数量
  quantity: {
    type: Number,
    required: true,
    min: 1,
    max: 1000000 // 限制最大生成数量，防止资源耗尽
  },
  // 已生成的CDK数量
  generatedCount: {
    type: Number,
    default: 0
  },
  // 已使用的CDK数量
  usedCount: {
    type: Number,
    default: 0
  },
  // 已激活的CDK数量
  activatedCount: {
    type: Number,
    default: 0
  },
  // 已过期的CDK数量
  expiredCount: {
    type: Number,
    default: 0
  },
  // 已作废的CDK数量
  revokedCount: {
    type: Number,
    default: 0
  },
  // 批次生成状态
  status: {
    type: String,
    enum: ['pending', 'generating', 'generated', 'partial', 'failed', 'revoked'],
    default: 'pending'
  },
  // 最大使用次数（用于多次使用模式）
  maxUsageCount: {
    type: Number,
    default: 1,
    min: 1
  },
  // CDK码格式配置
  codeFormat: {
    // 前缀
    prefix: {
      type: String,
      default: ''
    },
    // 段数
    segmentCount: {
      type: Number,
      default: 4,
      min: 1,
      max: 8
    },
    // 每段长度
    segmentLength: {
      type: Number,
      default: 4,
      min: 3,
      max: 8
    },
    // 分隔符
    separator: {
      type: String,
      default: '-'
    },
    // 字符集：数字、大写字母、小写字母、特殊字符
    characterSet: {
      type: String,
      enum: ['numbers', 'uppercase', 'lowercase', 'alphanumeric', 'all'],
      default: 'uppercase'
    },
    // 是否包含特殊字符
    includeSpecial: {
      type: Boolean,
      default: false
    },
    // 是否排除易混淆字符(0,O,1,I,l等)
    excludeAmbiguous: {
      type: Boolean,
      default: true
    }
  },
  // 加密算法
  algorithm: {
    type: String,
    enum: ['sha256', 'sha1', 'md5'],
    default: 'sha256'
  },
  // 统一过期时间
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  // 有效期（天数）
  validityDays: {
    type: Number,
    min: 1
  },
  // 批次安全级别
  securityLevel: {
    type: Number,
    default: 1,
    min: 1,
    max: 3
  },
  // 是否需要2FA验证才能使用
  requires2FA: {
    type: Boolean,
    default: false
  },
  // 批次生成完成时间
  generatedAt: {
    type: Date
  },
  // 渠道标识
  channel: {
    type: String,
    index: true
  },
  // CDK的价值内容
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // IP使用限制
  ipRestrictions: [{
    type: String
  }],
  // 设备使用限制
  deviceRestrictions: [{
    type: String
  }],
  // 自动激活
  autoActivate: {
    type: Boolean,
    default: false
  },
  // 生成任务ID（用于异步生成）
  generationJobId: {
    type: String
  },
  // 生成任务状态
  generationJobStatus: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed'],
    default: 'queued'
  },
  // 生成任务错误信息
  generationJobError: {
    type: String
  },
  // 批处理配置（优化数据库操作）
  batchProcessing: {
    // 每批处理的数量
    batchSize: {
      type: Number,
      default: 1000
    },
    // 批处理间隔（毫秒）
    batchInterval: {
      type: Number,
      default: 1000
    }
  },
  // 自定义元数据（额外信息）
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
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

// 创建索引提高查询性能
CDKBatchSchema.index({ batchId: 1 }, { unique: true });
CDKBatchSchema.index({ createdBy: 1 });
CDKBatchSchema.index({ createdAt: -1 });
CDKBatchSchema.index({ status: 1, createdAt: -1 });
CDKBatchSchema.index({ expiresAt: 1 });
CDKBatchSchema.index({ cdkType: 1, status: 1 });

// 生成唯一的批次ID
CDKBatchSchema.statics.generateBatchId = function() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `BATCH-${timestamp}-${randomPart}`;
};

// 更新批次状态信息
CDKBatchSchema.methods.updateStatusCounts = async function() {
  const { CDK } = require('./CDK');
  
  const counts = await CDK.aggregate([
    { $match: { batchId: this.batchId } },
    { $group: { 
      _id: '$status', 
      count: { $sum: 1 } 
    }}
  ]);
  
  // 重置计数
  this.generatedCount = 0;
  this.usedCount = 0;
  this.activatedCount = 0;
  this.expiredCount = 0;
  this.revokedCount = 0;
  
  // 更新各状态计数
  for (const statusCount of counts) {
    switch(statusCount._id) {
      case 'generated':
        this.generatedCount = statusCount.count;
        break;
      case 'used':
        this.usedCount = statusCount.count;
        break;
      case 'activated':
        this.activatedCount = statusCount.count;
        break;
      case 'expired':
        this.expiredCount = statusCount.count;
        break;
      case 'revoked':
        this.revokedCount = statusCount.count;
        break;
    }
  }
  
  // 更新批次整体状态
  if (this.generatedCount === 0 && this.status !== 'failed') {
    this.status = 'pending';
  } else if (this.generatedCount > 0 && this.generatedCount < this.quantity) {
    this.status = 'partial';
  } else if (this.generatedCount === this.quantity) {
    this.status = 'generated';
  }
  
  // 检查是否已全部作废
  if (this.revokedCount === this.quantity) {
    this.status = 'revoked';
  }
  
  await this.save();
  return this;
};

// 撤销整个批次
CDKBatchSchema.methods.revokeBatch = async function(adminId, reason) {
  const { CDK } = require('./CDK');
  
  if (this.status === 'revoked') {
    throw new Error('此批次已被作废');
  }
  
  // 更新批次状态
  this.status = 'revoked';
  
  // 添加审计记录
  this.auditTrail.push({
    action: 'revoke_batch',
    performedBy: adminId,
    timestamp: new Date(),
    details: { reason }
  });
  
  await this.save();
  
  // 作废该批次所有未使用的CDK
  await CDK.updateMany(
    { 
      batchId: this.batchId, 
      status: { $nin: ['used', 'expired', 'revoked'] }
    },
    { 
      $set: { 
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: adminId,
        revokeReason: reason || '批次作废'
      },
      $push: {
        auditTrail: {
          action: 'revoke',
          performedBy: adminId,
          timestamp: new Date(),
          details: { reason: reason || '批次作废' }
        }
      }
    }
  );
  
  // 更新状态计数
  return this.updateStatusCounts();
};

// 导出Excel的批次信息
CDKBatchSchema.methods.getExportInfo = function() {
  return {
    batchId: this.batchId,
    name: this.name,
    description: this.description,
    type: this.cdkType,
    mode: this.cdkMode,
    quantity: this.quantity,
    generated: this.generatedCount,
    used: this.usedCount,
    activated: this.activatedCount,
    expired: this.expiredCount,
    revoked: this.revokedCount,
    createdAt: this.createdAt,
    expiresAt: this.expiresAt,
    securityLevel: this.securityLevel,
    value: typeof this.value === 'object' ? JSON.stringify(this.value) : this.value
  };
};

// 创建模型
const CDKBatch = mongoose.model('CDKBatch', CDKBatchSchema);

module.exports = CDKBatch; 