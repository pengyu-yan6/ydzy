const mongoose = require('mongoose');
const config = require('../config/security.config');
const logger = require('../utils/logger');
const Redis = require('ioredis');

// 是否使用Redis存储异常检测数据
const useRedisCache = process.env.USE_REDIS_ANTICHEAT === 'true';

// Redis客户端实例
let redisClient;
if (useRedisCache) {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_ANTICHEAT_DB || '1', 10),
  });
}

// 异常行为模型
let AnomalyRecord;
try {
  AnomalyRecord = mongoose.model('AnomalyRecord');
} catch (e) {
  // 模型不存在，创建
  const anomalyRecordSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      required: true,
      enum: ['damage', 'speed', 'resource_gain', 'client_tampering', 'position', 'packet']
    },
    value: {
      type: Number,
      required: true
    },
    expectedValue: {
      type: Number
    },
    deviationFactor: {
      type: Number
    },
    metadata: {
      type: Object,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['detected', 'verified', 'false_positive', 'action_taken'],
      default: 'detected'
    },
    actionTaken: {
      type: String,
      enum: ['none', 'warning', 'temporary_ban', 'permanent_ban'],
      default: 'none'
    }
  }, { timestamps: true });
  
  anomalyRecordSchema.index({ userId: 1, type: 1, timestamp: -1 });
  anomalyRecordSchema.index({ status: 1 });
  
  AnomalyRecord = mongoose.model('AnomalyRecord', anomalyRecordSchema);
}

/**
 * 防作弊系统
 */
class AntiCheat {
  /**
   * 检查战斗数据异常
   * @param {String} userId - 用户ID
   * @param {String} battleId - 战斗ID
   * @param {String} type - 异常类型
   * @param {Number} actualValue - 实际值
   * @param {Number} expectedValue - 预期值
   * @param {Object} metadata - 额外数据
   * @returns {Promise<Boolean>} - 是否检测到异常
   */
  static async checkBattleAnomaly(userId, battleId, type, actualValue, expectedValue, metadata = {}) {
    if (!config.antiCheat.enabled) {
      return false;
    }
    
    const { maxDamageDeviationFactor, maxSpeedAnomalyFactor } = config.antiCheat.battleAnomalyThresholds;
    
    // 根据类型确定偏差阈值
    let thresholdFactor;
    switch (type) {
      case 'damage':
        thresholdFactor = maxDamageDeviationFactor;
        break;
      case 'speed':
        thresholdFactor = maxSpeedAnomalyFactor;
        break;
      default:
        thresholdFactor = 1.2; // 默认偏差阈值
    }
    
    // 计算偏差系数
    const deviationFactor = actualValue / expectedValue;
    
    // 判断是否异常
    const isAnomaly = deviationFactor > thresholdFactor;
    
    if (isAnomaly) {
      // 记录异常
      await this.recordAnomaly(userId, type, actualValue, expectedValue, deviationFactor, {
        ...metadata,
        battleId
      });
      
      // 检查是否达到异常触发阈值
      const isActionRequired = await this.checkAnomalyThreshold(userId, type);
      
      if (isActionRequired) {
        // 触发惩罚措施
        await this.takeAction(userId, type, battleId);
      }
      
      logger.warn(`检测到战斗异常`, {
        userId,
        battleId,
        type,
        actualValue,
        expectedValue,
        deviationFactor,
        isActionRequired
      });
    }
    
    return isAnomaly;
  }
  
