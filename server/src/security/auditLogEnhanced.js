/**
 * 高级操作审计日志系统 V2.0
 * 提供军事级安全审计和完整性保护
 */
const logger = require('../utils/logger');
const dbEncryption = require('./dbEncryption');
const crypto = require('crypto');
const config = require('../config/security.config');
const mongoose = require('mongoose');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

// 可选Redis支持
let redisClient;
try {
  redisClient = require('../services/redis');
} catch (error) {
  logger.info('Redis客户端不可用，将使用内存存储进行审计日志');
}

// 审计日志Schema (如果启用了MongoDB)
let AuditLogModel;
try {
  const AuditLogSchema = new mongoose.Schema({
    id: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    userId: { type: String, index: true },
    username: String,
    action: { type: String, required: true, index: true },
    resource: { type: String, index: true },
    ipAddress: String,
    userAgent: String,
    category: { type: String, enum: ['ADMIN', 'USER', 'SYSTEM', 'SECURITY'], default: 'USER' },
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    // 加密字段
    requestBody: Object,
    responseBody: Object,
    metadata: Object,
    // 安全与完整性
    status: { type: String, enum: ['SUCCESS', 'ERROR', 'WARNING'], default: 'SUCCESS' },
    errorDetails: Object,
    integrityHash: { type: String, required: true },
    previousLogHash: String,
    piiMasked: { type: Boolean, default: true }
  }, { 
    timestamps: true 
  });
  
  // 索引优化
  AuditLogSchema.index({ timestamp: -1, category: 1 });
  AuditLogSchema.index({ userId: 1, timestamp: -1 });
  AuditLogSchema.index({ action: 1, resource: 1 });
  
  // 尝试初始化模型
  if (mongoose.connection.readyState === 1) { // 已连接
    AuditLogModel = mongoose.model('AuditLog', AuditLogSchema);
    logger.info('审计日志MongoDB模型初始化成功');
  } else {
    logger.info('MongoDB连接未就绪，审计日志将不会持久化到MongoDB');
  }
} catch (error) {
  logger.warn('初始化审计日志数据库模型失败', {
    error: error.message
  });
}

class AuditLogManager {
  constructor() {
    // 内存存储
    this.logs = new Map();
    this.lastLogHash = null;
    this.encryptedFields = ['requestBody', 'responseBody', 'metadata', 'errorDetails'];
    
    // 持久化配置
    this.persistToFile = config.security?.auditLog?.persistToFile || false;
    this.persistToDb = config.security?.auditLog?.persistToDb || false;
    this.rotationSize = config.security?.auditLog?.rotationSize || 10 * 1024 * 1024; // 10MB
    this.maxMemoryLogs = config.security?.auditLog?.maxMemoryLogs || 5000;
    
    // 敏感数据配置
    this.piiFields = [
      'password', 'token', 'secret', 'credit', 'card', 'ssn', 'social',
      'email', 'phone', 'address', 'birth', 'gender', 'national', 'passport',
      'license', 'credential', 'auth', 'key', 'private'
    ];
    
    // 文件日志路径
    this.logDir = config.security?.auditLog?.logDir || path.join(process.cwd(), 'logs', 'audit');
    
    // 初始化
    this._initialize();
  }
  
  /**
   * 初始化审计日志系统
   * @private
   */
  _initialize() {
    try {
      // 创建日志目录
      if (this.persistToFile) {
        if (!fs.existsSync(this.logDir)) {
          fs.mkdirSync(this.logDir, { recursive: true, mode: 0o750 });
        }
      }
      
      // 设置定期清理计划
      setInterval(() => this._cleanupOldLogs(), 1 * 60 * 60 * 1000); // 每小时清理一次
      
      logger.info('审计日志系统初始化成功', {
        persistToFile: this.persistToFile,
        persistToDb: this.persistToDb,
        maxMemoryLogs: this.maxMemoryLogs
      });
    } catch (error) {
      logger.error('审计日志系统初始化失败', {
        error: error.message,
        stack: error.stack
      });
    }
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
        ipAddress,
        userAgent,
        category = 'USER',
        severity = 'MEDIUM',
        status = 'SUCCESS',
        errorDetails
      } = logData;

      // 生成日志ID
      const logId = this._generateLogId();
      const timestamp = new Date();

      // 敏感数据脱敏
      const maskedRequestBody = this._maskPiiData(requestBody);
      const maskedResponseBody = this._maskPiiData(responseBody);
      const maskedMetadata = this._maskPiiData(metadata);
      const maskedErrorDetails = this._maskPiiData(errorDetails);

