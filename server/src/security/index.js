/**
 * 游戏安全系统主模块
 * 整合所有安全相关组件
 */
const SignatureVerifier = require('./signatureVerifier');
const DDoSProtection = require('./ddosProtection');
const TwoFactorAuth = require('./twoFactorAuth');
const AntiCheat = require('./antiCheat');
const dbEncryption = require('./dbEncryption');        // 新增: 数据库加密
const auditLog = require('./auditLogEnhanced');       // 新增: 增强版审计日志
const paymentSignature = require('./paymentSignature'); // 新增: 支付签名验证
const rbac = require('./rbac');                       // 新增: 基于角色的访问控制
const config = require('../config/security.config');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

// 新增: 导入中间件
const rateLimit = require('../middlewares/rateLimit.middleware');
const sensitiveLogger = require('../middlewares/sensitiveLogger.middleware');
const dynamicRouteManager = require('../middlewares/dynamicRoute.middleware');

/**
 * 游戏安全系统
 */
class GameSecurity {
  /**
   * 初始化安全系统
   * @param {Object} app - Express应用实例
   */
  static init(app) {
    logger.info('初始化游戏安全系统...');
    
    // 记录安全系统启动
    try {
      auditLog.log({
        action: 'SECURITY_SYSTEM_INIT',
        resource: 'security',
        category: 'SYSTEM',
        severity: 'HIGH',
        status: 'SUCCESS',
        metadata: {
          modules: ['SignatureVerifier', 'DDoSProtection', 'TwoFactorAuth', 'AntiCheat', 
                    'dbEncryption', 'auditLog', 'paymentSignature', 'rbac', 
                    'rateLimit', 'sensitiveLogger', 'dynamicRouteManager'],
          timestamp: Date.now()
        }
      }).catch(err => {
        logger.error('记录安全系统启动日志失败', { error: err.message });
      });
    } catch (err) {
      logger.warn('记录安全系统启动日志失败', { error: err.message });
    }
    
    // 注册DDoS防护中间件
    if (config.ddos.enabled) {
      const ddosMiddleware = DDoSProtection.createMiddleware();
      app.use(ddosMiddleware);
      logger.info('DDoS防护已启用');
    }
    
    // 注册全局请求频率限制中间件
    if (config.rateLimit?.global) {
      app.use(rateLimit.createRateLimitMiddleware({
        windowMs: config.rateLimit.global.windowMs,
        maxRequests: config.rateLimit.global.maxRequests,
        message: '请求频率过高，请稍后再试'
      }));
      logger.info('全局请求频率限制已启用');
    }
    
    // 注册路由级请求限制中间件
    if (config.rateLimit) {
      // 登录限制
      app.use('/api/auth/login', rateLimit.createRateLimitMiddleware({
        windowMs: config.rateLimit.login.windowMs,
        maxRequests: config.rateLimit.login.maxRequests,
        message: config.rateLimit.login.message
      }));
      
      // 注册限制
      app.use('/api/auth/register', rateLimit.createRateLimitMiddleware({
        windowMs: config.rateLimit.register.windowMs,
        maxRequests: config.rateLimit.register.maxRequests,
        message: config.rateLimit.register.message
      }));
      
      // 支付限制
      app.use('/api/payment', rateLimit.createRateLimitMiddleware({
        windowMs: config.rateLimit.payment.windowMs,
        maxRequests: config.rateLimit.payment.maxRequests,
        message: config.rateLimit.payment.message
      }));
      
      // 战斗限制
      app.use('/api/game/battle', rateLimit.createRateLimitMiddleware({
        windowMs: config.rateLimit.battle.windowMs,
        maxRequests: config.rateLimit.battle.maxRequests,
        message: config.rateLimit.battle.message
      }));
      
      logger.info('路由级请求频率限制已启用');
    }
    
    // 注册签名验证中间件
    if (config.security.strictMode) {
      app.use(SignatureVerifier.createMiddleware({
        excludePaths: config.security.excludePaths
      }));
      logger.info('请求签名验证已启用（严格模式）');
    } else {
      // 仅对重要接口启用签名验证
      app.use('/api/payment', SignatureVerifier.createMiddleware({
        isRequired: true
      }));
      
      app.use('/api/game/battle', SignatureVerifier.createMiddleware({
        isRequired: true
      }));
      
      logger.info('请求签名验证已启用（部分接口）');
    }
    
    // 注册敏感操作日志中间件
    app.use(sensitiveLogger.sensitiveLogger);
    logger.info('敏感操作日志记录已启用');
    
    // 注册审计日志中间件
    if (config.security?.auditLog?.enabled) {
      app.use(auditLog.createMiddleware({
        ignorePaths: ['/health', '/metrics', '/favicon.ico']
      }));
      logger.info('审计日志系统已启用');
    }
    
    // 注册敏感操作二次验证中间件
    app.use(TwoFactorAuth.createMiddleware());
    logger.info('敏感操作二次验证已启用');
    
    // 注册客户端完整性验证中间件
    if (config.antiCheat.enabled && 
        config.integrityProtection.tamperProtection.checkDataIntegrity) {
      app.use(AntiCheat.createIntegrityCheckMiddleware());
      logger.info('客户端完整性验证已启用');
    }
    
    // 注册二次验证接口
    app.post('/api/auth/request-verification-code', 
      (req, res) => TwoFactorAuth.requestVerificationCode(req, res));
    
    // 注册动态路由中间件
    app.use('/api/dynamic', dynamicRouteManager.getMiddleware());
    logger.info('动态路由系统已启用');
    
    // 设置安全相关的HTTP头
    this.setupSecureHeaders(app);
    
    logger.info('游戏安全系统初始化完成');
  }
  
