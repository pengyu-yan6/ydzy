/**
 * CDK模块安全中间件
 * 提供速率限制、输入验证和异常检测功能
 */

const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const { sanitize } = require('express-validator/filter');
const mongoose = require('mongoose');
const { CDK_TYPES, CDK_MODES, CDK_STATUS } = require('../models/CDK');
const logger = require('../../utils/logger');
const config = require('../../config');

// CDK兑换相关速率限制
const redeemRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 20, // 每IP限制20次兑换请求
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: '请求频率过高，请稍后再试',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  // 跳过API密钥验证的请求
  skip: (req) => {
    const apiKey = req.headers['x-api-key'];
    return apiKey && apiKey === config.security.internalApiKey;
  },
  keyGenerator: (req) => {
    // 使用IP和用户ID组合作为限流键
    const userId = req.user?.id || 'anonymous';
    return `${req.ip}:${userId}`;
  }
});

// CDK状态验证相关速率限制
const cdkStatusRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每IP限制100次状态查询
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: '请求频率过高，请稍后再试',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// CDK管理操作速率限制
const cdkManagementRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10分钟
  max: 50, // 每IP限制50次管理操作
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: '请求频率过高，请稍后再试',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// 批次创建速率限制 - 更严格的限制
const batchCreateRateLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30分钟
  max: 10, // 每IP限制10次批次创建
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: '批次创建请求频率过高，请稍后再试',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// 导出功能速率限制
const exportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 5, // 每IP限制5次导出
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: '导出请求频率过高，请稍后再试',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// 验证请求结果中间件
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: '请求参数验证失败',
      errors: errors.array(),
      code: 'VALIDATION_ERROR'
    });
  }
  
  // 对查询参数进行额外过滤，防止MongoDB注入
  if (req.query && Object.keys(req.query).length > 0) {
    req.safeQuery = sanitizeMongoQuery(req.query);
  }
  
  // 对请求体进行额外过滤，防止MongoDB注入
  if (req.body && typeof req.body === 'object') {
    req.safeBody = sanitizeMongoObject(req.body);
  }
  
  next();
};

/**
 * 净化MongoDB查询对象，防止注入攻击
 * @param {Object} query - 查询对象
 * @returns {Object} 安全的查询对象
 */
function sanitizeMongoQuery(query) {
  const safeQuery = {};
  
  // 遍历所有查询参数
  for (const [key, value] of Object.entries(query)) {
    // 跳过MongoDB操作符
    if (key.startsWith('$')) {
      logger.warn('检测到可能的MongoDB注入尝试', {
        key,
        value: typeof value === 'object' ? '[object]' : value
      });
      continue;
    }
    
    // 如果值是对象，递归净化
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      safeQuery[key] = sanitizeMongoObject(value);
    }
    // 如果值是数组，净化数组内容
    else if (Array.isArray(value)) {
      safeQuery[key] = value.map(item => 
        typeof item === 'object' ? sanitizeMongoObject(item) : item
      );
    }
    // 处理特殊查询操作符
    else if (key === 'sort' && typeof value === 'string') {
      // 安全处理排序参数
      const sortParams = value.split(',').map(p => p.trim());
      const safeSortObj = {};
      
      for (const param of sortParams) {
        if (param.startsWith('-')) {
          safeSortObj[param.substring(1)] = -1;
        } else {
          safeSortObj[param] = 1;
        }
      }
      
      safeQuery[key] = safeSortObj;
    }
    // 普通值直接复制
    else {
      safeQuery[key] = value;
    }
  }
  
  return safeQuery;
}

/**
 * 净化MongoDB对象，防止注入攻击
 * @param {Object} obj - 输入对象
 * @returns {Object} 安全的对象
 */
function sanitizeMongoObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const safeObj = {};
  
  // 遍历所有属性
  for (const [key, value] of Object.entries(obj)) {
    // 检测MongoDB操作符
    if (key.startsWith('$')) {
      // 记录可能的注入尝试
      logger.warn('检测到可能的MongoDB注入尝试', {
        key,
        value: typeof value === 'object' ? '[object]' : value
      });
      continue;
    }
    
    // 递归处理嵌套对象
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      safeObj[key] = sanitizeMongoObject(value);
    }
    // 处理数组
    else if (Array.isArray(value)) {
      safeObj[key] = value.map(item => 
        typeof item === 'object' ? sanitizeMongoObject(item) : item
      );
    }
    // 普通值直接复制
    else {
      safeObj[key] = value;
    }
  }
  
  return safeObj;
}

