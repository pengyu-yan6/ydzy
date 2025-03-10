/**
 * 操作速率限制模块
 * 防止用户短时间内执行过多操作，避免刷服务器、攻击等行为
 */
const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

// 是否使用Redis存储
const useRedis = process.env.USE_REDIS_RATE_LIMIT === 'true';

// Redis客户端
let redisClient;
if (useRedis) {
  try {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_RATE_LIMIT_DB || '3', 10),
    });
    
    // 监听连接事件
    redisClient.on('connect', () => {
      logger.info('操作速率限制Redis已连接');
    });
    
    redisClient.on('error', (err) => {
      logger.error('操作速率限制Redis连接错误', {
        error: err.message
      });
    });
  } catch (error) {
    logger.error('初始化操作速率限制Redis失败', {
      error: error.message
    });
  }
}

// 内存存储（当Redis不可用时）
const actionCounters = new Map();

// 不同操作类型的速率限制配置
const ACTION_LIMITS = {
  // 攻击操作
  'attack': {
    maxCount: 8,       // 8次/秒
    windowMs: 1000     
  },
  // 移动操作
  'move': {
    maxCount: 10,      // 10次/秒
    windowMs: 1000
  },
  // 技能使用
  'use_skill': {
    maxCount: 5,       // 5次/秒
    windowMs: 1000
  },
  // 道具使用
  'use_item': {
    maxCount: 3,       // 3次/秒
    windowMs: 1000
  },
  // 聊天信息
  'chat': {
    maxCount: 5,       // 5条/3秒
    windowMs: 3000
  },
  // 其他操作默认配置
  'default': {
    maxCount: 15,      // 15次/秒
    windowMs: 1000
  }
};

/**
 * 操作速率限制器
 */
class RateLimiter {
  /**
   * 检查操作是否超过速率限制
   * @param {String} userId - 用户ID
   * @param {String} actionType - 操作类型
   * @returns {Promise<Boolean>} - 如果超过限制则返回true
   */
  static async isActionRateLimited(userId, actionType) {
    // 获取该操作类型的限制配置
    const limitConfig = ACTION_LIMITS[actionType] || ACTION_LIMITS.default;
    const { maxCount, windowMs } = limitConfig;
    
    try {
      // 构建标识键
      const key = `ratelimit:${userId}:${actionType}`;
      
      if (useRedis && redisClient && redisClient.status === 'ready') {
        // Redis实现
        // 使用滑动窗口计数器
        const now = Date.now();
        const windowStartTime = now - windowMs;
        
        // 添加当前操作记录
        await redisClient.zadd(key, now, `${now}`);
        
        // 移除窗口外的旧记录
        await redisClient.zremrangebyscore(key, 0, windowStartTime);
        
        // 设置键过期时间
        await redisClient.expire(key, Math.ceil(windowMs / 1000) * 2); // 2倍窗口时间
        
        // 获取窗口内的操作数量
        const count = await redisClient.zcard(key);
        
        // 检查是否超过限制
        return count > maxCount;
      } else {
        // 内存实现
        if (!actionCounters.has(key)) {
          actionCounters.set(key, []);
        }
        
        const records = actionCounters.get(key);
        const now = Date.now();
        const windowStartTime = now - windowMs;
        
        // 移除窗口外的旧记录
        while (records.length > 0 && records[0] < windowStartTime) {
          records.shift();
        }
        
        // 添加当前操作记录
        records.push(now);
        
        // 检查是否超过限制
        return records.length > maxCount;
      }
    } catch (error) {
      logger.error('检查操作速率限制时出错', {
        error: error.message,
        userId,
        actionType
      });
      
      // 出错时不限制操作，确保不影响正常用户
      return false;
    }
  }
  
  /**
   * 重置用户某操作类型的计数
   * @param {String} userId - 用户ID
   * @param {String} actionType - 操作类型
   * @returns {Promise<Boolean>} - 操作是否成功
   */
  static async resetActionCounter(userId, actionType) {
    try {
      const key = `ratelimit:${userId}:${actionType}`;
      
      if (useRedis && redisClient && redisClient.status === 'ready') {
        // Redis实现
        await redisClient.del(key);
      } else {
        // 内存实现
        actionCounters.delete(key);
      }
      
      return true;
    } catch (error) {
      logger.error('重置操作计数器时出错', {
        error: error.message,
        userId,
        actionType
      });
      return false;
    }
  }
  
  /**
   * 清理内存中的过期记录
   */
  static cleanupExpiredRecords() {
    if (useRedis && redisClient && redisClient.status === 'ready') {
      // Redis自动过期，无需手动清理
      return;
    }
    
    const now = Date.now();
    let cleanCount = 0;
    
    // 遍历所有计数器
    for (const [key, records] of actionCounters.entries()) {
      // 提取操作类型
      const actionType = key.split(':')[2];
      
      // 获取窗口配置
      const { windowMs } = ACTION_LIMITS[actionType] || ACTION_LIMITS.default;
      const windowStartTime = now - windowMs;
      
      // 统计初始记录数
      const initialCount = records.length;
      
      // 移除过期记录
      while (records.length > 0 && records[0] < windowStartTime) {
        records.shift();
      }
      
      // 如果所有记录都被清理，删除该键
      if (records.length === 0) {
        actionCounters.delete(key);
      }
      
      // 更新清理计数
      cleanCount += (initialCount - records.length);
    }
    
    if (cleanCount > 0) {
      logger.debug(`清理了 ${cleanCount} 条过期操作记录`);
    }
  }
  
  /**
   * 启动定期清理任务
   * @param {Number} interval - 清理间隔（毫秒）
   */
  static startCleanupInterval(interval = 30000) {
    // 仅在使用内存存储时需要定期清理
    if (!useRedis || !redisClient || redisClient.status !== 'ready') {
      setInterval(() => this.cleanupExpiredRecords(), interval);
    }
  }
}

// 启动清理任务
RateLimiter.startCleanupInterval();

module.exports = RateLimiter; 