  /**
   * 设置安全相关的HTTP头
   * @param {Object} app - Express应用实例
   */
  static setupSecureHeaders(app) {
    app.use((req, res, next) => {
      // 防止点击劫持
      res.setHeader('X-Frame-Options', 'DENY');
      
      // 启用XSS过滤
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      // 禁止内容类型嗅探
      res.setHeader('X-Content-Type-Options', 'nosniff');
      
      // 内容安全策略
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline';");
      
      // 严格传输安全（如果使用HTTPS）
      if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
      
      // 隐藏服务器信息 - 新增
      res.setHeader('Server', 'GameServer');
      
      // 设置引荐来源政策 - 新增
      res.setHeader('Referrer-Policy', 'same-origin');
      
      // 添加允许嵌入框架源 - 新增
      res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
      
      next();
    });
  }
  
  /**
   * 验证战斗数据
   * @param {Object} battleData - 战斗数据
   * @param {String} userId - 用户ID
   * @returns {Promise<Object>} - 验证结果
   */
  static async validateBattleData(battleData, userId) {
    if (!config.antiCheat.enabled) {
      return { valid: true };
    }
    
    const anomalies = [];
    
    try {
      // 首先验证battleData的完整性
      if (!battleData || !battleData.battleId) {
        logger.warn('战斗数据结构不完整', { userId });
        
        // 记录安全审计日志 - 新增
        await auditLog.log({
          userId,
          action: 'BATTLE_DATA_VALIDATION_FAIL',
          resource: 'battle',
          category: 'SECURITY',
          severity: 'HIGH',
          status: 'ERROR',
          metadata: {
            reason: 'incomplete_data',
            battleData: battleData || {}
          }
        }).catch(err => logger.error('记录战斗数据验证失败日志出错', { error: err.message }));
        
        return { 
          valid: false, 
          anomalies: [{ type: 'invalid_data', details: { reason: 'incomplete_data' } }]
        };
      }
      
      // 验证战斗ID是否存在（防止伪造战斗ID）
      const battleExists = await this.verifyBattleExists(battleData.battleId, userId);
      if (!battleExists) {
        logger.warn('战斗ID无效', { userId, battleId: battleData.battleId });
        
        // 记录安全审计日志 - 新增
        await auditLog.log({
          userId,
          action: 'BATTLE_DATA_VALIDATION_FAIL',
          resource: 'battle',
          category: 'SECURITY',
          severity: 'HIGH',
          status: 'ERROR',
          metadata: {
            reason: 'invalid_battle_id',
            battleId: battleData.battleId
          }
        }).catch(err => logger.error('记录战斗数据验证失败日志出错', { error: err.message }));
        
        return { 
          valid: false, 
          anomalies: [{ type: 'invalid_data', details: { reason: 'invalid_battle_id' } }]
        };
      }
      
      // 验证伤害数值
      for (const attack of battleData.attacks || []) {
        const { damage, attackerId, targetId, skillId, timestamp } = attack;
        
        // 由服务器根据玩家角色属性、技能属性等计算期望伤害
        const serverCalculatedDamage = await this.calculateExpectedDamage(
          userId, 
          attackerId, 
          targetId, 
          skillId,
          battleData.battleId,
          timestamp
        );
        
        if (damage && serverCalculatedDamage) {
          const isAnomaly = await AntiCheat.checkBattleAnomaly(
            userId,
            battleData.battleId,
            'damage',
            damage,
            serverCalculatedDamage,
            { attackerId, targetId, skillId }
          );
          
          if (isAnomaly) {
            anomalies.push({
              type: 'damage',
              details: { 
                attackerId, 
                targetId, 
                damage, 
                expectedDamage: serverCalculatedDamage,
                deviation: Math.abs(damage - serverCalculatedDamage) / serverCalculatedDamage
              }
            });
          }
        }
      }
      
      // 验证移动速度
      for (const movement of battleData.movements || []) {
        const { speed, entityId, timestamp } = movement;
        
        // 由服务器计算角色的期望移动速度
        const serverCalculatedSpeed = await this.calculateExpectedSpeed(
          userId,
          entityId,
          battleData.battleId,
          timestamp
        );
        
        if (speed && serverCalculatedSpeed) {
          const isAnomaly = await AntiCheat.checkBattleAnomaly(
            userId,
            battleData.battleId,
            'speed',
            speed,
            serverCalculatedSpeed,
            { entityId }
          );
          
          if (isAnomaly) {
            anomalies.push({
              type: 'speed',
              details: { 
                entityId, 
                speed, 
                expectedSpeed: serverCalculatedSpeed,
                deviation: Math.abs(speed - serverCalculatedSpeed) / serverCalculatedSpeed
              }
            });
          }
        }
      }
      
      // 验证资源获取
      for (const resource of battleData.resources || []) {
        const { type, amount, source } = resource;
        
        // 验证资源获取是否合理（根据战斗内容计算期望资源）
        const expectedResourceAmount = await this.calculateExpectedResources(
          userId,
          type,
          battleData.battleId,
          source || 'battle'
        );
        
        if (type && amount > 0) {
          // 使用服务器计算的期望资源量与实际获取量比较
          const isResourceAnomaly = amount > expectedResourceAmount * 1.1;
          
          if (isResourceAnomaly) {
            const isAnomaly = await AntiCheat.checkResourceAnomaly(
              userId,
              type,
              amount,
              source || 'battle'
            );
            
            if (isAnomaly) {
              anomalies.push({
                type: 'resource_gain',
                details: { 
                  resourceType: type, 
                  amount, 
                  expectedAmount: expectedResourceAmount,
                  source
                }
              });
            }
          }
        }
      }
      
      // 如果发现异常，记录审计日志 - 新增
      if (anomalies.length > 0) {
        await auditLog.log({
          userId,
          action: 'BATTLE_ANOMALIES_DETECTED',
          resource: 'battle',
          category: 'SECURITY',
          severity: 'HIGH',
          status: 'WARNING',
          metadata: {
            battleId: battleData.battleId,
            anomalies
          }
        }).catch(err => logger.error('记录战斗异常日志出错', { error: err.message }));
      }
    } catch (error) {
      logger.error('战斗数据验证过程出错', {
        error: error.message,
        userId,
        battleId: battleData?.battleId
      });
      
      return {
        valid: false,
        anomalies: [{ type: 'validation_error', details: { error: error.message } }]
      };
    }
    
    return {
      valid: anomalies.length === 0,
      anomalies
    };
  }
  
