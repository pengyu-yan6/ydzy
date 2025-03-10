/**
 * 游戏安全配置
 */
const securityConfig = {
  // 签名验证相关配置
  security: {
    // 默认密钥（可以通过环境变量配置）
    defaultSecretKey: process.env.DEFAULT_SECRET_KEY || 'game_default_secret_key_change_in_production',
    
    // 支付相关密钥
    paymentSecretKey: process.env.PAYMENT_SECRET_KEY || 'payment_secret_key_change_in_production',
    
    // 战斗相关密钥
    battleSecretKey: process.env.BATTLE_SECRET_KEY || 'battle_secret_key_change_in_production',
    
    // 签名有效时间窗口（秒）
    signatureTimeWindow: parseInt(process.env.SIGNATURE_TIME_WINDOW || '300', 10),
    
    // 操作签名有效时间窗口（秒，通常比普通签名窗口短）
    actionSignatureTimeWindow: parseInt(process.env.ACTION_SIGNATURE_TIME_WINDOW || '30', 10),
    
    // JWT密钥
    jwtSecret: process.env.JWT_SECRET || 'change_this_in_production',
    
    // JWT过期时间（小时）
    jwtExpiresIn: parseInt(process.env.JWT_EXPIRES_IN || '24', 10),
    
    // 秘钥轮换频率（小时）
    keyRotationHours: parseInt(process.env.KEY_ROTATION_HOURS || '24', 10),
    
    // 是否启用严格模式（所有API都需要签名）
    strictMode: process.env.STRICT_SIGNATURE_MODE === 'true',
    
    // WebSocket配置
    websocket: {
      // 消息验证严格模式
      strictMessageValidation: process.env.STRICT_WEBSOCKET_VALIDATION === 'true',
      
      // 单设备登录（禁止多设备同时登录）
      singleDeviceLogin: process.env.WEBSOCKET_SINGLE_DEVICE === 'true',
      
      // 连接限流
      maxConnectionsPerUser: parseInt(process.env.MAX_WEBSOCKET_CONNECTIONS_PER_USER || '1', 10),
      
      // ping间隔（毫秒）
      pingInterval: parseInt(process.env.WEBSOCKET_PING_INTERVAL || '25000', 10),
      
      // ping超时（毫秒）
      pingTimeout: parseInt(process.env.WEBSOCKET_PING_TIMEOUT || '20000', 10),
      
      // 消息队列处理速率（毫秒）
      messageProcessInterval: parseInt(process.env.WEBSOCKET_MESSAGE_PROCESS_INTERVAL || '50', 10)
    },
    
    // 签名排除路径
    excludePaths: [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/forgot-password',
      '/health',
      '/api/docs',
      '/api/public',
      /^\/api\/assets\//,
    ],
    
    // 数据库加密配置
    dbEncryption: {
      // 数据库主密钥
      dbMasterKey: process.env.DB_MASTER_KEY || 'change_this_in_production',
      
      // 完整性保护密钥
      dbIntegrityKey: process.env.DB_INTEGRITY_KEY || 'change_this_in_production',
      
      // 密钥轮换间隔（天）
      keyRotationDays: parseInt(process.env.DB_KEY_ROTATION_DAYS || '30', 10),
      
      // 是否启用自动密钥轮换
      autoKeyRotation: process.env.DB_AUTO_KEY_ROTATION !== 'false',
      
      // 密钥存储位置
      keyStoragePath: process.env.DB_KEY_STORAGE_PATH || './keys',
      
      // 加密算法
      algorithm: process.env.DB_ENCRYPTION_ALGORITHM || 'aes-256-gcm'
    },
    
    // 操作审计日志配置
    auditLog: {
      // 是否启用审计日志
      enabled: process.env.ENABLE_AUDIT_LOG !== 'false',
      
      // 是否持久化到数据库
      persistToDb: process.env.AUDIT_LOG_PERSIST_DB !== 'false',
      
      // 是否持久化到文件
      persistToFile: process.env.NODE_ENV === 'production' || process.env.AUDIT_LOG_PERSIST_FILE === 'true',
      
      // 日志文件目录
      logDir: process.env.AUDIT_LOG_DIR || './logs/audit',
      
      // 日志保留天数
      retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10),
      
      // 内存中最大保留日志数
      maxMemoryLogs: parseInt(process.env.AUDIT_MAX_MEMORY_LOGS || '5000', 10),
      
      // 日志文件轮换大小（字节）
      rotationSize: parseInt(process.env.AUDIT_ROTATION_SIZE || (10 * 1024 * 1024).toString(), 10),
      
      // 是否压缩轮换后的日志
      compressRotatedLogs: process.env.AUDIT_COMPRESS_LOGS !== 'false',
      
      // 完整性保护密钥
      integrityKey: process.env.AUDIT_INTEGRITY_KEY || 'change_this_in_production',
      
      // 需要记录请求体的路径
      recordRequestBodyPaths: [
        '/api/admin/',
        '/api/payment/',
        '/api/game/item/create',
        '/api/game/item/delete'
      ],
      
      // 需要记录响应体的路径
      recordResponseBodyPaths: [
        '/api/admin/',
        '/api/payment/'
      ]
    }
  },
  
  // DDoS防护配置
  ddos: {
    // 是否启用DDoS防护
    enabled: process.env.ENABLE_DDOS_PROTECTION === 'true',
    
    // 请求限制配置
    rateLimit: {
      // 窗口时间（毫秒）
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      
      // 在窗口时间内允许的最大请求数
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
      
      // 是否根据IP分别限制
      limitByIp: process.env.RATE_LIMIT_BY_IP !== 'false',
      
      // 标准响应消息
      message: '请求频率过高，请稍后再试',
      
      // 白名单IP（不受限制）
      whitelistIps: (process.env.RATE_LIMIT_WHITELIST || '').split(',').filter(Boolean)
    },
    
    // 高级DDoS检测配置
    detection: {
      // 模式：'passive'(仅记录)/'active'(拦截)
      mode: process.env.DDOS_DETECTION_MODE || 'passive',
      
      // 异常检测阈值
      thresholds: {
        // 单IP短时间内的请求突增率
        burstFactor: parseFloat(process.env.DDOS_BURST_FACTOR || '5.0'),
        
        // 单IP在检测周期内的最大请求数
        maxRequestsPerCycle: parseInt(process.env.DDOS_MAX_REQUESTS_PER_CYCLE || '1000', 10),
        
        // 检测周期（秒）
        cycleDuration: parseInt(process.env.DDOS_CYCLE_DURATION || '60', 10)
      }
    }
  },
  
  // 敏感操作二次认证配置
  twoFactorAuth: {
    // 需要二次认证的操作路径
    sensitiveOperations: [
      '/api/user/password/change',
      '/api/user/email/change',
      '/api/payment/withdraw',
      '/api/payment/bind-account',
      '/api/account/delete'
    ],
    
    // 二次认证过期时间（分钟）
    expirationMinutes: parseInt(process.env.TWO_FACTOR_EXPIRATION_MINUTES || '10', 10),
    
    // 验证码长度
    codeLength: parseInt(process.env.TWO_FACTOR_CODE_LENGTH || '6', 10),
    
    // 每日最大验证次数
    maxDailyVerifications: parseInt(process.env.TWO_FACTOR_MAX_DAILY || '10', 10),
    
    // 允许尝试次数
    maxAttempts: parseInt(process.env.TWO_FACTOR_MAX_ATTEMPTS || '3', 10)
  },
  
  // 反作弊配置
  antiCheat: {
    // 是否启用异常行为检测
    enabled: process.env.ENABLE_ANTI_CHEAT === 'true',
    
    // 战斗数据异常检测阈值
    battleAnomalyThresholds: {
      // 最大伤害偏差系数
      maxDamageDeviationFactor: parseFloat(process.env.MAX_DAMAGE_DEVIATION || '1.5'),
      
      // 最大速度异常系数
      maxSpeedAnomalyFactor: parseFloat(process.env.MAX_SPEED_ANOMALY || '1.3'),
      
      // 异常行为触发阈值（多少次异常才触发）
      triggerThreshold: parseInt(process.env.ANOMALY_TRIGGER_THRESHOLD || '3', 10),
      
      // 异常行为清零时间（小时）
      anomalyResetHours: parseInt(process.env.ANOMALY_RESET_HOURS || '24', 10)
    },
    
    // 资源异常检测阈值
    resourceAnomalyThresholds: {
      // 最大资源获取速率（单位时间内）
      maxResourceGainRate: parseFloat(process.env.MAX_RESOURCE_GAIN_RATE || '1.5'),
      
      // 检测时间窗口（小时）
      windowHours: parseInt(process.env.RESOURCE_WINDOW_HOURS || '6', 10)
    }
  },
  
  // 游戏完整性保护
  integrityProtection: {
    // 客户端数据校验频率（秒）
    clientVerificationInterval: parseInt(process.env.CLIENT_VERIFICATION_INTERVAL || '300', 10),
    
    // 是否启用混淆代码
    enableCodeObfuscation: process.env.ENABLE_CODE_OBFUSCATION === 'true',
    
    // 服务器端校验密钥（用于检验客户端数据）
    verificationKey: process.env.VERIFICATION_KEY || 'change_this_in_production',
    
    // 防篡改策略
    tamperProtection: {
      // 是否检查数据完整性
      checkDataIntegrity: process.env.CHECK_DATA_INTEGRITY !== 'false',
      
      // 是否验证客户端版本
      validateClientVersion: process.env.VALIDATE_CLIENT_VERSION !== 'false',
      
      // 是否使用加密通信
      useEncryptedComms: process.env.USE_ENCRYPTED_COMMS !== 'false'
    }
  },
  
  // RBAC权限控制配置
  rbac: {
    // 默认角色
    defaultRole: process.env.DEFAULT_ROLE || 'user',
    
    // 是否检查IP限制
    checkIpRestrictions: process.env.CHECK_IP_RESTRICTIONS !== 'false',
    
    // 是否检查时间限制
    checkTimeRestrictions: process.env.CHECK_TIME_RESTRICTIONS !== 'false',
    
    // 敏感操作是否需要MFA
    requireMfaForSensitiveOperations: process.env.REQUIRE_MFA_FOR_SENSITIVE !== 'false',
    
    // 角色分级配置
    roles: {
      // 用户角色
      user: {
        level: 1,
        description: '普通用户'
      },
      // 会员角色
      vip: {
        level: 2,
        description: 'VIP用户'
      },
      // 版主角色
      moderator: {
        level: 3,
        description: '版主'
      },
      // 管理员角色
      admin: {
        level: 4,
        description: '管理员',
        requireMfa: true
      },
      // 超级管理员角色
      superadmin: {
        level: 5,
        description: '超级管理员',
        requireMfa: true
      }
    },
    
    // 审计日志安全性级别映射
    auditLogLevels: {
      1: 'LOW',     // 用户
      2: 'LOW',     // VIP
      3: 'MEDIUM',  // 版主
      4: 'HIGH',    // 管理员
      5: 'CRITICAL' // 超级管理员
    }
  },
  
  // 请求频率限制中间件配置
  rateLimit: {
    // 全局限制
    global: {
      windowMs: 60 * 1000, // 1分钟
      maxRequests: 100 // 每分钟100次请求
    },
    
    // 登录限制
    login: {
      windowMs: 15 * 60 * 1000, // 15分钟
      maxRequests: 5, // 最多5次登录尝试
      message: '登录尝试次数过多，请稍后再试'
    },
    
    // 注册限制
    register: {
      windowMs: 60 * 60 * 1000, // 1小时
      maxRequests: 3, // 每IP最多3次注册
      message: '注册频率过高，请稍后再试'
    },
    
    // 支付限制
    payment: {
      windowMs: 60 * 1000, // 1分钟
      maxRequests: 10, // 每用户最多10次支付请求
      message: '支付请求频率过高，请稍后再试'
    },
    
    // 战斗限制
    battle: {
      windowMs: 10 * 1000, // 10秒
      maxRequests: 20, // 每用户最多20次战斗请求
      message: '战斗请求频率过高，请稍后再试'
    }
  },
  
  // 错误处理和日志配置
  errorHandling: {
    // 是否在生产环境隐藏敏感错误细节
    hideErrorDetails: process.env.NODE_ENV === 'production',
    
    // 错误日志级别
    logLevel: process.env.ERROR_LOG_LEVEL || 'error',
    
    // 是否记录完整的错误栈信息
    logStackTraces: process.env.LOG_STACK_TRACES !== 'false',
    
    // 是否发送错误报警通知
    sendErrorAlerts: process.env.SEND_ERROR_ALERTS === 'true',
    
    // 错误报警阈值（同类错误多少次才触发报警）
    alertThreshold: parseInt(process.env.ERROR_ALERT_THRESHOLD || '5', 10),
    
    // 错误报警窗口（分钟）
    alertWindowMinutes: parseInt(process.env.ERROR_ALERT_WINDOW || '15', 10),
    
    // 错误报警通道
    alertChannels: (process.env.ERROR_ALERT_CHANNELS || 'email').split(',')
  },
  
  // 跨域配置 (CORS)
  cors: {
    // 是否启用CORS
    enabled: process.env.ENABLE_CORS !== 'false',
    
    // 允许的域名
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '*').split(','),
    
    // 允许的方法
    allowedMethods: (process.env.CORS_ALLOWED_METHODS || 'GET,POST,PUT,DELETE,OPTIONS').split(','),
    
    // 允许的头信息
    allowedHeaders: (process.env.CORS_ALLOWED_HEADERS || 'Content-Type,Authorization,X-Signature,X-Timestamp,X-Nonce').split(','),
    
    // 是否允许携带凭证（如Cookie）
    allowCredentials: process.env.CORS_ALLOW_CREDENTIALS === 'true',
    
    // 预检请求缓存时间（秒）
    optionsSuccessStatus: parseInt(process.env.CORS_OPTIONS_SUCCESS_STATUS || '204', 10),
    
    // 最大有效期（秒）
    maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10)
  }
};

module.exports = securityConfig; 