// 创建批次验证规则
const batchCreationRules = [
  body('name')
    .notEmpty().withMessage('批次名称不能为空')
    .trim()
    .isLength({ min: 3, max: 100 }).withMessage('批次名称长度应在3-100字符之间'),
  
  body('cdkType')
    .notEmpty().withMessage('CDK类型不能为空')
    .isIn(Object.values(CDK_TYPES)).withMessage('无效的CDK类型'),
  
  body('quantity')
    .notEmpty().withMessage('数量不能为空')
    .isInt({ min: 1, max: 1000000 }).withMessage('数量必须在1-1,000,000之间'),
  
  body('value')
    .notEmpty().withMessage('CDK价值不能为空'),
  
  body('cdkMode')
    .optional()
    .isIn(Object.values(CDK_MODES)).withMessage('无效的CDK使用模式'),
  
  body('expiresAt')
    .optional()
    .isISO8601().withMessage('过期时间必须是有效的ISO日期格式')
    .custom(value => {
      const expiresAt = new Date(value);
      const now = new Date();
      if (expiresAt <= now) {
        throw new Error('过期时间必须在未来');
      }
      return true;
    }),
  
  body('validityDays')
    .optional()
    .isInt({ min: 1, max: 3650 }).withMessage('有效期天数必须在1-3650之间'),
  
  body('maxUsageCount')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('最大使用次数必须在1-1000之间'),
  
  body('securityLevel')
    .optional()
    .isInt({ min: 1, max: 3 }).withMessage('安全级别必须在1-3之间'),
  
  body('codeFormat.prefix')
    .optional()
    .isString().withMessage('前缀必须是字符串')
    .isLength({ max: 20 }).withMessage('前缀长度不能超过20个字符'),
  
  body('codeFormat.segmentCount')
    .optional()
    .isInt({ min: 1, max: 8 }).withMessage('段数必须在1-8之间'),
  
  body('codeFormat.segmentLength')
    .optional()
    .isInt({ min: 3, max: 8 }).withMessage('每段长度必须在3-8之间'),
  
  body('codeFormat.separator')
    .optional()
    .isString().withMessage('分隔符必须是字符串')
    .isLength({ max: 2 }).withMessage('分隔符长度不能超过2个字符'),
  
  body('codeFormat.characterSet')
    .optional()
    .isIn(['numbers', 'uppercase', 'lowercase', 'alphanumeric', 'all']).withMessage('无效的字符集'),
  
  body('ipRestrictions')
    .optional()
    .isArray().withMessage('IP限制必须是数组'),
  
  body('ipRestrictions.*')
    .optional()
    .matches(/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/).withMessage('IP地址格式无效'),
  
  body('requires2FA')
    .optional()
    .isBoolean().withMessage('requires2FA必须是布尔值')
];

// CDK兑换验证规则
const redeemRules = [
  body('code')
    .notEmpty().withMessage('CDK码不能为空')
    .trim()
    .isLength({ min: 5, max: 100 }).withMessage('CDK码长度应在5-100字符之间'),
  
  body('twoFactorCode')
    .optional()
    .isString().withMessage('验证码必须是字符串')
    .matches(/^\d{6}$/).withMessage('验证码必须是6位数字')
];

// 批次ID验证规则
const batchIdRules = [
  param('batchId')
    .notEmpty().withMessage('批次ID不能为空')
    .trim()
    .isLength({ min: 5, max: 100 }).withMessage('批次ID长度应在5-100字符之间')
];

// CDK ID验证规则
const cdkIdRules = [
  param('cdkId')
    .notEmpty().withMessage('CDK ID不能为空')
    .trim()
    .custom(value => {
      // 验证是否是有效的MongoDB ObjectId
      return mongoose.Types.ObjectId.isValid(value);
    }).withMessage('无效的CDK ID格式')
];

// CDK列表查询规则
const cdkListRules = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('页码必须是大于0的整数'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 500 }).withMessage('每页数量必须在1-500之间'),
  
  query('status')
    .optional()
    .isIn(Object.values(CDK_STATUS)).withMessage('无效的CDK状态'),
  
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'status', 'usedAt', 'expiresAt']).withMessage('无效的排序字段'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc']).withMessage('排序方向必须是asc或desc')
];

// 导出验证规则
const exportRules = [
  body('includeUsed')
    .optional()
    .isBoolean().withMessage('includeUsed必须是布尔值'),
  
  body('includeExpired')
    .optional()
    .isBoolean().withMessage('includeExpired必须是布尔值'),
  
  body('includeRevoked')
    .optional()
    .isBoolean().withMessage('includeRevoked必须是布尔值'),
  
  body('showSensitiveInfo')
    .optional()
    .isBoolean().withMessage('showSensitiveInfo必须是布尔值'),
  
  body('password')
    .optional()
    .isString().withMessage('密码必须是字符串')
    .isLength({ min: 8 }).withMessage('密码长度不能少于8个字符')
];

// 2FA验证规则
const twoFactorRules = [
  body('verificationCode')
    .notEmpty().withMessage('验证码不能为空')
    .matches(/^\d{6}$/).withMessage('验证码必须是6位数字'),
  
  body('tempToken')
    .optional()
    .isString().withMessage('临时令牌必须是字符串')
    .isLength({ min: 32 }).withMessage('临时令牌格式无效')
];