  /**
   * 验证战斗是否存在
   * @private
   * @param {String} battleId - 战斗ID
   * @param {String} userId - 用户ID
   * @returns {Promise<boolean>} 战斗是否存在
   */
  static async verifyBattleExists(battleId, userId) {
    try {
      // 实际实现中，应该查询数据库验证战斗ID是否存在
      // 并且验证该用户是否有权限访问该战斗记录
      
      // 示例实现：
      const Battle = mongoose.model('Battle');
      const battle = await Battle.findOne({ 
        _id: battleId,
        $or: [
          { userId: userId },
          { participants: userId },
          { 'teamMembers.userId': userId }
        ]
      });
      
      return !!battle;
    } catch (error) {
      logger.error('验证战斗存在性失败', {
        error: error.message,
        battleId,
        userId
      });
      return false;
    }
  }
  
  /**
   * 计算期望伤害值
   * @private
   * @param {String} userId - 用户ID
   * @param {String} attackerId - 攻击者ID
   * @param {String} targetId - 目标ID
   * @param {String} skillId - 技能ID
   * @param {String} battleId - 战斗ID
   * @param {Number} timestamp - 时间戳
   * @returns {Promise<Number>} 期望伤害值
   */
  static async calculateExpectedDamage(userId, attackerId, targetId, skillId, battleId, timestamp) {
    try {
      // 获取攻击者属性
      const attackerAttributes = await this.getEntityAttributes(attackerId, battleId);
      
      // 获取目标属性
      const targetAttributes = await this.getEntityAttributes(targetId, battleId);
      
      // 获取技能属性
      const skillAttributes = await this.getSkillAttributes(skillId);
      
      // 获取战斗中的所有效果（增益/减益）
      const effects = await this.getActiveEffects(attackerId, targetId, battleId, timestamp);
      
      // 计算基础伤害
      let baseDamage = attackerAttributes.attack * skillAttributes.damageRate;
      
      // 应用效果修正
      for (const effect of effects) {
        if (effect.target === attackerId && effect.type === 'damage_boost') {
          baseDamage *= (1 + effect.value);
        }
        if (effect.target === targetId && effect.type === 'damage_reduction') {
          baseDamage *= (1 - effect.value);
        }
      }
      
      // 应用防御计算
      const defenseReduction = targetAttributes.defense / (targetAttributes.defense + 100);
      const finalDamage = baseDamage * (1 - defenseReduction);
      
      // 应用随机波动（通常服务器会添加一定的随机波动）
      const minDamage = finalDamage * 0.9;
      const maxDamage = finalDamage * 1.1;
      
      return { min: minDamage, max: maxDamage, base: finalDamage };
    } catch (error) {
      logger.error('计算期望伤害失败', {
        error: error.message,
        attackerId,
        targetId,
        skillId
      });
      return null;
    }
  }
  
