const crypto = require('crypto');
const mongoose = require('mongoose');
const config = require('../config/security.config');
const logger = require('../utils/logger');
const emailService = require('../utils/email.service');

// 验证码模型（如果未定义，需要创建）
let VerificationCode;
try {
  VerificationCode = mongoose.model('VerificationCode');
} catch (e) {
  // 模型不存在，创建
  const verificationCodeSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    code: {
      type: String,
      required: true
    },
    purpose: {
      type: String,
      required: true,
      enum: ['email_change', 'password_change', 'payment', 'account_deletion', 'sensitive_action']
    },
    expiresAt: {
      type: Date,
      required: true
    },
    used: {
      type: Boolean,
      default: false
    },
    attempts: {
      type: Number,
      default: 0
    },
    metadata: {
      type: Object,
      default: {}
    }
  });
  
  verificationCodeSchema.index({ userId: 1, purpose: 1 });
  verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  
  VerificationCode = mongoose.model('VerificationCode', verificationCodeSchema);
}

/**
 * 敏感操作二次认证系统
 */
class TwoFactorAuth {
  /**
   * 生成随机验证码
   * @param {Number} length - 验证码长度
   * @returns {String} - 生成的验证码
   */
  static generateCode(length = config.twoFactorAuth.codeLength) {
    // 生成6-8位数字验证码
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
  }
  
