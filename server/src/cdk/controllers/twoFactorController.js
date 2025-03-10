/**
 * 双因素认证控制器
 * 实现与Google Authenticator集成的双因素认证接口
 */

const twoFactorAuth = require('../services/twoFactorAuth');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const config = require('../../config');

/**
 * 开始设置2FA（生成QR码）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function setupTwoFactor(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // 检查用户是否已设置2FA
    if (user.twoFactorAuth && user.twoFactorAuth.activated) {
      return res.status(400).json({
        success: false,
        message: '已设置双因素认证，请先禁用当前设置',
        code: 'TWO_FACTOR_ALREADY_SETUP'
      });
    }
    
    // 生成2FA秘钥和QR码
    const result = await twoFactorAuth.generateTwoFactorSecret(
      userId, 
      user.username || user.email,
      { appName: config.appName || '跃升之路' }
    );
    
    return res.status(200).json({
      success: true,
      message: '双因素认证设置初始化成功',
      data: {
        tempToken: result.tempToken,
        secretKey: result.secretKey,
        qrCodeUrl: result.qrCodeUrl
      }
    });
  } catch (error) {
    logger.error('设置双因素认证失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      message: '设置双因素认证失败',
      error: error.message
    });
  }
}

/**
 * 验证并激活2FA
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function verifyTwoFactor(req, res) {
  try {
    const userId = req.user.id;
    const { tempToken, verificationCode } = req.body;
    
    if (!tempToken || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }
    
    // 验证代码并获取秘钥
    try {
      const result = await twoFactorAuth.verifyAndActivateTwoFactor(
        userId,
        tempToken,
        verificationCode
      );
      
      // 保存到用户记录
      await User.updateOne(
        { _id: userId },
        {
          twoFactorAuth: {
            secretKey: result.secretKey,
            activated: true,
            activatedAt: new Date()
          }
        }
      );
      
      // 记录安全日志
      logger.info('用户激活了双因素认证', {
        userId,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      return res.status(200).json({
        success: true,
        message: '双因素认证已成功激活',
        data: {
          activated: true,
          activatedAt: new Date()
        }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: 'VERIFICATION_FAILED'
      });
    }
  } catch (error) {
    logger.error('验证双因素认证失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      message: '验证双因素认证失败',
      error: error.message
    });
  }
}

/**
 * 禁用2FA
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function disableTwoFactor(req, res) {
  try {
    const userId = req.user.id;
    const { verificationCode } = req.body;
    
    // 获取用户信息
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // 检查用户是否已设置2FA
    if (!user.twoFactorAuth || !user.twoFactorAuth.activated) {
      return res.status(400).json({
        success: false,
        message: '未设置双因素认证',
        code: 'TWO_FACTOR_NOT_SETUP'
      });
    }
    
    // 验证最后一次2FA代码
    if (!verificationCode) {
      return res.status(400).json({
        success: false,
        message: '需要提供验证码以禁用双因素认证',
        code: 'VERIFICATION_CODE_REQUIRED'
      });
    }
    
    // 验证代码
    const isValid = twoFactorAuth.verifyTwoFactorCode(
      user.twoFactorAuth.secretKey,
      verificationCode
    );
    
    if (!isValid) {
      // 记录失败尝试
      logger.warn('禁用双因素认证验证失败', {
        userId,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      return res.status(401).json({
        success: false,
        message: '验证码无效',
        code: 'INVALID_VERIFICATION_CODE'
      });
    }
    
    // 禁用2FA
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          'twoFactorAuth.activated': false,
          'twoFactorAuth.disabledAt': new Date()
        }
      }
    );
    
    // 记录安全日志
    logger.info('用户禁用了双因素认证', {
      userId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    return res.status(200).json({
      success: true,
      message: '双因素认证已禁用',
      data: {
        disabledAt: new Date()
      }
    });
  } catch (error) {
    logger.error('禁用双因素认证失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      message: '禁用双因素认证失败',
      error: error.message
    });
  }
}

/**
 * 检查用户的2FA状态
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function checkTwoFactorStatus(req, res) {
  try {
    const userId = req.user.id;
    
    // 获取用户信息
    const user = await User.findById(userId)
      .select('twoFactorAuth');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // 返回2FA状态
    return res.status(200).json({
      success: true,
      data: {
        isEnabled: !!(user.twoFactorAuth && user.twoFactorAuth.activated),
        activatedAt: user.twoFactorAuth?.activatedAt
      }
    });
  } catch (error) {
    logger.error('获取双因素认证状态失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      message: '获取双因素认证状态失败',
      error: error.message
    });
  }
}

/**
 * 验证登录时的2FA代码
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function verifyLoginCode(req, res) {
  try {
    const { userId, verificationCode } = req.body;
    
    if (!userId || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }
    
    // 获取用户信息
    const user = await User.findById(userId)
      .select('twoFactorAuth');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // 检查用户是否已设置2FA
    if (!user.twoFactorAuth || !user.twoFactorAuth.activated) {
      return res.status(400).json({
        success: false,
        message: '用户未设置双因素认证',
        code: 'TWO_FACTOR_NOT_SETUP'
      });
    }
    
    // 验证2FA代码
    const isValid = twoFactorAuth.verifyTwoFactorCode(
      user.twoFactorAuth.secretKey,
      verificationCode
    );
    
    if (!isValid) {
      // 记录失败尝试
      logger.warn('登录双因素认证验证失败', {
        userId,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      return res.status(401).json({
        success: false,
        message: '验证码无效',
        code: 'INVALID_VERIFICATION_CODE'
      });
    }
    
    // 验证成功
    return res.status(200).json({
      success: true,
      message: '验证成功',
      data: {
        verified: true
      }
    });
  } catch (error) {
    logger.error('验证登录双因素认证失败', {
      error: error.message,
      stack: error.stack,
      userId: req.body?.userId
    });
    
    return res.status(500).json({
      success: false,
      message: '验证登录双因素认证失败',
      error: error.message
    });
  }
}

module.exports = {
  setupTwoFactor,
  verifyTwoFactor,
  disableTwoFactor,
  checkTwoFactorStatus,
  verifyLoginCode
}; 