  /**
   * 计算期望移动速度
   * @private
   * @param {String} userId - 用户ID
   * @param {String} entityId - 实体ID
   * @param {String} battleId - 战斗ID
   * @param {Number} timestamp - 时间戳
   * @returns {Promise<Number>} 期望移动速度
   */
  static async calculateExpectedSpeed(userId, entityId, battleId, timestamp) {
    try {
      // 获取实体属性
      const entityAttributes = await this.getEntityAttributes(entityId, battleId);
      
      // 获取活动效果
      const effects = await this.getActiveEffects(entityId, null, battleId, timestamp);
      
      // 基础速度
      let baseSpeed = entityAttributes.speed;
      
      // 应用效果修正
      for (const effect of effects) {
        if (effect.target === entityId && effect.type === 'speed_boost') {
          baseSpeed *= (1 + effect.value);
        }
        if (effect.target === entityId && effect.type === 'speed_reduction') {
          baseSpeed *= (1 - effect.value);
        }
      }
      
      return baseSpeed;
    } catch (error) {
      logger.error('计算期望移动速度失败', {
        error: error.message,
        entityId,
        battleId
      });
      return null;
    }
  }
  
  /**
   * 计算期望资源获取量
   * @private
   * @param {String} userId - 用户ID
   * @param {String} resourceType - 资源类型
   * @param {String} battleId - 战斗ID
   * @param {String} source - 来源
   * @returns {Promise<Number>} 期望资源获取量
   */
  static async calculateExpectedResources(userId, resourceType, battleId, source) {
    try {
      // 根据战斗信息查询应该获得的资源量
      // 此处应查询数据库，获取战斗配置和奖励规则
      
      // 示例实现
      const Battle = mongoose.model('Battle');
      const battle = await Battle.findById(battleId).populate('rewardRules');
      
      if (!battle) {
        return 0;
      }
      
      // 查找对应资源类型的奖励规则
      const rewardRule = battle.rewardRules.find(rule => rule.resourceType === resourceType);
      
      if (!rewardRule) {
        return 0;
      }
      
      // 根据来源计算期望值
      let expectedAmount;
      switch (source) {
        case 'kill':
          expectedAmount = rewardRule.killReward;
          break;
        case 'victory':
          expectedAmount = rewardRule.victoryReward;
          break;
        case 'participation':
          expectedAmount = rewardRule.participationReward;
          break;
        default:
          expectedAmount = rewardRule.baseReward;
      }
      
      return expectedAmount;
    } catch (error) {
      logger.error('计算期望资源获取量失败', {
        error: error.message,
        userId,
        resourceType,
        battleId,
        source
      });
      return 0;
    }
  }
  
