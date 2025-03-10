/**
 * 认证中间件
 * 用于保护需要登录才能访问的路由
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const config = require('../config');
const crypto = require('crypto');

// 令牌黑名单 - 在生产环境应使用Redis等外部存储
const tokenBlacklist = new Map();

/**
 * 将令牌添加到黑名单
 * @param {String} token - JWT令牌
 * @param {Number} exp - 令牌过期时间（Unix时间戳）
 */
const addToBlacklist = (token, exp) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  tokenBlacklist.set(tokenHash, exp);
  
  // 清理过期的黑名单条目
  const now = Math.floor(Date.now() / 1000);
  for (const [hash, expiry] of tokenBlacklist.entries()) {
    if (expiry < now) {
      tokenBlacklist.delete(hash);
    }
  }
};

/**
 * 检查令牌是否在黑名单中
 * @param {String} token - JWT令牌
 * @returns {Boolean} 是否在黑名单中
 */
const isTokenBlacklisted = (token) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return tokenBlacklist.has(tokenHash);
};

/**
 * 验证JWT令牌
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express下一个中间件函数
 */
exports.verifyToken = async (req, res, next) => {
  try {
    // 获取请求头中的Authorization
    const authHeader = req.headers.authorization;
    
    // 检查是否提供了令牌
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供身份验证令牌'
      });
    }
    
    // 从Authorization中提取令牌
    const token = authHeader.split(' ')[1];
    
    // 检查令牌是否被撤销
    if (isTokenBlacklisted(token)) {
      return res.status(401).json({
        success: false,
        message: '令牌已失效，请重新登录'
      });
    }
    
    // 验证令牌，明确指定算法
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
      issuer: config.server.domain,
      maxAge: config.jwt.expiresIn // 设置最大令牌有效期
    });
    
    // 检查令牌是否有效
    if (!decoded.id || !decoded.iat) {
      return res.status(401).json({
        success: false,
        message: '无效的身份验证令牌'
      });
    }
    
    // 检查令牌是否在签发生效时间之前（防止时间回滚攻击）
    if (decoded.nbf && decoded.nbf > Math.floor(Date.now() / 1000)) {
      return res.status(401).json({
        success: false,
        message: '令牌尚未生效'
      });
    }
    
    // 验证令牌是否为指定受众（如果有）
    if (decoded.aud && decoded.aud !== config.server.domain) {
      return res.status(401).json({
        success: false,
        message: '令牌受众不匹配'
      });
    }
    
    // 查找用户
    const user = await User.findById(decoded.id);
    
    // 检查用户是否存在
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    // 检查用户是否被禁用
    if (user.status === 'banned') {
      // 将令牌加入黑名单
      if (decoded.exp) {
        addToBlacklist(token, decoded.exp);
      }
      
      return res.status(403).json({
        success: false,
        message: '账号已被禁用',
        reason: user.banReason
      });
    }
    
    // 检查令牌是否在用户密码更改之前签发
    if (user.passwordChangedAt && decoded.iat) {
      const passwordChangedTime = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (passwordChangedTime > decoded.iat) {
        return res.status(401).json({
          success: false,
          message: '您的密码已更改，请重新登录'
        });
      }
    }
    
    // 将用户信息添加到请求对象中
    req.user = user;
    req.token = token;
    req.tokenData = decoded;
    
    // 检查令牌是否即将过期（小于24小时），如果是则自动刷新
    const tokenExp = decoded.exp;
    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = tokenExp - currentTime;
    
    // 设置较短的自动刷新时间
    const refreshThreshold = config.server.env === 'production' ? 60 * 15 : 60 * 60; // 生产环境15分钟，开发环境1小时
    
    // 如果令牌即将过期，则添加新令牌到响应头
    if (timeUntilExpiry > 0 && timeUntilExpiry < refreshThreshold) {
      // 生成新令牌
      const newToken = generateAccessToken(user);
      
      // 设置响应头，客户端可以从中获取新令牌
      res.setHeader('X-New-Token', newToken);
      res.setHeader('Access-Control-Expose-Headers', 'X-New-Token');
    }
    
    // 继续后续处理
    next();
  } catch (error) {
    // 令牌已过期
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '身份验证令牌已过期',
        code: 'TOKEN_EXPIRED' // 添加代码便于客户端识别过期情况
      });
    }
    
    // 无效的签名
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: '无效的令牌签名'
      });
    }
    
    // 其他令牌验证错误
    return res.status(401).json({
      success: false,
      message: '身份验证失败'
    });
  }
};

