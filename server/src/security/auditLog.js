/**
 * 操作审计日志系统
 * 用于记录和追踪管理员操作
 */
const logger = require('../utils/logger');
const dbEncryption = require('./dbEncryption');
const crypto = require('crypto');
const config = require('../config');
const db = require('../services/db');

class AuditLogManager {
  constructor() {
    this.logs = new Map();
    this.encryptedFields = ['requestBody', 'responseBody', 'metadata'];
    this._initializeKey();
  }

  /**
   * 记录审计日志
   * @param {Object} logData - 日志数据
   * @returns {string} 日志ID
   */
  async log(logData) {
    try {
      const {
        userId,
        username,
        action,
        resource,
        requestBody,
        responseBody,
        metadata,
        ip,
        userAgent
      } = logData;

      // 生成日志ID
      const logId = this._generateLogId();

      // 构建日志对象
      const auditLog = {
        id: logId,
        timestamp: Date.now(),
        userId,
        username,
        action,
        resource,
        requestBody: requestBody ? await this._encryptSensitiveData(requestBody) : null,
        responseBody: responseBody ? await this._encryptSensitiveData(responseBody) : null,
        metadata: metadata ? await this._encryptSensitiveData(metadata) : null,
        ip,
        userAgent,
        status: 'SUCCESS'
      };

      // 存储日志
      this.logs.set(logId, auditLog);

      // 记录到系统日志
      logger.info('审计日志记录', {
        logId,
        userId,
        action,
        resource
      });

      return logId;
    } catch (error) {
      logger.error('记录审计日志失败', {
        error: error.message,
        logData
      });
      throw error;
    }
  }

