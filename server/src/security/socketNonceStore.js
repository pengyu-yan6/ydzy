/**
 * WebSocket nonce存储模块
 * 用于防止WebSocket连接的重放攻击
 */
const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

// 是否使用Redis存储nonce
const useRedis = process.env.USE_REDIS_NONCE_STORE === 'true';
const NONCE_EXPIRY = config.security.signatureTimeWindow || 300; // 默认5分钟

let redisClient;
// 内存存储（当Redis不可用时）
const memoryStore = new Map();

// 初始化Redis客户端（如果启用）
if (useRedis) {
  try {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_SOCKET_NONCE_DB || '2', 10),
    });
    
    // 测试连接
    redisClient.on('connect', () => {
      logger.info('WebSocket nonce Redis存储已连接');
    });
    
    redisClient.on('error', (err) => {
      logger.error('WebSocket nonce Redis连接错误，将使用内存存储', {
        error: err.message
      });
    });
  } catch (error) {
    logger.error('初始化WebSocket nonce Redis失败，将使用内存存储', {
      error: error.message
    });
  }
}

/**
 * WebSocket nonce存储
 */
class SocketNonceStore {
  /**
   * 检查nonce是否已被使用
   * @param {String} nonce - 要检查的nonce
   * @returns {Promise<Boolean>} - 如果已使用则返回true
   */
  static async isNonceUsed(nonce) {
    if (!nonce) {
      return true; // 无效的nonce视为已使用
    }
    
    try {
      if (useRedis && redisClient && redisClient.status === 'ready') {
        // 使用Redis检查
        const exists = await redisClient.exists(`socket_nonce:${nonce}`);
        return exists === 1;
      } else {
        // 使用内存存储检查
        return memoryStore.has(nonce);
      }
    } catch (error) {
      logger.error('检查WebSocket nonce时出错', {
        error: error.message,
        nonce
      });
      return true; // 出错时视为已使用，确保安全
    }
  }
  
  /**
   * 将nonce标记为已使用
   * @param {String} nonce - 要标记的nonce
   * @param {Number} timestamp - 相关的时间戳
   * @returns {Promise<Boolean>} - 操作是否成功
   */
  static async markNonceAsUsed(nonce, timestamp) {
    if (!nonce) {
      return false;
    }
    
    try {
      if (useRedis && redisClient && redisClient.status === 'ready') {
        // 使用Redis存储
        await redisClient.set(
          `socket_nonce:${nonce}`, 
          timestamp, 
          'EX', 
          NONCE_EXPIRY
        );
      } else {
        // 使用内存存储
        memoryStore.set(nonce, timestamp);
        
        // 设置过期清理（内存存储）
        setTimeout(() => {
          memoryStore.delete(nonce);
        }, NONCE_EXPIRY * 1000);
        
        // 内存存储的大小限制，防止内存泄漏
        if (memoryStore.size > 10000) {
          // 删除最早的10%条目
          const oldestNonces = Array.from(memoryStore.keys())
            .slice(0, Math.floor(memoryStore.size * 0.1));
          
          oldestNonces.forEach(key => memoryStore.delete(key));
          
          logger.warn('内存nonce存储达到限制，已清理旧条目', {
            cleanedCount: oldestNonces.length,
            remainingCount: memoryStore.size
          });
        }
      }
      
      return true;
    } catch (error) {
      logger.error('标记WebSocket nonce时出错', {
        error: error.message,
        nonce
      });
      return false;
    }
  }
  
  /**
   * 清理所有过期的nonce（仅适用于内存存储）
   */
  static cleanExpiredNonces() {
    if (useRedis && redisClient && redisClient.status === 'ready') {
      // Redis自动过期，无需手动清理
      return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    let cleanCount = 0;
    
    for (const [nonce, timestamp] of memoryStore.entries()) {
      if (now - timestamp > NONCE_EXPIRY) {
        memoryStore.delete(nonce);
        cleanCount++;
      }
    }
    
    if (cleanCount > 0) {
      logger.debug(`清理了 ${cleanCount} 个过期的WebSocket nonce`);
    }
  }
  
  /**
   * 开始定期清理过期nonce
   * @param {Number} interval - 清理间隔（毫秒）
   */
  static startCleanupInterval(interval = 60000) {
    // 仅在使用内存存储时需要定期清理
    if (!useRedis || !redisClient || redisClient.status !== 'ready') {
      setInterval(() => this.cleanExpiredNonces(), interval);
    }
  }
}

// 启动清理任务
SocketNonceStore.startCleanupInterval();

module.exports = SocketNonceStore;