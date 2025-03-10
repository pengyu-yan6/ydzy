/**
 * 认证控制器
 * 处理用户登录、注册和令牌刷新等功能
 */

const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const config = require('../config');
const bcrypt = require('bcrypt');
const { generateAccessToken, generateRefreshToken, revokeToken } = require('../middlewares/auth.middleware');
const { sanitizeUserForClient } = require('../utils/sanitize');

/**
 * 用户注册
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
exports.register = async (req, res) => {
  try {
    const { username, email, password, nickname } = req.body;

    // 输入验证
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: '请提供用户名、电子邮件和密码'
      });
    }

    // 验证密码强度
    if (password.length < config.security.minPasswordLength) {
      return res.status(400).json({
        success: false,
        message: `密码应至少包含${config.security.minPasswordLength}个字符`
      });
    }

    // 检查是否已经存在相同用户名或邮箱的用户
    const existingUser = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email.toLowerCase() }
      ]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: '用户名或电子邮件已被注册'
      });
    }

    // 创建新用户
    const newUser = new User({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password, // 密码将在模型的pre-save钩子中进行哈希处理
      nickname: nickname || username,
      registeredAt: new Date(),
      lastLoginAt: new Date(),
      status: 'active'
    });

    // 保存用户到数据库
    await newUser.save();

    // 生成访问令牌和刷新令牌
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    
    // 解码访问令牌以获取过期时间
    const decodedToken = jwt.decode(accessToken);

    // 返回成功响应和令牌
    return res.status(201).json({
      success: true,
      message: '注册成功',
      user: sanitizeUserForClient(newUser),
      accessToken,
      refreshToken,
      expiresIn: decodedToken.exp
    });
  } catch (error) {
    console.error('注册错误:', error);
    return res.status(500).json({
      success: false,
      message: '注册过程中发生错误',
      error: config.server.env === 'development' ? error.message : undefined
    });
  }
};

/**
 * 用户登录
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
exports.login = async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;

    // 检查输入
    if (!usernameOrEmail || !password) {
      return res.status(400).json({
        success: false,
        message: '请提供用户名/电子邮件和密码'
      });
    }

    // 查找用户
    const user = await User.findOne({
      $or: [
        { username: usernameOrEmail.toLowerCase() },
        { email: usernameOrEmail.toLowerCase() }
      ]
    }).select('+password'); // 显式选择密码字段，因为它可能被默认排除

    // 检查用户是否存在
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '无效的用户名/电子邮件或密码'
      });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // 记录失败的登录尝试（可以用于限制登录尝试次数）
      await User.updateOne(
        { _id: user._id },
        { 
          $inc: { failedLoginAttempts: 1 },
          $set: { lastFailedLoginAt: new Date() }
        }
      );

      return res.status(401).json({
        success: false,
        message: '无效的用户名/电子邮件或密码'
      });
    }

    // 检查用户状态
    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: '您的账号已被禁用',
        reason: user.banReason
      });
    }

    // 更新用户的最后登录时间和重置失败尝试
    await User.updateOne(
      { _id: user._id },
      { 
        $set: { 
          lastLoginAt: new Date(),
          failedLoginAttempts: 0,
          lastFailedLoginAt: null
        }
      }
    );

    // 生成访问令牌和刷新令牌
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    // 解码访问令牌以获取过期时间
    const decodedToken = jwt.decode(accessToken);

    // 返回成功响应和令牌
    return res.status(200).json({
      success: true,
      message: '登录成功',
      user: sanitizeUserForClient(user),
      accessToken,
      refreshToken,
      expiresIn: decodedToken.exp
    });
  } catch (error) {
    console.error('登录错误:', error);
    return res.status(500).json({
      success: false,
      message: '登录过程中发生错误',
      error: config.server.env === 'development' ? error.message : undefined
    });
  }
};

/**
 * 用户登出
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
exports.logout = async (req, res) => {
  try {
    // 确保请求中包含用户和令牌信息
    if (!req.user || !req.token) {
      return res.status(401).json({
        success: false,
        message: '未经身份验证'
      });
    }

    // 记录用户ID（用于审计）
    const userId = req.user._id;

    // 将当前令牌添加到黑名单
    revokeToken(req.token, userId);

    // 检查请求体中是否包含刷新令牌
    if (req.body.refreshToken) {
      // 也将刷新令牌添加到黑名单
      revokeToken(req.body.refreshToken, userId);
    }

    // 更新用户的最后登出时间
    await User.updateOne(
      { _id: userId },
      { $set: { lastLogoutAt: new Date() } }
    );

    return res.status(200).json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    console.error('登出错误:', error);
    return res.status(500).json({
      success: false,
      message: '登出过程中发生错误',
      error: config.server.env === 'development' ? error.message : undefined
    });
  }
};

/**
 * 更改密码
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    // 输入验证
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请提供当前密码和新密码'
      });
    }

    // 验证新密码强度
    if (newPassword.length < config.security.minPasswordLength) {
      return res.status(400).json({
        success: false,
        message: `密码应至少包含${config.security.minPasswordLength}个字符`
      });
    }

    // 获取用户（包括密码）
    const user = await User.findById(userId).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 验证当前密码
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '当前密码不正确'
      });
    }

    // 检查新密码是否与当前密码相同
    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: '新密码不能与当前密码相同'
      });
    }

    // 更新密码
    user.password = newPassword; // 密码将在模型的pre-save钩子中进行哈希处理
    user.passwordChangedAt = new Date();
    await user.save();

    // 撤销当前令牌（强制重新登录）
    revokeToken(req.token, userId);

    return res.status(200).json({
      success: true,
      message: '密码已成功更改，请重新登录',
    });
  } catch (error) {
    console.error('更改密码错误:', error);
    return res.status(500).json({
      success: false,
      message: '更改密码过程中发生错误',
      error: config.server.env === 'development' ? error.message : undefined
    });
  }
};

/**
 * 重置密码请求
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: '请提供电子邮件地址'
      });
    }

    // 查找用户
    const user = await User.findOne({ email: email.toLowerCase() });

    // 即使用户不存在，也返回成功响应（防止用户枚举）
    if (!user) {
      return res.status(200).json({
        success: true,
        message: '如果该电子邮件地址存在，重置密码的说明将发送到该地址'
      });
    }

    // 生成重置令牌
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1小时后过期

    // 保存重置令牌
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpires;
    await user.save({ validateBeforeSave: false });

    // 构建重置URL（在实际实现中，应该发送电子邮件）
    const resetUrl = `${config.server.clientUrl}/reset-password/${resetToken}`;

    // 在实际实现中，应该调用邮件服务发送电子邮件
    console.info(`密码重置链接: ${resetUrl}`);

    return res.status(200).json({
      success: true,
      message: '如果该电子邮件地址存在，重置密码的说明将发送到该地址',
      // 在开发环境中可以返回令牌（便于测试）
      resetToken: config.server.env === 'development' ? resetToken : undefined,
      resetUrl: config.server.env === 'development' ? resetUrl : undefined
    });
  } catch (error) {
    console.error('请求密码重置错误:', error);
    return res.status(500).json({
      success: false,
      message: '请求密码重置过程中发生错误',
      error: config.server.env === 'development' ? error.message : undefined
    });
  }
};

/**
 * 重置密码
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请提供重置令牌和新密码'
      });
    }

    // 验证新密码强度
    if (newPassword.length < config.security.minPasswordLength) {
      return res.status(400).json({
        success: false,
        message: `密码应至少包含${config.security.minPasswordLength}个字符`
      });
    }

    // 查找具有有效重置令牌的用户
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: '无效或过期的重置令牌'
      });
    }

    // 更新密码
    user.password = newPassword; // 密码将在模型的pre-save钩子中进行哈希处理
    user.passwordChangedAt = new Date();
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: '密码已成功重置，请登录'
    });
  } catch (error) {
    console.error('重置密码错误:', error);
    return res.status(500).json({
      success: false,
      message: '重置密码过程中发生错误',
      error: config.server.env === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取当前用户信息
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
exports.getCurrentUser = async (req, res) => {
  try {
    // req.user 是由 auth.middleware.js 中的 verifyToken 函数设置的
    const user = req.user;
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    return res.status(200).json({
      success: true,
      user: sanitizeUserForClient(user)
    });
  } catch (error) {
    console.error('获取当前用户信息错误:', error);
    return res.status(500).json({
      success: false,
      message: '获取当前用户信息过程中发生错误',
      error: config.server.env === 'development' ? error.message : undefined
    });
  }
}; 