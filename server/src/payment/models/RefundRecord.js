/**
 * 退款记录模型
 * 存储所有退款的记录和状态
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * 退款记录Schema
 */
const RefundRecordSchema = new Schema({
  // 原订单ID
  orderId: {
    type: String,
    required: [true, '订单ID不能为空'],
    trim: true,
    index: true
  },
  
  // 退款单号
  outRefundNo: {
    type: String,
    required: [true, '退款单号不能为空'],
    trim: true,
    unique: true,
    index: true
  },
  
  // 退款流水号（支付渠道返回）
  refundId: {
    type: String,
    trim: true,
    sparse: true
  },
  
  // 关联的交易记录ID
  transactionId: {
    type: Schema.Types.ObjectId,
    ref: 'PaymentTransaction',
    required: [true, '交易记录ID不能为空']
  },
  
  // 用户ID
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, '用户ID不能为空'],
    index: true
  },
  
  // 申请退款金额（退款总额）
  amount: {
    type: Number,
    required: [true, '退款金额不能为空'],
    min: [0.01, '退款金额必须大于0']
  },
  
  // 实际退款金额（扣除手续费后）
  actualAmount: {
    type: Number,
    required: [true, '实际退款金额不能为空'],
    min: [0, '实际退款金额必须大于等于0']
  },
  
  // 退款手续费
  feeAmount: {
    type: Number,
    default: 0
  },
  
  // 退款原因
  reason: {
    type: String,
    trim: true
  },
  
  // 退款状态
  status: {
    type: String,
    enum: [
      'pending',     // 待处理
      'processing',  // 处理中
      'success',     // 退款成功
      'failed'       // 退款失败
    ],
    default: 'pending',
    index: true
  },
  
  // 状态详情
  statusMessage: {
    type: String,
    trim: true
  },
  
  // 退款申请时间
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // 退款完成时间
  completedAt: {
    type: Date
  },
  
  // 申请人ID
  requestedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // 处理人ID
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // 原始数据
  rawData: {
    type: Object
  },
  
  // 备注
  remark: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// 索引
RefundRecordSchema.index({ userId: 1, createdAt: -1 });
RefundRecordSchema.index({ transactionId: 1 });
RefundRecordSchema.index({ status: 1, createdAt: -1 });

/**
 * 生成退款单号
 * @returns {String} 退款单号
 */
RefundRecordSchema.statics.generateRefundNo = function() {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `REF${timestamp}${random}`;
};

const RefundRecord = mongoose.model('RefundRecord', RefundRecordSchema);

module.exports = RefundRecord; 