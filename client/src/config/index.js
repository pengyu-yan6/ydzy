/**
 * 前端配置文件
 * 集中管理所有配置参数
 */

// 环境变量
const ENV = process.env.NODE_ENV || 'development';
const isProd = ENV === 'production';
const isDev = ENV === 'development';
const isTest = ENV === 'test';

// API基础URL
const API_BASE_URL = {
  development: 'http://localhost:3000/api',
  test: 'https://test-api.yourgame.com/api',
  production: 'https://api.yourgame.com/api'
}[ENV];

// WebSocket URL
const WS_BASE_URL = {
  development: 'ws://localhost:3000/game',
  test: 'wss://test-api.yourgame.com/game',
  production: 'wss://api.yourgame.com/game'
}[ENV];

// 资源URL
const ASSETS_URL = {
  development: 'http://localhost:3000/assets',
  test: 'https://test-assets.yourgame.com',
  production: 'https://assets.yourgame.com'
}[ENV];

// WebAssembly路径
const WASM_PATH = {
  development: '/assets/wasm',
  test: 'https://test-assets.yourgame.com/wasm',
  production: 'https://assets.yourgame.com/wasm'
}[ENV];

// 安全配置
const SECURITY_CONFIG = {
  // 请求签名相关配置
  signature: {
    // 签名有效期（毫秒）
    validityWindow: 3 * 60 * 1000, // 3分钟
    // 严格模式（如果为true，所有请求都必须有签名）
    strictMode: isProd,
    // 不需要签名的路径
    excludePaths: [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/public/'
    ]
  },
  
  // 认证相关配置
  auth: {
    // Token过期提醒时间（毫秒）
    tokenExpiryWarning: 10 * 60 * 1000, // 10分钟
    // 刷新Token间隔（毫秒）
    refreshInterval: 30 * 60 * 1000, // 30分钟
    // 登录后重定向地址
    defaultRedirect: '/game/dashboard',
    // 登录页面地址
    loginPath: '/login',
    // 是否使用本地存储保持登录状态
    persistLogin: true
  },
  
  // WebSocket配置
  websocket: {
    // 自动重连
    autoReconnect: true,
    // 重连间隔（毫秒）
    reconnectInterval: 5000,
    // 最大重连次数
    maxReconnectAttempts: 10,
    // 心跳间隔（毫秒）
    pingInterval: 30000,
    // 消息超时时间（毫秒）
    messageTimeout: 10000
  },
  
  // 反调试配置
  antiDebug: {
    // 是否启用反调试措施
    enabled: isProd,
    // 是否使用激进模式
    aggressiveMode: false,
    // 检测间隔（毫秒）
    checkInterval: 1000,
    // 检测到调试时的回调
    onDetected: 'reload' // 'warn', 'reload', 'block'
  },
  
  // 完整性检查配置
  integrity: {
    // 是否启用完整性检查
    enabled: isProd,
    // 检查间隔（毫秒）
    checkInterval: 5 * 60 * 1000, // 5分钟
    // 关键文件列表
    criticalFiles: [
      'main.js',
      'vendor.js',
      'app.js',
      'crypto.wasm'
    ]
  }
};

// 游戏配置
const GAME_CONFIG = {
  // 游戏版本
  version: '1.0.0',
  
  // 游戏更新检查间隔（毫秒）
  updateCheckInterval: 10 * 60 * 1000, // 10分钟
  
  // 战斗相关配置
  battle: {
    // 战斗数据同步间隔（毫秒）
    syncInterval: 100,
    // 是否使用预测
    usePrediction: true,
    // 预测回滚阈值（毫秒）
    rollbackThreshold: 200
  },
  
  // 资源相关配置
  resources: {
    // 预加载资源
    preload: true,
    // 资源加载超时（毫秒）
    loadTimeout: 30000,
    // 资源缓存策略
    cacheStrategy: 'auto' // 'auto', 'network-first', 'cache-first'
  },
  
  // 性能配置
  performance: {
    // 目标帧率
    targetFPS: 60,
    // 是否自动调整质量
    autoAdjustQuality: true,
    // 质量预设
    qualityPresets: {
      low: {
        particles: false,
        shadows: false,
        antialiasing: false,
        textureQuality: 'low'
      },
      medium: {
        particles: true,
        shadows: false,
        antialiasing: true,
        textureQuality: 'medium'
      },
      high: {
        particles: true,
        shadows: true,
        antialiasing: true,
        textureQuality: 'high'
      }
    }
  }
};

// UI配置
const UI_CONFIG = {
  // 主题
  theme: 'dark', // 'dark', 'light', 'auto'
  
  // 动画配置
  animations: {
    // 是否启用动画
    enabled: true,
    // 过渡持续时间（毫秒）
    transitionDuration: 300
  },
  
  // 通知配置
  notifications: {
    // 默认持续时间（毫秒）
    duration: 5000,
    // 最大通知数量
    maxCount: 5,
    // 通知位置
    position: 'top-right' // 'top-right', 'top-left', 'bottom-right', 'bottom-left'
  },
  
  // 国际化配置
  i18n: {
    // 默认语言
    defaultLocale: 'zh-CN',
    // 可用语言
    availableLocales: ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']
  },
  
  // 响应式断点
  breakpoints: {
    xs: 0,
    sm: 576,
    md: 768,
    lg: 992,
    xl: 1200,
    xxl: 1600
  }
};

// 聊天配置
const CHAT_CONFIG = {
  // 最大消息历史记录数
  maxHistoryCount: 100,
  // 消息过滤器
  filters: {
    // 敏感词过滤
    profanityFilter: true,
    // 垃圾信息过滤
    spamFilter: true
  },
  // 频道配置
  channels: {
    // 默认频道
    defaultChannel: 'world',
    // 可用频道
    availableChannels: [
      { id: 'world', name: '世界', color: '#3498db' },
      { id: 'guild', name: '公会', color: '#27ae60' },
      { id: 'team', name: '队伍', color: '#f39c12' },
      { id: 'private', name: '私聊', color: '#9b59b6' }
    ]
  }
};

// 第三方服务配置
const THIRD_PARTY_CONFIG = {
  // 分析服务
  analytics: {
    // 是否启用
    enabled: isProd,
    // 提供商
    provider: 'google-analytics',
    // 跟踪ID
    trackingId: 'UA-XXXXXXXX-X'
  },
  
  // 崩溃报告
  crashReporting: {
    // 是否启用
    enabled: isProd,
    // 提供商
    provider: 'sentry',
    // DSN
    dsn: 'https://xxxxx@sentry.io/xxxxx'
  },
  
  // 支付服务
  payment: {
    // 默认支付方式
    defaultMethod: 'alipay',
    // 可用支付方式
    availableMethods: ['alipay', 'wechat', 'card']
  }
};

// 导出所有配置
export default {
  ENV,
  isProd,
  isDev,
  isTest,
  API_BASE_URL,
  WS_BASE_URL,
  ASSETS_URL,
  WASM_PATH,
  SECURITY_CONFIG,
  GAME_CONFIG,
  UI_CONFIG,
  CHAT_CONFIG,
  THIRD_PARTY_CONFIG
}; 