  /**
   * 记录错误审计日志
   * @param {Object} logData - 日志数据
   * @param {Error} error - 错误对象
   * @returns {string} 日志ID
   */
  async logError(logData, error) {
    try {
      const logId = await this.log({
        ...logData,
        status: 'ERROR',
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code
        }
      });

      logger.error('错误审计日志记录', {
        logId,
        error: error.message,
        userId: logData.userId,
        action: logData.action
      });

      return logId;
    } catch (error) {
      logger.error('记录错误审计日志失败', {
        error: error.message,
        logData
      });
      throw error;
    }
  }

  /**
   * 查询审计日志
   * @param {Object} query - 查询条件
   * @param {Object} options - 查询选项
   * @returns {Array} 日志列表
   */
  async query(query = {}, options = {}) {
    try {
      const {
        startTime,
        endTime,
        userId,
        action,
        resource,
        status,
        limit = 100,
        offset = 0
      } = query;

      // 过滤日志
      let filteredLogs = Array.from(this.logs.values()).filter(log => {
        let match = true;

        if (startTime) {
          match = match && log.timestamp >= startTime;
        }
        if (endTime) {
          match = match && log.timestamp <= endTime;
        }
        if (userId) {
          match = match && log.userId === userId;
        }
        if (action) {
          match = match && log.action === action;
        }
        if (resource) {
          match = match && log.resource === resource;
        }
        if (status) {
          match = match && log.status === status;
        }

        return match;
      });

      // 排序
      filteredLogs.sort((a, b) => b.timestamp - a.timestamp);

      // 分页
      const paginatedLogs = filteredLogs.slice(offset, offset + limit);

      // 解密敏感数据
      const decryptedLogs = await Promise.all(
        paginatedLogs.map(async log => {
          const decryptedLog = { ...log };
          
          for (const field of this.encryptedFields) {
            if (log[field]) {
              decryptedLog[field] = await this._decryptSensitiveData(log[field]);
            }
          }
          
          return decryptedLog;
        })
      );

      return {
        logs: decryptedLogs,
        total: filteredLogs.length,
        limit,
        offset
      };
    } catch (error) {
      logger.error('查询审计日志失败', {
        error: error.message,
        query
      });
      throw error;
    }
  }

  /**
   * 获取单条审计日志
   * @param {string} logId - 日志ID
   * @returns {Object} 日志对象
   */
  async get(logId) {
    try {
      const log = this.logs.get(logId);
      
      if (!log) {
        throw new Error('审计日志不存在');
      }

      // 解密敏感数据
      const decryptedLog = { ...log };
      
      for (const field of this.encryptedFields) {
        if (log[field]) {
          decryptedLog[field] = await this._decryptSensitiveData(log[field]);
        }
      }

      return decryptedLog;
    } catch (error) {
      logger.error('获取审计日志失败', {
        error: error.message,
        logId
      });
      throw error;
    }
  }

  /**
   * 创建审计中间件
   * @param {Object} options - 中间件选项
   * @returns {Function} Express中间件
   */
  createMiddleware(options = {}) {
    const self = this;
    
    return async (req, res, next) => {
      // 保存原始end方法
      const originalEnd = res.end;
      let responseBody = '';

      // 重写end方法以捕获响应内容
      res.end = function(chunk) {
        if (chunk) {
          responseBody += chunk;
        }

        // 记录审计日志
        const logData = {
          userId: req.user?.id,
          username: req.user?.username,
          action: `${req.method} ${req.path}`,
          resource: req.baseUrl,
          requestBody: req.body,
          responseBody: responseBody,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          metadata: {
            params: req.params,
            query: req.query,
            headers: {
              ...req.headers,
              // 过滤敏感header
              authorization: undefined,
              cookie: undefined
            }
          }
        };

        self.log(logData).catch(err => {
          logger.error('审计中间件记录失败', {
            error: err.message,
            path: req.path
          });
        });

        // 调用原始end方法
        originalEnd.apply(this, arguments);
      };

      next();
    };
  }

  /**
   * 生成日志ID
   * @private
   * @returns {string} 日志ID
   */
  _generateLogId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 加密敏感数据
   * @private
   * @param {Object} data - 待加密数据
   * @returns {Object} 加密后的数据
   */
  async _encryptSensitiveData(data) {
    return await dbEncryption.encrypt(data);
  }

  /**
   * 解密敏感数据
   * @private
   * @param {Object} encryptedData - 加密的数据
   * @returns {Object} 解密后的数据
   */
  async _decryptSensitiveData(encryptedData) {
    return await dbEncryption.decrypt(encryptedData);
  }

  /**
   * 清理过期日志
   * @param {number} maxAge - 最大保留时间（毫秒）
   */
  async cleanup(maxAge) {
    try {
      const now = Date.now();
      let count = 0;

      for (const [logId, log] of this.logs.entries()) {
        if (now - log.timestamp > maxAge) {
          this.logs.delete(logId);
          count++;
        }
      }

      logger.info('清理过期审计日志完成', {
        cleanedCount: count,
        maxAge
      });
    } catch (error) {
      logger.error('清理审计日志失败', {
        error: error.message,
        maxAge
      });
      throw error;
    }
  }

  /**
   * 初始化加密密钥
   * @private
   */
  _initializeKey() {
    // 从配置或环境变量获取盐值，确保每个实例不同
    const salt = Buffer.from(config.security.dbSalt || crypto.randomBytes(32));
    
    // 使用PBKDF2而非单纯HKDF
    this.encryptionKey = crypto.pbkdf2Sync(
      config.security.dbMasterKey,
      salt,
      100000, // 迭代次数提高
      this.keyLength,
      'sha512'
    );
  }

  /**
   * 添加密钥轮换机制
   * @param {Buffer} newKey - 新密钥
   * @returns {Promise} 异步操作
   */
  async rotateEncryptionKey(newKey) {
    // 备份旧密钥
    const oldKey = this.encryptionKey;
    
    // 初始化新密钥
    this.encryptionKey = newKey;
    
    // 重新加密所有数据（示例）
    // 实际实现需要考虑分批处理和失败恢复
    for (const collection of this.encryptedCollections) {
      const docs = await db.collection(collection).find().toArray();
      for (const doc of docs) {
        // 解密使用旧密钥
        const tempKey = this.encryptionKey;
        this.encryptionKey = oldKey;
        const decrypted = this.decryptFields(doc, this.encryptedFields);
        
        // 加密使用新密钥
        this.encryptionKey = newKey;
        await db.collection(collection).updateOne(
          { _id: doc._id },
          { $set: this.encryptFields(decrypted, this.encryptedFields) }
        );
      }
    }
  }
}

// 导出单例
module.exports = new AuditLogManager(); 