// 拦截存在异常行为的请求
const anomalyDetection = (req, res, next) => {
  // 标记常见的攻击模式
  const suspiciousParams = [
    'eval(',
    'exec(',
    '<script>',
    'document.cookie',
    '../../',
    '../etc/passwd',
    'sleep(',
    '$where',
    '$ne',
    { key: 'code', pattern: /^.*(--|;|\/\*|\*\/|@@|@|char|nchar|varchar|nvarchar|alter|begin|cast|create|cursor|declare|delete|drop|end|exec|execute|fetch|insert|kill|open|select|sys|sysobjects|syscolumns|table|update|union|xp_).*$/i }
  ];
  
  // 检查请求体和查询参数
  const requestBody = JSON.stringify(req.body).toLowerCase();
  const queryParams = JSON.stringify(req.query).toLowerCase();
  
  // 检查请求中的可疑模式
  for (const pattern of suspiciousParams) {
    if (typeof pattern === 'string' && (requestBody.includes(pattern.toLowerCase()) || queryParams.includes(pattern.toLowerCase()))) {
      logger.warn('检测到可疑请求模式', {
        pattern,
        ip: req.ip,
        path: req.path,
        userId: req.user?.id || 'anonymous',
        userAgent: req.headers['user-agent']
      });
      
      return res.status(403).json({
        success: false,
        message: '检测到可疑请求，已被系统拒绝',
        code: 'SUSPICIOUS_REQUEST'
      });
    } else if (typeof pattern === 'object' && req.body[pattern.key]) {
      if (pattern.pattern.test(req.body[pattern.key])) {
        logger.warn('检测到可疑参数模式', {
          parameter: pattern.key,
          ip: req.ip,
          path: req.path,
          userId: req.user?.id || 'anonymous'
        });
        
        return res.status(403).json({
          success: false,
          message: '检测到可疑请求，已被系统拒绝',
          code: 'SUSPICIOUS_REQUEST_PARAM'
        });
      }
    }
  }
  
  // 检查请求头中的常见攻击标记
  const suspiciousHeaders = ['X-Forwarded-For', 'X-Client-IP'];
  for (const header of suspiciousHeaders) {
    const headerValue = req.headers[header.toLowerCase()];
    if (headerValue && typeof headerValue === 'string' && headerValue.indexOf(';') !== -1) {
      logger.warn('检测到可疑请求头', {
        header,
        ip: req.ip,
        path: req.path,
        userId: req.user?.id || 'anonymous'
      });
      
      return res.status(403).json({
        success: false,
        message: '检测到可疑请求，已被系统拒绝',
        code: 'SUSPICIOUS_HEADER'
      });
    }
  }
  
  // 请求正常，继续处理
  next();
};

// 检查CDK完整性
const cdkIntegrityCheck = async (req, res, next) => {
  // 仅对特定路由进行验证
  if (!req.params.cdkId) {
    return next();
  }
  
  try {
    const { CDK } = require('../models/CDK');
    const cdkId = req.params.cdkId;
    
    // 验证是否是有效的ObjectId
    if (!mongoose.Types.ObjectId.isValid(cdkId)) {
      return res.status(400).json({
        success: false,
        message: '无效的CDK ID格式',
        code: 'INVALID_CDK_ID'
      });
    }
    
    const cdk = await CDK.findById(cdkId);
    if (!cdk) {
      return res.status(404).json({
        success: false,
        message: 'CDK不存在',
        code: 'CDK_NOT_FOUND'
      });
    }
    
    // 检查完整性
    if (!cdk.verifyIntegrity()) {
      logger.warn('CDK完整性验证失败', {
        cdkId,
        code: cdk.code,
        userId: req.user?.id || 'system',
        ip: req.ip
      });
      
      return res.status(400).json({
        success: false,
        message: 'CDK数据完整性验证失败，可能被篡改',
        code: 'INTEGRITY_CHECK_FAILED'
      });
    }
    
    // 完整性验证通过，将CDK对象附加到请求中供后续使用
    req.cdk = cdk;
    next();
  } catch (error) {
    logger.error('CDK完整性检查失败', {
      error: error.message,
      cdkId: req.params.cdkId,
      ip: req.ip
    });
    
    return res.status(500).json({
      success: false,
      message: '无法验证CDK完整性',
      code: 'INTEGRITY_CHECK_ERROR'
    });
  }
};

// 为每个请求添加跟踪ID
const addRequestId = (req, res, next) => {
  const { v4: uuidv4 } = require('uuid');
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
};

module.exports = {
  // 速率限制器
  redeemRateLimiter,
  cdkStatusRateLimiter,
  cdkManagementRateLimiter,
  batchCreateRateLimiter,
  exportRateLimiter,
  
  // 验证规则
  batchCreationRules,
  redeemRules,
  batchIdRules,
  cdkIdRules,
  cdkListRules,
  exportRules,
  twoFactorRules,
  
  // 验证中间件
  validateRequest,
  
  // 安全中间件
  anomalyDetection,
  cdkIntegrityCheck,
  addRequestId
}; 