  /**
   * 获取实体属性
   * @private
   * @param {String} entityId - 实体ID
   * @param {String} battleId - 战斗ID
   * @returns {Promise<Object>} 实体属性
   */
  static async getEntityAttributes(entityId, battleId) {
    try {
      // 在实际实现中，应该查询数据库获取实体的当前属性
      // 包括基础属性和装备、技能、状态效果等加成
      
      // 示例实现
      const Character = mongoose.model('Character');
      const character = await Character.findById(entityId)
        .populate('equipment')
        .populate('stats');
      
      if (!character) {
        // 如果不是角色，可能是NPC或怪物
        const NPC = mongoose.model('NPC');
        const npc = await NPC.findById(entityId);
        
        if (npc) {
          return {
            attack: npc.attack,
            defense: npc.defense,
            speed: npc.speed,
            // 其他属性...
          };
        }
        
        return null;
      }
      
      // 计算角色的最终属性
      const finalStats = { ...character.stats };
      
      // 应用装备加成
      for (const equip of character.equipment) {
        finalStats.attack += equip.attackBonus || 0;
        finalStats.defense += equip.defenseBonus || 0;
        finalStats.speed += equip.speedBonus || 0;
        // 其他属性...
      }
      
      return finalStats;
    } catch (error) {
      logger.error('获取实体属性失败', {
        error: error.message,
        entityId
      });
      return null;
    }
  }
  
  /**
   * 获取技能属性
   * @private
   * @param {String} skillId - 技能ID
   * @returns {Promise<Object>} 技能属性
   */
  static async getSkillAttributes(skillId) {
    try {
      // 查询技能配置
      const Skill = mongoose.model('Skill');
      const skill = await Skill.findById(skillId);
      
      if (!skill) {
        return null;
      }
      
      return {
        damageRate: skill.damageRate,
        cooldown: skill.cooldown,
        range: skill.range,
        // 其他属性...
      };
    } catch (error) {
      logger.error('获取技能属性失败', {
        error: error.message,
        skillId
      });
      return null;
    }
  }
  
  /**
   * 获取活动效果
   * @private
   * @param {String} sourceEntityId - 来源实体ID
   * @param {String} targetEntityId - 目标实体ID
   * @param {String} battleId - 战斗ID
   * @param {Number} timestamp - 时间戳
   * @returns {Promise<Array>} 效果列表
   */
  static async getActiveEffects(sourceEntityId, targetEntityId, battleId, timestamp) {
    try {
      // 查询战斗中的活动效果
      const BattleEffect = mongoose.model('BattleEffect');
      
      const query = {
        battleId,
        expireAt: { $gt: timestamp },
        startAt: { $lte: timestamp }
      };
      
      if (sourceEntityId) {
        query.target = sourceEntityId;
      }
      
      if (targetEntityId) {
        query.$or = [
          { target: targetEntityId },
          { source: targetEntityId }
        ];
      }
      
      const effects = await BattleEffect.find(query);
      
      return effects.map(effect => ({
        id: effect._id,
        type: effect.type,
        value: effect.value,
        source: effect.source,
        target: effect.target,
        startAt: effect.startAt,
        expireAt: effect.expireAt
      }));
    } catch (error) {
      logger.error('获取活动效果失败', {
        error: error.message,
        sourceEntityId,
        targetEntityId,
        battleId
      });
      return [];
    }
  }
  
  /**
   * 验证客户端完整性
   * @param {Object} checksums - 客户端文件校验和
   * @returns {Object} 验证结果
   */
  static validateClientIntegrity(checksums) {
    try {
      return AntiCheat.validateClientIntegrity(checksums);
    } catch (error) {
      logger.error('验证客户端完整性失败', {
        error: error.message
      });
      
      return {
        valid: false,
        errors: ['客户端完整性验证失败: ' + error.message]
      };
    }
  }