/**
 * 检查管理员权限
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express下一个中间件函数
 */
exports.checkAdmin = (req, res, next) => {
  // 验证是否已经通过了令牌验证
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: '未经身份验证'
    });
  }
  
  // 检查用户角色是否为管理员或超级管理员
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: '权限不足'
    });
  }
  
  // 继续后续处理
  next();
};

/**
 * 检查超级管理员权限
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express下一个中间件函数
 */
exports.checkSuperAdmin = (req, res, next) => {
  // 验证是否已经通过了令牌验证
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: '未经身份验证'
    });
  }
  
  // 检查用户角色是否为超级管理员
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: '需要超级管理员权限'
    });
  }
  
  // 继续后续处理
  next();
};

/**
 * 生成访问令牌
 * @param {Object} user - 用户对象
 * @returns {String} 访问令牌
 */
function generateAccessToken(user) {
  // 当前时间（秒）
  const now = Math.floor(Date.now() / 1000);
  
  // 令牌负载
  const payload = {
    id: user._id,
    role: user.role,
    iat: now, // 签发时间
    nbf: now, // 生效时间
    iss: config.server.domain, // 签发者
    aud: config.server.domain, // 受众
    jti: crypto.randomBytes(16).toString('hex') // 唯一标识符
  };
  
  // 签名令牌，明确指定算法
  return jwt.sign(payload, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn
  });
}

/**
 * 生成刷新令牌
 * @param {Object} user - 用户对象
 * @returns {String} 刷新令牌
 */
function generateRefreshToken(user) {
  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    id: user._id,
    type: 'refresh',
    iat: now,
    nbf: now,
    iss: config.server.domain,
    jti: crypto.randomBytes(16).toString('hex')
  };
  
  return jwt.sign(payload, config.jwt.refreshSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.refreshExpiresIn
  });
}

/**
 * 刷新JWT令牌
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
exports.refreshToken = async (req, res) => {
  try {
    // 获取刷新令牌
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: '刷新令牌不能为空'
      });
    }
    
    // 检查令牌是否被撤销
    if (isTokenBlacklisted(refreshToken)) {
      return res.status(401).json({
        success: false,
        message: '刷新令牌已失效，请重新登录'
      });
    }
    
    // 验证刷新令牌，明确指定算法
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, {
      algorithms: ['HS256'],
      issuer: config.server.domain
    });
    
    // 验证令牌类型
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: '无效的刷新令牌类型'
      });
    }
    
    // 查找用户
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '无效的刷新令牌'
      });
    }
    
    // 将旧刷新令牌加入黑名单
    if (decoded.exp) {
      addToBlacklist(refreshToken, decoded.exp);
    }
    
    // 生成新的访问令牌
    const accessToken = generateAccessToken(user);
    
    // 生成新的刷新令牌
    const newRefreshToken = generateRefreshToken(user);
    
    // 返回新令牌
    res.status(200).json({
      success: true,
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: jwt.decode(accessToken).exp
    });
  } catch (error) {
    console.error('刷新令牌错误:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '刷新令牌已过期，请重新登录'
      });
    }
    
    res.status(401).json({
      success: false,
      message: '无效的刷新令牌'
    });
  }
};

/**
 * 撤销用户令牌
 * @param {String} token - JWT令牌
 * @param {String} userId - 用户ID
 */
exports.revokeToken = (token, userId) => {
  try {
    // 解码但不验证令牌，以获取过期时间
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      // 添加到黑名单
      addToBlacklist(token, decoded.exp);
      
      // 这里可以添加记录令牌撤销的逻辑
      console.info(`已撤销用户 ${userId} 的令牌`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('撤销令牌错误:', error);
    return false;
  }
};

// 导出令牌生成函数，供auth控制器使用
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken; 