      // 加密敏感数据
      const encryptedRequestBody = maskedRequestBody ? await this._encryptSensitiveData(maskedRequestBody) : null;
      const encryptedResponseBody = maskedResponseBody ? await this._encryptSensitiveData(maskedResponseBody) : null;
      const encryptedMetadata = maskedMetadata ? await this._encryptSensitiveData(maskedMetadata) : null;
      const encryptedErrorDetails = maskedErrorDetails ? await this._encryptSensitiveData(maskedErrorDetails) : null;

      // 构建日志对象
      const auditLog = {
        id: logId,
        timestamp,
        userId,
        username,
        action,
        resource,
        requestBody: encryptedRequestBody,
        responseBody: encryptedResponseBody,
        metadata: encryptedMetadata,
        ipAddress,
        userAgent,
        category,
        severity,
        status,
        errorDetails: encryptedErrorDetails,
        previousLogHash: this.lastLogHash,
        integrityHash: '', // 将填充
        piiMasked: true
      };

      // 生成完整性哈希
      auditLog.integrityHash = this._generateIntegrityHash(auditLog);
      this.lastLogHash = auditLog.integrityHash;

      // 存储日志
      this.logs.set(logId, auditLog);
      
      // 控制内存中的日志数量
      if (this.logs.size > this.maxMemoryLogs) {
        const oldestKeys = Array.from(this.logs.keys()).slice(0, 100);
        for (const key of oldestKeys) {
          this.logs.delete(key);
        }
      }

      // 记录到系统日志
      if (severity === 'CRITICAL' || severity === 'HIGH') {
        logger.warn('重要审计事件', {
          logId,
          userId,
          action,
          resource,
          category,
          severity
        });
      } else {
        logger.info('审计日志记录', {
          logId,
          userId,
          action,
          resource
        });
      }

      // 持久化到文件
      if (this.persistToFile) {
        this._persistToFile(auditLog).catch(err => {
          logger.error('持久化审计日志到文件失败', {
            error: err.message,
            logId
          });
        });
      }

      // 持久化到数据库
      if (this.persistToDb && AuditLogModel) {
        try {
          await new AuditLogModel(auditLog).save();
        } catch (dbError) {
          logger.error('持久化审计日志到数据库失败', {
            error: dbError.message,
            logId
          });
        }
      }