  /**
   * 检查资源获取异常
   * @param {String} userId - 用户ID
   * @param {String} resourceType - 资源类型
   * @param {Number} amount - 资源数量
   * @param {String} source - 资源来源
   * @returns {Promise<Boolean>} - 是否检测到异常
   */
  static async checkResourceAnomaly(userId, resourceType, amount, source) {
    if (!config.antiCheat.enabled) {
      return false;
    }
    
    const { maxResourceGainRate, windowHours } = config.antiCheat.resourceAnomalyThresholds;
    
    // 计算时间窗口
    const windowStartTime = new Date();
    windowStartTime.setHours(windowStartTime.getHours() - windowHours);
    
    // 查询该时间窗口内该用户该资源类型的获取总量
    let totalResourceInWindow;
    
    if (useRedisCache) {
      // 使用Redis计算
      const key = `resource:${userId}:${resourceType}:${windowHours}h`;
      const now = Date.now();
      const windowStartMs = now - (windowHours * 60 * 60 * 1000);
      
      // 添加新获取记录
      await redisClient.zadd(key, now, `${now}:${amount}`);
      
      // 移除窗口外的旧数据
      await redisClient.zremrangebyscore(key, 0, windowStartMs);
      
      // 获取窗口内的所有资源获取记录
      const records = await redisClient.zrange(key, 0, -1, 'WITHSCORES');
      
      // 计算总量
      totalResourceInWindow = 0;
      for (let i = 0; i < records.length; i += 2) {
        const [timeAmount] = records[i].split(':');
        totalResourceInWindow += parseInt(timeAmount, 10);
      }
      
      // 设置过期时间
      await redisClient.expire(key, windowHours * 60 * 60);
    } else {
      // 使用数据库查询
      const resourceRecords = await mongoose.model('ResourceTransaction').find({
        userId,
        resourceType,
        timestamp: { $gte: windowStartTime },
        type: 'gain'
      });
      
      totalResourceInWindow = resourceRecords.reduce((total, record) => total + record.amount, 0);
    }
    
    // 获取该用户的资源获取基线（根据等级、游戏进度等）
    const userBaseline = await this.getUserResourceBaseline(userId, resourceType);
    
    // 计算异常阈值
    const anomalyThreshold = userBaseline * maxResourceGainRate * windowHours;
    
    // 判断是否异常
    const isAnomaly = totalResourceInWindow + amount > anomalyThreshold;
    
    if (isAnomaly) {
      // 记录异常
      await this.recordAnomaly(userId, 'resource_gain', amount, userBaseline, 
        (totalResourceInWindow + amount) / (userBaseline * windowHours), {
          resourceType,
          source,
          windowHours,
          totalInWindow: totalResourceInWindow
        });
      
      // 检查是否达到异常触发阈值
      const isActionRequired = await this.checkAnomalyThreshold(userId, 'resource_gain');
      
      if (isActionRequired) {
        // 触发惩罚措施
        await this.takeAction(userId, 'resource_gain');
      }
      
      logger.warn(`检测到资源获取异常`, {
        userId,
        resourceType,
        amount,
        source,
        totalResourceInWindow,
        anomalyThreshold,
        isActionRequired
      });
    }
    
    return isAnomaly;
  }
  