  /**
   * 为用户创建验证码
   * @param {String} userId - 用户ID
   * @param {String} purpose - 验证目的
   * @param {Object} metadata - 额外元数据
   * @returns {Promise<String>} - 生成的验证码
   */
  static async createVerificationCode(userId, purpose, metadata = {}) {
    // 检查当日验证码发送次数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const codesSentToday = await VerificationCode.countDocuments({
      userId,
      createdAt: { $gte: today }
    });
    
    if (codesSentToday >= config.twoFactorAuth.maxDailyVerifications) {
      throw new Error('已超过今日验证码发送次数限制');
    }
    
    // 删除该用户同一用途的未过期验证码
    await VerificationCode.deleteMany({
      userId,
      purpose,
      expiresAt: { $gt: new Date() },
      used: false
    });
    
    // 生成新验证码
    const code = this.generateCode();
    
    // 计算过期时间
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + config.twoFactorAuth.expirationMinutes);
    
    // 存储验证码
    const verificationCode = new VerificationCode({
      userId,
      code,
      purpose,
      expiresAt,
      metadata
    });
    
    await verificationCode.save();
    
    logger.info(`为用户 ${userId} 生成了 ${purpose} 验证码`);
    return code;
  }
  
  /**
   * 发送验证码到用户邮箱
   * @param {String} userId - 用户ID
   * @param {String} email - 用户邮箱
   * @param {String} purpose - 验证目的
   * @param {Object} metadata - 额外元数据
   * @returns {Promise<Boolean>} - 是否发送成功
   */
  static async sendVerificationEmail(userId, email, purpose, metadata = {}) {
    try {
      const code = await this.createVerificationCode(userId, purpose, metadata);
      
      // 根据不同目的设置不同的邮件主题和内容
      let subject, content;
      
      switch (purpose) {
        case 'email_change':
          subject = '邮箱变更验证';
          content = `您正在尝试变更邮箱地址，请使用以下验证码完成操作：${code}。该验证码 ${config.twoFactorAuth.expirationMinutes} 分钟内有效。`;
          break;
        case 'password_change':
          subject = '密码修改验证';
          content = `您正在修改账号密码，请使用以下验证码完成操作：${code}。该验证码 ${config.twoFactorAuth.expirationMinutes} 分钟内有效。`;
          break;
        case 'payment':
          subject = '支付操作验证';
          content = `您正在进行支付相关操作，请使用以下验证码完成验证：${code}。该验证码 ${config.twoFactorAuth.expirationMinutes} 分钟内有效。`;
          break;
        case 'account_deletion':
          subject = '账号删除验证';
          content = `您正在请求删除账号，请使用以下验证码完成验证：${code}。该验证码 ${config.twoFactorAuth.expirationMinutes} 分钟内有效。请注意，此操作不可逆。`;
          break;
        default:
          subject = '操作验证码';
          content = `您正在执行敏感操作，请使用以下验证码完成验证：${code}。该验证码 ${config.twoFactorAuth.expirationMinutes} 分钟内有效。`;
      }
      
      // 发送邮件
      await emailService.sendEmail({
        to: email,
        subject,
        text: content
      });
      
      logger.info(`验证码已发送至 ${email}`);
      return true;
    } catch (error) {
      logger.error(`发送验证码失败: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 验证用户提交的验证码
   * @param {String} userId - 用户ID
   * @param {String} code - 用户提交的验证码
   * @param {String} purpose - 验证目的
   * @returns {Promise<Boolean>} - 验证是否通过
   */
  static async verifyCode(userId, code, purpose) {
    const verificationRecord = await VerificationCode.findOne({
      userId,
      purpose,
      expiresAt: { $gt: new Date() },
      used: false
    }).sort({ createdAt: -1 });
    
    if (!verificationRecord) {
      logger.warn(`用户 ${userId} 的 ${purpose} 验证码不存在或已过期`);
      return false;
    }
    
    // 更新尝试次数
    verificationRecord.attempts += 1;
    
    // 检查尝试次数是否超限
    if (verificationRecord.attempts > config.twoFactorAuth.maxAttempts) {
      verificationRecord.used = true; // 标记为已使用（无效）
      await verificationRecord.save();
      
      logger.warn(`用户 ${userId} 的 ${purpose} 验证码尝试次数超限`);
      throw new Error('验证码尝试次数超限，请重新获取验证码');
    }
    
    // 验证码比对
    const isValid = verificationRecord.code === code;
    
    if (isValid) {
      // 验证通过，标记为已使用
      verificationRecord.used = true;
      await verificationRecord.save();
      
      logger.info(`用户 ${userId} 的 ${purpose} 验证码验证通过`);
    } else {
      // 验证不通过，保存尝试记录
      await verificationRecord.save();
      
      logger.warn(`用户 ${userId} 的 ${purpose} 验证码验证失败`);
    }
    
    return isValid;
  }
  
  /**
   * 创建二次验证中间件
   * @returns {Function} Express中间件
   */
  static createMiddleware() {
    return async (req, res, next) => {
      try {
        // 检查路径是否需要二次验证
        const needsVerification = config.twoFactorAuth.sensitiveOperations.includes(req.path);
        
        if (!needsVerification) {
          return next();
        }
        
        // 获取用户ID
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({
            success: false,
            message: '需要登录',
            error: 'AUTH_REQUIRED'
          });
        }
        
        // 从请求中获取验证码
        const { verificationCode } = req.body;
        
        if (!verificationCode) {
          return res.status(400).json({
            success: false,
            message: '需要验证码',
            error: 'VERIFICATION_REQUIRED'
          });
        }
        
        // 确定验证目的
        let purpose = 'sensitive_action';
        if (req.path.includes('password')) {
          purpose = 'password_change';
        } else if (req.path.includes('email')) {
          purpose = 'email_change';
        } else if (req.path.includes('payment') || req.path.includes('withdraw')) {
          purpose = 'payment';
        } else if (req.path.includes('delete')) {
          purpose = 'account_deletion';
        }
        
        // 验证验证码
        const isValid = await this.verifyCode(userId, verificationCode, purpose);
        
        if (!isValid) {
          return res.status(400).json({
            success: false,
            message: '验证码无效',
            error: 'INVALID_VERIFICATION_CODE'
          });
        }
        
        // 验证通过，继续处理请求
        next();
      } catch (error) {
        logger.error(`二次验证中间件错误: ${error.message}`);
        
        return res.status(400).json({
          success: false,
          message: error.message,
          error: 'VERIFICATION_ERROR'
        });
      }
    };
  }
  
  /**
   * 请求发送验证码的控制器方法
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  static async requestVerificationCode(req, res) {
    try {
      const { purpose } = req.body;
      const userId = req.user.id;
      const email = req.user.email;
      
      if (!purpose || !userId || !email) {
        return res.status(400).json({
          success: false,
          message: '缺少必要参数',
          error: 'MISSING_PARAMETERS'
        });
      }
      
      // 发送验证码
      await this.sendVerificationEmail(userId, email, purpose);
      
      return res.status(200).json({
        success: true,
        message: '验证码已发送至您的邮箱'
      });
    } catch (error) {
      logger.error(`请求验证码失败: ${error.message}`);
      
      return res.status(400).json({
        success: false,
        message: error.message,
        error: 'VERIFICATION_CODE_REQUEST_FAILED'
      });
    }
  }
}

module.exports = TwoFactorAuth; 