      return logId;
    } catch (error) {
      logger.error('记录审计日志失败', {
        error: error.message,
        stack: error.stack,
        logData: {
          action: logData.action,
          userId: logData.userId
        }
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
      const errorDetails = {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
      };

      const logId = await this.log({
        ...logData,
        status: 'ERROR',
        severity: logData.severity || 'HIGH',
        errorDetails
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
        stack: error.stack,
        logData: {
          action: logData.action,
          userId: logData.userId
        }
      });
      throw error;
    }
  }

  /**
   * 查询审计日志
   * @param {Object} query - 查询条件
   * @param {Object} options - 查询选项
   * @returns {Object} 日志查询结果
   */
  async query(query = {}, options = {}) {
    try {
      const {
        startTime,
        endTime,
        userId,
        action,
        resource,
        category,
        severity,
        status,
        limit = 100,
        offset = 0
      } = query;

      let logs;

      // 如果启用了MongoDB，优先从数据库查询
      if (this.persistToDb && AuditLogModel && options.useDb !== false) {
        const dbQuery = {};
        
        if (startTime) dbQuery.timestamp = { $gte: new Date(startTime) };
        if (endTime) dbQuery.timestamp = { ...dbQuery.timestamp, $lte: new Date(endTime) };
        if (userId) dbQuery.userId = userId;
        if (action) dbQuery.action = action;
        if (resource) dbQuery.resource = resource;
        if (category) dbQuery.category = category;
        if (severity) dbQuery.severity = severity;
        if (status) dbQuery.status = status;
        
        const total = await AuditLogModel.countDocuments(dbQuery);
        logs = await AuditLogModel.find(dbQuery)
          .sort({ timestamp: -1 })
          .skip(offset)
          .limit(limit);
          
        // 解密敏感数据
        const decryptedLogs = await Promise.all(
          logs.map(async log => {
            const plainLog = log.toObject();
            return await this._decryptLogFields(plainLog);
          })
        );
        
        return {
          logs: decryptedLogs,
          total,
          limit,
          offset
        };
      } else {
        // 从内存中查询
        let filteredLogs = Array.from(this.logs.values()).filter(log => {
          let match = true;

          if (startTime) {
            match = match && log.timestamp >= new Date(startTime);
          }
          if (endTime) {
            match = match && log.timestamp <= new Date(endTime);
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
          if (category) {
            match = match && log.category === category;
          }
          if (severity) {
            match = match && log.severity === severity;
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
            return await this._decryptLogFields(log);
          })
        );

        return {
          logs: decryptedLogs,
          total: filteredLogs.length,
          limit,
          offset
        };
      }
    } catch (error) {
      logger.error('查询审计日志失败', {
        error: error.message,
        stack: error.stack,
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
      let log;
      
      // 优先从数据库获取
      if (this.persistToDb && AuditLogModel) {
        log = await AuditLogModel.findOne({ id: logId });
        if (log) {
          log = log.toObject();
        }
      }
      
      // 如果数据库中没有找到，从内存中获取
      if (!log) {
        log = this.logs.get(logId);
      }
      
      if (!log) {
        throw new Error('审计日志不存在');
      }

      // 验证完整性
      if (!this._verifyIntegrity(log)) {
        logger.warn('审计日志完整性验证失败', { logId });
      }

      // 解密敏感数据
      return await this._decryptLogFields(log);
    } catch (error) {
      logger.error('获取审计日志失败', {
        error: error.message,
        stack: error.stack,
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
      // 要忽略的路径
      const ignorePaths = options.ignorePaths || ['/health', '/metrics', '/favicon.ico'];
      if (ignorePaths.some(path => req.path.startsWith(path))) {
        return next();
      }
      
      // 确定日志类别
      let category = 'USER';
      if (req.path.startsWith('/api/admin')) {
        category = 'ADMIN';
      } else if (req.path.startsWith('/api/system')) {
        category = 'SYSTEM';
      } else if (req.path.includes('security') || req.path.includes('auth')) {
        category = 'SECURITY';
      }
      
      // 确定严重性
      let severity = 'LOW';
      if (req.method !== 'GET') {
        severity = 'MEDIUM'; // 写操作
        if (category === 'ADMIN' || category === 'SECURITY') {
          severity = 'HIGH'; // 管理员或安全相关操作
        }
      }
      
      // 保存请求开始时间
      const startTime = Date.now();
      
      // 保存原始方法
      const originalEnd = res.end;
      const originalWrite = res.write;
      const responseChunks = [];
      
      // 重写write方法捕获响应内容
      res.write = function(chunk) {
        if (chunk) {
          responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return originalWrite.apply(this, arguments);
      };

      // 重写end方法以捕获响应内容
      res.end = function(chunk) {
        if (chunk) {
          responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        
        // 合并响应内容
        const responseBody = Buffer.concat(responseChunks).toString('utf8');
        let parsedResponseBody;
        try {
          parsedResponseBody = JSON.parse(responseBody);
        } catch {
          // 不是JSON格式
          parsedResponseBody = { _raw: responseBody.substring(0, 500) };
        }
        
        // 计算响应时间
        const responseTime = Date.now() - startTime;
        
        // 确定状态
        let status = 'SUCCESS';
        if (res.statusCode >= 400) {
          status = 'ERROR';
          // 错误响应提升严重性
          if (res.statusCode >= 500) {
            severity = 'HIGH';
          } else if (severity === 'LOW') {
            severity = 'MEDIUM';
          }
        }

        // 记录审计日志
        const logData = {
          userId: req.user?.id,
          username: req.user?.username,
          action: `${req.method} ${req.path}`,
          resource: req.baseUrl,
          requestBody: req.body,
          responseBody: parsedResponseBody,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          category,
          severity,
          status,
          metadata: {
            params: req.params,
            query: req.query,
            responseTime,
            statusCode: res.statusCode,
            headers: {
              ...Object.keys(req.headers).reduce((acc, key) => {
                // 排除敏感Headers
                if (!['authorization', 'cookie', 'x-auth-token'].includes(key.toLowerCase())) {
                  acc[key] = req.headers[key];
                }
                return acc;
              }, {})
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
        return originalEnd.apply(this, arguments);
      };

      next();
    };
  }

  /**
   * 验证审计日志完整性
   * @param {string|Array} [logIdOrIds] - 日志ID或ID数组，不提供则验证所有日志
   * @returns {Object} 验证结果
   */
  async verifyIntegrity(logIdOrIds) {
    try {
      const results = {
        verified: 0,
        failed: 0,
        details: []
      };
      
      // 确定要验证的日志
      let logsToVerify = [];
      if (!logIdOrIds) {
        // 验证所有日志
        logsToVerify = Array.from(this.logs.values());
      } else if (Array.isArray(logIdOrIds)) {
        // 验证指定的多个日志
        for (const id of logIdOrIds) {
          const log = this.logs.get(id);
          if (log) {
            logsToVerify.push(log);
          } else {
            results.details.push({
              id,
              verified: false,
              reason: 'LOG_NOT_FOUND'
            });
            results.failed++;
          }
        }
      } else {
        // 验证单个日志
        const log = this.logs.get(logIdOrIds);
        if (log) {
          logsToVerify.push(log);
        } else {
          results.details.push({
            id: logIdOrIds,
            verified: false,
            reason: 'LOG_NOT_FOUND'
          });
          results.failed++;
        }
      }
      
      // 验证日志
      for (const log of logsToVerify) {
        const isValid = this._verifyIntegrity(log);
        results.details.push({
          id: log.id,
          verified: isValid,
          reason: isValid ? null : 'INTEGRITY_CHECK_FAILED'
        });
        
        if (isValid) {
          results.verified++;
        } else {
          results.failed++;
        }
      }
      
      return results;
    } catch (error) {
      logger.error('验证审计日志完整性失败', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 生成日志ID
   * @private
   * @returns {string} 日志ID
   */
  _generateLogId() {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(8).toString('hex');
    return `audit_${timestamp}_${random}`;
  }

  /**
   * 生成完整性哈希
   * @private
   * @param {Object} log - 日志对象
   * @returns {string} 完整性哈希
   */
  _generateIntegrityHash(log) {
    // 使用HMAC和密钥生成哈希
    const secret = config.security?.auditLog?.integrityKey || 'default-integrity-key';
    
    // 构建要哈希的数据
    const dataToHash = {
      id: log.id,
      timestamp: log.timestamp,
      userId: log.userId,
      action: log.action,
      resource: log.resource,
      status: log.status,
      previousLogHash: log.previousLogHash
    };
    
    // 使用HMAC生成哈希
    return crypto.createHmac('sha256', secret)
      .update(JSON.stringify(dataToHash))
      .digest('hex');
  }

  /**
   * 验证日志完整性
   * @private
   * @param {Object} log - 日志对象
   * @returns {boolean} 是否完整
   */
  _verifyIntegrity(log) {
    try {
      const expectedHash = this._generateIntegrityHash(log);
      return expectedHash === log.integrityHash;
    } catch (error) {
      logger.error('验证日志完整性失败', {
        error: error.message,
        logId: log.id
      });
      return false;
    }
  }

  /**
   * 加密敏感数据
   * @private
   * @param {Object} data - 待加密数据
   * @returns {Object} 加密后的数据
   */
  async _encryptSensitiveData(data) {
    try {
      return await dbEncryption.encrypt(data);
    } catch (error) {
      logger.error('加密敏感数据失败', {
        error: error.message
      });
      // 返回错误标记，而不是原始数据
      return { _encrypted: false, _error: error.message };
    }
  }

  /**
   * 解密敏感数据
   * @private
   * @param {Object} encryptedData - 加密的数据
   * @returns {Object} 解密后的数据
   */
  async _decryptSensitiveData(encryptedData) {
    try {
      if (!encryptedData) return null;
      
      // 处理加密失败的标记
      if (encryptedData._encrypted === false) {
        return { _decryption_error: encryptedData._error };
      }
      
      return await dbEncryption.decrypt(encryptedData);
    } catch (error) {
      logger.error('解密敏感数据失败', {
        error: error.message
      });
      return { _decryption_error: error.message };
    }
  }

  /**
   * 解密日志字段
   * @private
   * @param {Object} log - 日志对象
   * @returns {Object} 解密后的日志
   */
  async _decryptLogFields(log) {
    try {
      const decryptedLog = { ...log };
      
      for (const field of this.encryptedFields) {
        if (log[field]) {
          try {
            decryptedLog[field] = await this._decryptSensitiveData(log[field]);
          } catch (error) {
            decryptedLog[field] = { _decryption_error: error.message };
          }
        }
      }
      
      return decryptedLog;
    } catch (error) {
      logger.error('解密日志字段失败', {
        error: error.message,
        logId: log.id
      });
      return log; // 返回原始日志
    }
  }

  /**
   * 脱敏个人身份信息
   * @private
   * @param {Object} data - 原始数据
   * @returns {Object} 脱敏后的数据
   */
  _maskPiiData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    // 创建深拷贝以避免修改原始对象
    const result = JSON.parse(JSON.stringify(data));
    
    // 递归处理对象
    const maskObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      for (const key in obj) {
        // 检查是否是敏感字段
        const isPii = this.piiFields.some(
          field => key.toLowerCase().includes(field.toLowerCase())
        );
        
        if (isPii) {
          // 根据值类型进行脱敏
          if (typeof obj[key] === 'string') {
            const len = obj[key].length;
            if (len > 6) {
              obj[key] = `${obj[key].substr(0, 3)}****${obj[key].substr(len - 3)}`;
            } else if (len > 0) {
              obj[key] = '****';
            }
          } else if (typeof obj[key] === 'number') {
            obj[key] = 0;
          } else if (obj[key] && typeof obj[key] === 'object') {
            obj[key] = { _masked: true };
          }
        } else if (obj[key] && typeof obj[key] === 'object') {
          // 递归处理嵌套对象
          if (Array.isArray(obj[key])) {
            obj[key] = obj[key].map(item => 
              typeof item === 'object' ? maskObject(item) : item
            );
          } else {
            obj[key] = maskObject(obj[key]);
          }
        }
      }
      
      return obj;
    };
    
    return maskObject(result);
  }

  /**
   * 持久化日志到文件
   * @private
   * @param {Object} log - 日志对象
   */
  async _persistToFile(log) {
    try {
      const date = new Date(log.timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // 日志文件路径
      const logFilePath = path.join(
        this.logDir,
        `audit_${year}-${month}-${day}.jsonl`
      );
      
      // 将日志序列化为JSON行
      const logLine = JSON.stringify(log) + '\n';
      
      // 追加到文件
      await fs.promises.appendFile(logFilePath, logLine, { encoding: 'utf8' });
      
      // 检查文件大小，如果过大则轮换
      const stats = await fs.promises.stat(logFilePath);
      if (stats.size > this.rotationSize) {
        await this._rotateLogFile(logFilePath);
      }
    } catch (error) {
      logger.error('持久化日志到文件失败', {
        error: error.message,
        stack: error.stack,
        logId: log.id
      });
      throw error;
    }
  }

  /**
   * 轮换日志文件
   * @private
   * @param {string} logFilePath - 日志文件路径
   */
  async _rotateLogFile(logFilePath) {
    try {
      const timestamp = Date.now();
      const rotatedPath = `${logFilePath}.${timestamp}`;
      
      // 重命名当前日志文件
      await fs.promises.rename(logFilePath, rotatedPath);
      
      // 压缩轮换的日志文件（如果需要）
      if (config.security?.auditLog?.compressRotatedLogs !== false) {
        // TODO: 实现压缩逻辑
      }
      
      logger.info('审计日志文件已轮换', {
        from: logFilePath,
        to: rotatedPath
      });
    } catch (error) {
      logger.error('轮换日志文件失败', {
        error: error.message,
        logFilePath
      });
    }
  }

  /**
   * 清理旧日志
   * @private
   */
  async _cleanupOldLogs() {
    try {
      // 清理内存中的日志
      if (this.logs.size > this.maxMemoryLogs) {
        // 排序日志按时间戳
        const sortedLogs = Array.from(this.logs.entries())
          .sort(([, a], [, b]) => a.timestamp - b.timestamp);
        
        // 删除最旧的日志直到达到目标大小
        const logsToRemove = sortedLogs.slice(0, sortedLogs.length - this.maxMemoryLogs);
        for (const [key] of logsToRemove) {
          this.logs.delete(key);
        }
        
        logger.debug('清理内存审计日志', {
          removed: logsToRemove.length,
          remaining: this.logs.size
        });
      }
      
      // 清理旧文件
      if (this.persistToFile && config.security?.auditLog?.retentionDays) {
        const retentionMs = config.security.auditLog.retentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - retentionMs;
        
        // 列出日志目录
        const files = await fs.promises.readdir(this.logDir);
        
        for (const file of files) {
          if (file.startsWith('audit_')) {
            const filePath = path.join(this.logDir, file);
            const stats = await fs.promises.stat(filePath);
            
            // 如果文件超过保留期，删除它
            if (stats.mtimeMs < cutoffTime) {
              await fs.promises.unlink(filePath);
              logger.info('删除过期审计日志文件', { file });
            }
          }
        }
      }
    } catch (error) {
      logger.error('清理旧审计日志失败', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}

// 导出单例
module.exports = new AuditLogManager(); 