/**
 * 项目配置文件
 * 集中管理所有环境变量和配置参数
 */

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 加载环境变量
dotenv.config();

// 检查关键环境变量是否设置
const requiredEnvVars = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'MONGODB_URI'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0 && process.env.NODE_ENV === 'production') {
  throw new Error(`缺少关键环境变量: ${missingEnvVars.join(', ')}`);
}

// 在开发环境中，生成随机密钥代替默认硬编码值
function generateSecureSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

// 环境特定的配置
const envSpecificConfig = {
  development: {
    jwt: {
      secret: process.env.JWT_SECRET || generateSecureSecret(),
      refreshSecret: process.env.JWT_REFRESH_SECRET || generateSecureSecret(),
      expiresIn: '1h', // 开发环境短期令牌
      refreshExpiresIn: '24h',
    },
    logging: {
      level: 'debug',
      console: true
    }
  },
  test: {
    jwt: {
      secret: process.env.JWT_SECRET || generateSecureSecret(),
      refreshSecret: process.env.JWT_REFRESH_SECRET || generateSecureSecret(),
      expiresIn: '15m',
      refreshExpiresIn: '1h',
    },
    logging: {
      level: 'warn',
      console: true
    }
  },
  production: {
    jwt: {
      // 生产环境必须提供实际的密钥
      secret: process.env.JWT_SECRET,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '30m', // 生产环境短期令牌
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      console: false
    }
  }
};

// 获取当前环境
const environment = process.env.NODE_ENV || 'development';
const envConfig = envSpecificConfig[environment] || envSpecificConfig.development;

// 主配置
const config = {
  // 服务器配置
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: environment,
    domain: process.env.DOMAIN || 'localhost',
    // 在生产环境中要求HTTPS
    requireSecure: environment === 'production',
  },
  
  // 数据库配置
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/leaprise',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  
  // JWT配置 - 从环境特定配置合并
  jwt: { ...envConfig.jwt },
  
  // 加密配置
  bcrypt: {
    // 开发环境使用较低的轮数以提高速度，生产环境使用更高的轮数
    saltRounds: environment === 'production' 
      ? parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10) 
      : parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
  },
  
  // 支付网关配置
  payment: {
    apiKey: process.env.PAYMENT_GATEWAY_API_KEY,
    secret: process.env.PAYMENT_GATEWAY_SECRET,
    callbackUrl: process.env.PAYMENT_CALLBACK_URL,
    // 支付渠道
    channels: {
      alipay: 'alipay',
      wechat: 'wechat',
      creditCard: 'credit_card',
    },
    // 支付网关IP白名单
    gatewayIPs: (process.env.PAYMENT_GATEWAY_IPS || '').split(',').filter(Boolean),
    // 支付订单超时时间（分钟）
    orderTimeoutMinutes: parseInt(process.env.PAYMENT_ORDER_TIMEOUT || '30', 10),
    // 支付回调最大重试次数
    maxCallbackRetries: parseInt(process.env.PAYMENT_MAX_RETRIES || '3', 10)
  },
  
  // 游戏相关配置
  game: {
    // 游戏回合最大时间（秒）
    roundTime: 30,
    // 初始金币
    initialGold: 50,
    // 初始生命值
    initialHealth: 100,
    // 最大回合数
    maxRounds: 30,
    // 玩家初始等级
    initialLevel: 1,
    // 玩家初始经验
    initialExp: 0,
    // 等级经验需求
    levelExpRequirement: {
      1: 0,
      2: 2,
      3: 6,
      4: 10,
      5: 20,
      6: 36,
      7: 56,
      8: 80,
      9: 100
    },
    // 每级可上场英雄数量
    levelHeroSlots: {
      1: 3,
      2: 4,
      3: 5,
      4: 6,
      5: 7,
      6: 8,
      7: 9,
      8: 9,
      9: 9
    }
  },
  
  // CDK配置
  cdk: {
    // CDK长度
    length: 16,
    // CDK类型
    types: {
      GIFT: 'gift',        // 礼品码
      ACTIVATION: 'activation', // 激活码
      VIP: 'vip',          // VIP码
      EVENT: 'event'       // 活动码
    }
  },
  
  // 安全配置
  security: {
    // 密码最小长度
    minPasswordLength: 8,
    // API限流配置
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15分钟
      max: environment === 'production' ? 100 : 1000 // 生产环境更严格的限制
    },
    // 敏感操作IP锁定时间（分钟）
    ipLockTime: 30,
    // 数据加密密钥（32字节，64个十六进制字符）
    encryptionKey: process.env.ENCRYPTION_KEY || generateSecureSecret(32),
    // 支付风控规则
    paymentRiskRules: {
      maxDailyAmount: parseInt(process.env.MAX_DAILY_PAYMENT || '10000', 10), // 每日最大支付金额
      maxSingleAmount: parseInt(process.env.MAX_SINGLE_PAYMENT || '2000', 10), // 单笔最大金额
      suspiciousAmounts: [1, 666, 888], // 可疑金额列表
      minTimeBetweenPayments: parseInt(process.env.MIN_PAYMENT_INTERVAL || '30', 10) // 两次支付最小间隔（秒）
    },
    // 敏感数据字段
    sensitiveFields: ['password', 'cardNumber', 'cvv', 'idNumber', 'amount', 'token', 'secret', 'key'],
    // CSRF保护
    csrfProtection: environment === 'production', // 生产环境强制开启
    // 内容安全策略
    contentSecurityPolicy: environment === 'production', // 生产环境强制开启
    // 允许的域名（CORS）
    allowedOrigins: process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',') 
      : ['http://localhost:3000', 'http://localhost:8080']
  },
  
  // 日志配置
  logging: {
    level: envConfig.logging.level,
    // 日志文件路径
    filePath: process.env.LOG_FILE_PATH || './logs',
    // 是否在控制台输出
    console: envConfig.logging.console,
    // 是否启用审计日志
    enableAudit: environment === 'production' || process.env.ENABLE_AUDIT_LOG === 'true'
  }
};

// 日志警告任何可能不安全的配置
if (environment === 'production') {
  const warnings = [];
  
  // 检查生产环境的密钥是否复杂
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warnings.push('JWT密钥太短，应至少为32个字符');
  }
  
  // 检查生产环境的令牌过期时间是否过长
  if (process.env.JWT_EXPIRES_IN && process.env.JWT_EXPIRES_IN.includes('d') && 
      parseInt(process.env.JWT_EXPIRES_IN, 10) > 1) {
    warnings.push('JWT令牌过期时间过长，建议不超过1天');
  }
  
  if (warnings.length > 0) {
    console.warn('安全配置警告:');
    warnings.forEach(warning => console.warn(`- ${warning}`));
  }
}

module.exports = config; 