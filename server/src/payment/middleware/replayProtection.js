const crypto = require('crypto');
const mongoose = require('mongoose');
const logger = require('../../utils/logger');

// 定义请求重放防护记录模型
const ReplayProtectionSchema = new mongoose.Schema({
  // 请求唯一标识
  nonceHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // 请求时间戳
  timestamp: {
    type: Date,
    required: true
  },
  // 请求来源IP
  ip: {
    type: String,
    required: true
  },
  // 请求路径
  path: {
    type: String,
    required: true
  },
  // 过期时间（TTL索引）
  expiresAt: {
    type: Date,
    required: true,
    expires: 0 // 到期自动删除
  }
});

// 创建唯一复合索引
ReplayProtectionSchema.index({ nonceHash: 1, path: 1 }, { unique: true });

// 创建模型（如果模型已存在则使用已有模型）
let ReplayProtection;
try {
  ReplayProtection = mongoose.model('ReplayProtection');
} catch (e) {
  ReplayProtection = mongoose.model('ReplayProtection', ReplayProtectionSchema);
}

/**
 * 生成请求重放防护中间件
 * @param {Object} options - 中间件配置选项
 * @param {string} options.nonceField - 请求中的nonce字段名称，默认为'nonce'
 * @param {string} options.timestampField - 请求中的时间戳字段名称，默认为'timestamp'
 * @param {number} options.maxAge - 请求有效时间窗口（秒），默认为300秒（5分钟）
 * @param {number} options.recordTTL - 记录保存时间（秒），默认为86400秒（24小时）
 * @returns {Function} Express中间件函数
 */
function replayProtection(options = {}) {
  const {
    nonceField = 'nonce',
    timestampField = 'timestamp',
    maxAge = 300, // 5分钟
    recordTTL = 86400 // 24小时
  } = options;

  return async (req, res, next) => {
    try {
      // 获取nonce和timestamp
      const nonce = req.body[nonceField] || req.query[nonceField];
      const timestamp = req.body[timestampField] || req.query[timestampField];
      
      // 如果缺少必要参数则拒绝请求
      if (!nonce || !timestamp) {
        logger.warn('请求防重放参数缺失', {
          path: req.path,
          ip: req.ip,
          missingParams: {
            nonce: !nonce,
            timestamp: !timestamp
          }
        });
        return res.status(400).json({
          success: false,
          message: '缺少必要的防重放参数',
          code: 'REPLAY_PARAMS_MISSING'
        });
      }
      
      // 验证时间戳是否在有效窗口内
      const requestTime = new Date(Number(timestamp));
      const now = new Date();
      const timeDiffInSeconds = Math.abs((now - requestTime) / 1000);
      
      if (timeDiffInSeconds > maxAge) {
        logger.warn('请求时间戳超出有效窗口', {
          path: req.path,
          ip: req.ip,
          timestamp,
          timeDiffInSeconds,
          maxAge
        });
        return res.status(400).json({
          success: false,
          message: '请求已过期或时间戳无效',
          code: 'REPLAY_TIMESTAMP_INVALID'
        });
      }
      
      // 创建nonce哈希以防止重放
      const nonceHash = crypto
        .createHash('sha256')
        .update(`${nonce}:${req.path}`)
        .digest('hex');
      
      // 设置过期时间
      const expiresAt = new Date(now.getTime() + recordTTL * 1000);
      
      // 检查请求是否已被处理过
      const existingRequest = await ReplayProtection.findOne({ nonceHash });
      
      if (existingRequest) {
        logger.warn('检测到重放请求', {
          path: req.path,
          ip: req.ip,
          originalIp: existingRequest.ip,
          timestamp,
          nonceHash
        });
        return res.status(409).json({
          success: false,
          message: '请求已被处理，不允许重放',
          code: 'REPLAY_DETECTED'
        });
      }
      
      // 记录新请求以防止未来重放
      await ReplayProtection.create({
        nonceHash,
        timestamp: requestTime,
        ip: req.ip,
        path: req.path,
        expiresAt
      });
      
      // 请求有效，继续处理
      next();
    } catch (error) {
      logger.error('防重放校验出错', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        ip: req.ip
      });
      return res.status(500).json({
        success: false,
        message: '防重放校验处理出错',
        code: 'REPLAY_CHECK_ERROR'
      });
    }
  };
}

module.exports = replayProtection; 