  /**
   * 检查客户端完整性
   * @param {String} userId - 用户ID
   * @param {Object} clientData - 客户端数据
   * @returns {Promise<Boolean>} - 是否检测到异常
   */
  static async checkClientIntegrity(userId, clientData) {
    if (!config.antiCheat.enabled) {
      return false;
    }
    
    const { checksums, clientVersion, deviceInfo } = clientData;
    
    // 验证客户端版本
    if (config.integrityProtection.tamperProtection.validateClientVersion) {
      const isValidVersion = await this.validateClientVersion(clientVersion);
      if (!isValidVersion) {
        await this.recordAnomaly(userId, 'client_tampering', 1, 0, 1, {
          reason: 'invalid_client_version',
          clientVersion
        });
        
        logger.warn(`检测到客户端版本异常`, {
          userId,
          clientVersion
        });
        
        return true;
      }
    }
    
    // 验证客户端文件完整性
    if (config.integrityProtection.tamperProtection.checkDataIntegrity && checksums) {
      const integrityResult = await this.validateClientIntegrity(checksums);
      if (!integrityResult.valid) {
        await this.recordAnomaly(userId, 'client_tampering', 1, 0, 1, {
          reason: 'file_integrity_violation',
          tamperedFiles: integrityResult.tamperedFiles
        });
        
        logger.warn(`检测到客户端文件篡改`, {
          userId,
          tamperedFiles: integrityResult.tamperedFiles
        });
        
        return true;
      }
    }
    
    // 其他客户端环境检查（例如检测模拟器、root设备等）
    if (deviceInfo) {
      const environmentResult = await this.checkEnvironment(deviceInfo);
      if (!environmentResult.safe) {
        await this.recordAnomaly(userId, 'client_tampering', 1, 0, 1, {
          reason: 'unsafe_environment',
          details: environmentResult.details
        });
        
        logger.warn(`检测到不安全的客户端环境`, {
          userId,
          details: environmentResult.details
        });
        
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 记录异常
   * @param {String} userId - 用户ID
   * @param {String} type - 异常类型
   * @param {Number} value - 实际值
   * @param {Number} expectedValue - 预期值
   * @param {Number} deviationFactor - 偏差系数
   * @param {Object} metadata - 额外数据
   */
  static async recordAnomaly(userId, type, value, expectedValue, deviationFactor, metadata = {}) {
    // 创建异常记录
    const anomalyRecord = new AnomalyRecord({
      userId,
      type,
      value,
      expectedValue,
      deviationFactor,
      metadata,
      timestamp: new Date()
    });
    
    await anomalyRecord.save();
    
    // 如果使用Redis，同时更新缓存计数
    if (useRedisCache) {
      const key = `anomaly:${userId}:${type}`;
      await redisClient.incr(key);
      await redisClient.expire(key, config.antiCheat.battleAnomalyThresholds.anomalyResetHours * 60 * 60);
    }
  }
  
  /**
   * 检查异常是否达到触发阈值
   * @param {String} userId - 用户ID
   * @param {String} type - 异常类型
   * @returns {Promise<Boolean>} - 是否达到阈值
   */
  static async checkAnomalyThreshold(userId, type) {
    const { triggerThreshold, anomalyResetHours } = config.antiCheat.battleAnomalyThresholds;
    
    // 计算时间窗口
    const windowStartTime = new Date();
    windowStartTime.setHours(windowStartTime.getHours() - anomalyResetHours);
    
    // 获取时间窗口内的异常次数
    let anomalyCount;
    
    if (useRedisCache) {
      // 从Redis获取计数
      const key = `anomaly:${userId}:${type}`;
      const count = await redisClient.get(key);
      anomalyCount = parseInt(count || '0', 10);
    } else {
      // 从数据库查询
      anomalyCount = await AnomalyRecord.countDocuments({
        userId,
        type,
        timestamp: { $gte: windowStartTime }
      });
    }
    
    return anomalyCount >= triggerThreshold;
  }
  
  /**
   * 获取用户资源基线
   * @param {String} userId - 用户ID
   * @param {String} resourceType - 资源类型
   * @returns {Promise<Number>} - 用户资源基线（每小时正常获取量）
   */
  static async getUserResourceBaseline(userId, resourceType) {
    // 获取用户资料
    const user = await mongoose.model('User').findById(userId);
    
    if (!user) {
      return 1000; // 默认基线
    }
    
    // 根据用户等级和游戏进度计算基线
    const userLevel = user.level || 1;
    const vipLevel = user.vipLevel || 0;
    
    let baseAmount;
    
    switch (resourceType) {
      case 'gold':
        baseAmount = 1000 + (userLevel * 100) + (vipLevel * 200);
        break;
      case 'gem':
        baseAmount = 50 + (userLevel * 5) + (vipLevel * 20);
        break;
      case 'energy':
        baseAmount = 120 + (userLevel * 10) + (vipLevel * 30);
        break;
      case 'experience':
        baseAmount = 500 + (userLevel * 50);
        break;
      default:
        baseAmount = 500 + (userLevel * 50);
    }
    
    return baseAmount;
  }
  
  /**
   * 验证客户端版本
   * @param {String} clientVersion - 客户端版本
   * @returns {Promise<Boolean>} - 版本是否有效
   */
  static async validateClientVersion(clientVersion) {
    // 从数据库或缓存中获取有效的客户端版本列表
    const validVersions = await this.getValidClientVersions();
    
    return validVersions.includes(clientVersion);
  }
  
  /**
   * 获取有效的客户端版本列表
   * @returns {Promise<Array>} - 有效版本列表
   */
  static async getValidClientVersions() {
    // 实际应用中应该从数据库或配置中读取
    return ['1.0.0', '1.0.1', '1.0.2', '1.1.0'];
  }
  
  /**
   * 验证客户端文件完整性
   * @param {Object} checksums - 文件校验和
   * @returns {Promise<Object>} - 验证结果
   */
  static async validateClientIntegrity(checksums) {
    // 从数据库获取预期的文件校验和
    const expectedChecksums = await this.getExpectedChecksums();
    
    if (!checksums || typeof checksums !== 'object') {
      return {
        valid: false,
        reason: 'invalid_checksums_format',
        tamperedFiles: []
      };
    }
    
    const tamperedFiles = [];
    const missingFiles = [];
    const unexpectedFiles = [];
    
    // 检查预期文件是否被篡改
    for (const [filename, expectedChecksum] of Object.entries(expectedChecksums)) {
      if (!checksums[filename]) {
        // 缺少必要文件
        missingFiles.push(filename);
      } else if (checksums[filename] !== expectedChecksum) {
        // 文件被篡改
        tamperedFiles.push(filename);
      }
    }
    
    // 检查是否有预期之外的文件（可能是注入的恶意代码）
    const expectedFilenames = new Set(Object.keys(expectedChecksums));
    for (const filename of Object.keys(checksums)) {
      if (!expectedFilenames.has(filename) && !this.isWhitelistedFile(filename)) {
        unexpectedFiles.push(filename);
      }
    }
    
    // 收集所有问题
    const allIssues = [...tamperedFiles, ...missingFiles, ...unexpectedFiles];
    
    return {
      valid: allIssues.length === 0,
      reason: allIssues.length > 0 ? 'integrity_violation' : null,
      tamperedFiles,
      missingFiles,
      unexpectedFiles
    };
  }
  
  /**
   * 检查文件是否在白名单中
   * @param {String} filename - 文件名
   * @returns {Boolean} - 是否在白名单中
   */
  static isWhitelistedFile(filename) {
    // 某些文件可能是动态生成的，不需要验证
    const whitelistPatterns = [
      /^cache\/.*$/,
      /^logs\/.*\.log$/,
      /^temp\/.*$/,
      /^\.meta$/
    ];
    
    return whitelistPatterns.some(pattern => pattern.test(filename));
  }
  
  /**
   * 获取预期的文件校验和
   * @returns {Promise<Object>} - 预期的校验和
   */
  static async getExpectedChecksums() {
    try {
      // 从数据库或缓存中获取最新的校验和列表
      const clientVersion = await this.getCurrentClientVersion();
      
      const checksumRecord = await mongoose.model('ClientChecksum').findOne({
        version: clientVersion,
        platform: 'default' // 可以根据不同平台有不同的校验和
      });
      
      if (checksumRecord && checksumRecord.checksums) {
        return checksumRecord.checksums;
      }
      
      // 如果数据库中没有记录，则返回默认校验和（仅开发环境使用）
      logger.warn('未找到当前客户端版本的校验和记录，使用默认值');
      
      if (process.env.NODE_ENV === 'production') {
        // 生产环境下应强制要求有有效的校验和记录
        throw new Error('生产环境缺少校验和配置');
      }
      
      // 开发环境下的默认校验和
      return {
        'game.js': 'ab123def456',
        'battle.js': 'cd456efg789',
        'main.bundle.js': 'ef789ghi012'
      };
    } catch (error) {
      logger.error('获取客户端校验和失败', {
        error: error.message
      });
      
      // 发生错误时，根据环境返回不同结果
      if (process.env.NODE_ENV === 'production') {
        // 生产环境下出错应该强制要求完整性验证
        throw error;
      }
      
      // 开发环境返回默认值
      return {
        'game.js': 'ab123def456',
        'battle.js': 'cd456efg789',
        'main.bundle.js': 'ef789ghi012'
      };
    }
  }
  
  /**
   * 获取当前客户端版本
   * @returns {Promise<String>} - 当前客户端版本
   */
  static async getCurrentClientVersion() {
    try {
      const versionConfig = await mongoose.model('SystemConfig').findOne({
        key: 'client_version'
      });
      
      return versionConfig ? versionConfig.value : '1.0.0';
    } catch (error) {
      logger.error('获取客户端版本失败', {
        error: error.message
      });
      return '1.0.0';
    }
  }
  
  /**
   * 检查设备环境
   * @param {Object} deviceInfo - 设备信息
   * @returns {Promise<Object>} - 检查结果
   */
  static async checkEnvironment(deviceInfo) {
    // 检查是否为模拟器
    const isEmulator = this.detectEmulator(deviceInfo);
    
    // 检查是否为Root设备（安卓）或越狱设备（iOS）
    const isRooted = this.detectRootedDevice(deviceInfo);
    
    // 检查是否有调试工具
    const hasDebugTools = this.detectDebugTools(deviceInfo);
    
    return {
      safe: !isEmulator && !isRooted && !hasDebugTools,
      details: {
        isEmulator,
        isRooted,
        hasDebugTools
      }
    };
  }
  
  /**
   * 检测模拟器
   * @param {Object} deviceInfo - 设备信息
   * @returns {Boolean} - 是否为模拟器
   */
  static detectEmulator(deviceInfo) {
    // 实际应用中应该检查设备信息的各种特征
    const { brand, model, hardware } = deviceInfo;
    
    const emulatorMarkers = [
      'generic', 'android_sdk', 'emulator', 'sdk', 'simulator', 'bluestacks', 'nox', 'memu'
    ];
    
    return emulatorMarkers.some(marker => 
      (brand && brand.toLowerCase().includes(marker)) ||
      (model && model.toLowerCase().includes(marker)) ||
      (hardware && hardware.toLowerCase().includes(marker))
    );
  }
  
  /**
   * 检测Root设备
   * @param {Object} deviceInfo - 设备信息
   * @returns {Boolean} - 是否为Root设备
   */
  static detectRootedDevice(deviceInfo) {
    // 实际应用中应该检查设备的Root或越狱特征
    return deviceInfo.isRooted === true;
  }
  
  /**
   * 检测调试工具
   * @param {Object} deviceInfo - 设备信息
   * @returns {Boolean} - 是否存在调试工具
   */
  static detectDebugTools(deviceInfo) {
    // 实际应用中应该检查是否有调试工具在运行
    return deviceInfo.debugToolsDetected === true;
  }
  
  /**
   * 根据异常情况采取措施
   * @param {String} userId - 用户ID
   * @param {String} type - 异常类型
   * @param {String} relatedId - 相关ID（如战斗ID）
   */
  static async takeAction(userId, type, relatedId = null) {
    // 获取该用户此类型异常的历史记录
    const pastAnomalies = await AnomalyRecord.find({
      userId,
      type,
      actionTaken: { $ne: 'none' }
    }).sort({ timestamp: -1 });
    
    // 根据历史记录决定措施
    let actionToTake = 'warning';
    
    if (pastAnomalies.length >= 3) {
      actionToTake = 'permanent_ban';
    } else if (pastAnomalies.length >= 1) {
      actionToTake = 'temporary_ban';
    }
    
    // 更新最新异常记录的措施
    await AnomalyRecord.updateMany(
      {
        userId,
        type,
        status: 'detected',
        actionTaken: 'none'
      },
      {
        $set: {
          status: 'action_taken',
          actionTaken
        }
      }
    );
    
    // 执行相应措施
    switch (actionToTake) {
      case 'warning':
        await this.sendWarning(userId, type);
        break;
      case 'temporary_ban':
        await this.temporaryBanUser(userId, type);
        break;
      case 'permanent_ban':
        await this.permanentBanUser(userId, type);
        break;
    }
    
    logger.warn(`对用户采取反作弊措施`, {
      userId,
      type,
      action: actionToTake,
      relatedId
    });
  }
  
  /**
   * 发送警告
   * @param {String} userId - 用户ID
   * @param {String} type - 异常类型
   */
  static async sendWarning(userId, type) {
    // 获取用户信息
    const user = await mongoose.model('User').findById(userId);
    
    if (!user) {
      logger.error(`无法向不存在的用户发送警告: ${userId}`);
      return;
    }
    
    // 创建警告通知
    const warningMessage = this.getWarningMessage(type);
    
    await mongoose.model('Notification').create({
      userId,
      title: '游戏规则警告',
      content: warningMessage,
      type: 'system_warning',
      isRead: false,
      createdAt: new Date()
    });
    
    logger.info(`向用户 ${userId} 发送了警告`, {
      type,
      message: warningMessage
    });
  }
  
  /**
   * 临时封禁用户
   * @param {String} userId - 用户ID
   * @param {String} type - 异常类型
   */
  static async temporaryBanUser(userId, type) {
    // 计算封禁结束时间（例如24小时）
    const banEndTime = new Date();
    banEndTime.setHours(banEndTime.getHours() + 24);
    
    // 更新用户状态
    await mongoose.model('User').findByIdAndUpdate(userId, {
      status: 'banned',
      banReason: `检测到异常行为: ${type}`,
      banEndTime
    });
    
    // 记录封禁操作
    await mongoose.model('AdminLog').create({
      action: 'user_ban',
      targetId: userId,
      targetType: 'user',
      details: {
        reason: `检测到异常行为: ${type}`,
        duration: '24h',
        automatic: true
      },
      performedAt: new Date()
    });
    
    logger.warn(`临时封禁用户 ${userId}`, {
      type,
      duration: '24h'
    });
  }
  
  /**
   * 永久封禁用户
   * @param {String} userId - 用户ID
   * @param {String} type - 异常类型
   */
  static async permanentBanUser(userId, type) {
    // 更新用户状态
    await mongoose.model('User').findByIdAndUpdate(userId, {
      status: 'banned',
      banReason: `多次检测到异常行为: ${type}`,
      banEndTime: null // 永久封禁
    });
    
    // 记录封禁操作
    await mongoose.model('AdminLog').create({
      action: 'user_ban',
      targetId: userId,
      targetType: 'user',
      details: {
        reason: `多次检测到异常行为: ${type}`,
        duration: 'permanent',
        automatic: true
      },
      performedAt: new Date()
    });
    
    logger.warn(`永久封禁用户 ${userId}`, {
      type
    });
  }
  
  /**
   * 根据异常类型获取警告消息
   * @param {String} type - 异常类型
   * @returns {String} - 警告消息
   */
  static getWarningMessage(type) {
    switch (type) {
      case 'damage':
        return '系统检测到您的战斗数据存在异常。请确保您未使用任何第三方软件或修改游戏数据，否则可能导致账号被封禁。';
      case 'speed':
        return '系统检测到您的游戏速度存在异常。请确保您未使用任何加速器或修改游戏速度的工具，否则可能导致账号被封禁。';
      case 'resource_gain':
        return '系统检测到您的资源获取速度异常。请确保您通过正常游戏方式获取游戏资源，否则可能导致账号被封禁。';
      case 'client_tampering':
        return '系统检测到您的游戏客户端可能被修改。请使用官方版本的游戏客户端，否则可能导致账号被封禁。';
      default:
        return '系统检测到您的游戏行为存在异常。请遵守游戏规则，否则可能导致账号被封禁。';
    }
  }
  
  /**
   * 创建Express中间件，用于验证客户端完整性
   * @returns {Function} Express中间件
   */
  static createIntegrityCheckMiddleware() {
    return async (req, res, next) => {
      try {
        // 只对需要验证的路径进行检查
        if (!req.path.startsWith('/api/game/') && !req.path.startsWith('/api/payment/')) {
          return next();
        }
        
        // 获取用户ID
        const userId = req.user?.id;
        if (!userId) {
          return next();
        }
        
        // 获取客户端完整性数据
        const clientIntegrityData = req.headers['x-client-integrity'];
        
        if (!clientIntegrityData) {
          // 完整性数据缺失
          if (config.integrityProtection.tamperProtection.checkDataIntegrity) {
            return res.status(403).json({
              success: false,
              message: '缺少客户端完整性验证数据',
              error: 'INTEGRITY_CHECK_REQUIRED'
            });
          }
          
          return next();
        }
        
        try {
          // 解析客户端数据
          const integrityInfo = JSON.parse(clientIntegrityData);
          
          // 验证客户端完整性
          const isAnomalous = await this.checkClientIntegrity(userId, integrityInfo);
          
          if (isAnomalous) {
            return res.status(403).json({
              success: false,
              message: '检测到客户端异常',
              error: 'CLIENT_INTEGRITY_VIOLATION'
            });
          }
        } catch (e) {
          logger.error(`客户端完整性数据解析错误`, {
            userId,
            error: e.message
          });
          
          if (config.integrityProtection.tamperProtection.checkDataIntegrity) {
            return res.status(403).json({
              success: false,
              message: '客户端完整性数据无效',
              error: 'INVALID_INTEGRITY_DATA'
            });
          }
        }
        
        next();
      } catch (error) {
        logger.error(`完整性检查中间件错误: ${error.message}`);
        next();
      }
    };
  }
}

module.exports = AntiCheat; 