  /**
   * 加密敏感数据
   * @param {Object} data - 敏感数据
   * @returns {Promise<Object>} 加密后的数据
   */
  static async encryptData(data) {
    try {
      return await dbEncryption.encrypt(data);
    } catch (error) {
      logger.error('加密数据失败', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 解密数据
   * @param {Object} encryptedData - 加密数据
   * @returns {Promise<Object>} 解密后的数据
   */
  static async decryptData(encryptedData) {
    try {
      return await dbEncryption.decrypt(encryptedData);
    } catch (error) {
      logger.error('解密数据失败', {
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * 获取中间件集合
   * @returns {Object} 中间件集合
   */
  static getMiddlewares() {
    return {
      // 审计日志中间件
      auditLog: auditLog.createMiddleware(),
      
      // 敏感操作日志中间件
      sensitiveLogger: sensitiveLogger.sensitiveLogger,
      
      // 全局限流中间件
      rateLimit: rateLimit.basicRateLimit,
      
      // 登录限流中间件
      loginRateLimit: rateLimit.loginRateLimit,
      
      // API限流中间件
      apiRateLimit: rateLimit.apiRateLimit,
      
      // 严格限流中间件
      strictRateLimit: rateLimit.strictRateLimit,
      
      // 动态路由中间件
      dynamicRoute: dynamicRouteManager.getMiddleware(),
      
      // 角色权限中间件生成器
      permission: (permission, resource) => rbac.requirePermission(permission, resource)
    };
  }
  
  /**
   * 验证支付签名
   * @param {Object} paymentData - 支付数据
   * @param {string} signature - 签名
   * @param {Object} options - 验证选项
   * @returns {Promise<boolean>} 验证结果
   */
  static async verifyPaymentSignature(paymentData, signature, options = {}) {
    try {
      const { nonce, timestamp } = options;
      return await paymentSignature.verifySignature(
        paymentData, 
        signature, 
        config.security.paymentSecretKey,
        { 
          nonce, 
          timestamp,
          strict: true,
          merchantId: options.merchantId || 'default'
        }
      );
    } catch (error) {
      logger.error('验证支付签名失败', {
        error: error.message,
        paymentData: { ...paymentData, amount: paymentData.amount }
      });
      return false;
    }
  }
  
  /**
   * 生成支付签名
   * @param {Object} paymentData - 支付数据
   * @returns {Promise<Object>} 签名结果
   */
  static async generatePaymentSignature(paymentData) {
    try {
      return await paymentSignature.generateSignature(
        paymentData,
        config.security.paymentSecretKey
      );
    } catch (error) {
      logger.error('生成支付签名失败', {
        error: error.message,
        paymentData: { ...paymentData, amount: paymentData.amount }
      });
      throw error;
    }
  }
  
  /**
   * 验证用户角色权限
   * @param {string} userId - 用户ID
   * @param {string} permission - 权限名称
   * @param {string} resource - 资源名称
   * @param {Object} context - 上下文信息
   * @returns {Promise<boolean>} 是否有权限
   */
  static async checkPermission(userId, permission, resource, context = {}) {
    try {
      // 获取用户角色
      const User = mongoose.model('User');
      const user = await User.findById(userId);
      
      if (!user) {
        return false;
      }
      
      const role = user.role || 'user';
      
      // 使用RBAC系统检查权限
      return rbac.checkPermission(role, permission, resource, context);
    } catch (error) {
      logger.error('检查用户权限失败', {
        error: error.message,
        userId,
        permission,
        resource
      });
      return false;
    }
  }
}

// 直接导出 GameSecurity 提供的方法和实例
module.exports = {
  // 主类
  GameSecurity,
  
  // 初始化方法
  init: GameSecurity.init,
  
  // 验证方法
  validateBattleData: GameSecurity.validateBattleData,
  validateClientIntegrity: GameSecurity.validateClientIntegrity,
  verifyPaymentSignature: GameSecurity.verifyPaymentSignature,
  generatePaymentSignature: GameSecurity.generatePaymentSignature,
  
  // 加密方法
  encryptData: GameSecurity.encryptData,
  decryptData: GameSecurity.decryptData,
  
  // 权限验证
  checkPermission: GameSecurity.checkPermission,
  
  // 获取中间件
  getMiddlewares: GameSecurity.getMiddlewares,
  
  // 辅助计算方法
  calculateExpectedDamage: GameSecurity.calculateExpectedDamage,
  calculateExpectedSpeed: GameSecurity.calculateExpectedSpeed,
  calculateExpectedResources: GameSecurity.calculateExpectedResources,
  
  // 导出各子模块
  auditLog,
  dbEncryption,
  paymentSignature,
  rbac,
  sensitiveLogger,
  DDoSProtection,
  TwoFactorAuth,
  AntiCheat,
  SignatureVerifier,
  rateLimit,
  dynamicRouteManager
}; 