/**
 * 高级数据库加密策略模块
 * 用于敏感数据的加密存储和解密
 * 安全级别：军事级 (Military-grade)
 */
const crypto = require('crypto');
const config = require('../config/security.config');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const os = require('os');

class DatabaseEncryption {
  constructor() {
    // 高级加密配置
    this.algorithms = {
      primary: 'aes-256-gcm',
      secondary: 'chacha20-poly1305',
      fallback: 'aes-256-cbc'
    };
    
    this.keyLength = 32; // 256 bits
    this.ivLength = 12;  // 96 bits for GCM
    this.tagLength = 16; // 128 bits
    this.encoding = 'hex';
    this.pbkdfIterations = 150000; // 增强密钥派生强度
    
    // 密钥管理
    this.activeKeyId = null;
    this.encryptionKeys = new Map();
    this.keyVersions = new Map();
    
    // 自动轮换配置
    this.keyLifetime = 30 * 24 * 60 * 60 * 1000; // 30天
    
    // 完整性保护
    this.integritySecret = null;
    this.integrityAlgorithm = 'sha256';
    
    // 缓存管理
    this.keyCache = new Map();
    this.keyCacheTTL = 5 * 60 * 1000; // 5分钟
    
    // 监控和审计
    this.operationCount = {
      encrypt: 0,
      decrypt: 0,
      keyDerivation: 0,
      failed: 0
    };
    this.lastKeyRotation = null;
    
    // 初始化加密系统
    this._initializeEncryptionSystem();
  }

  /**
   * 初始化加密系统
   * @private
   */
  _initializeEncryptionSystem() {
    try {
      logger.info('初始化数据库加密系统');
      
      // 加载主密钥和完整性保护密钥
      this._loadMasterKey();
      this._loadIntegrityKey();
      
      // 加载或生成加密密钥
      this._initializeEncryptionKeys();
      
      // 设置密钥轮换计划
      this._scheduleKeyRotation();
      
      logger.info('数据库加密系统初始化完成', {
        activeKeyId: this.activeKeyId,
        keyCount: this.encryptionKeys.size,
        algorithm: this.algorithms.primary
      });
    } catch (error) {
      logger.error('初始化数据库加密系统失败', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('加密系统初始化失败：' + error.message);
    }
  }
  
  /**
   * 加载主密钥
   * @private
   */
  _loadMasterKey() {
    try {
      // 首先尝试从环境变量加载
      let masterKey = process.env.DB_MASTER_KEY;
      
      // 如果环境变量未设置，尝试从配置加载
      if (!masterKey) {
        if (!config.security || !config.security.dbMasterKey) {
          throw new Error('未找到数据库主密钥，请在环境变量或配置文件中设置');
        }
        masterKey = config.security.dbMasterKey;
      }
      
      // 验证主密钥强度
      if (this._calculateKeyStrength(masterKey) < 128) {
        logger.warn('数据库主密钥强度不足，建议使用至少128位强度的密钥');
      }
      
      this.masterKey = masterKey;
    } catch (error) {
      logger.error('加载主密钥失败', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('加载主密钥失败');
    }
  }
  
  /**
   * 加载完整性保护密钥
   * @private
   */
  _loadIntegrityKey() {
    try {
      // 首先尝试从环境变量加载
      let integrityKey = process.env.DB_INTEGRITY_KEY;
      
      // 如果环境变量未设置，尝试从配置加载
      if (!integrityKey) {
        if (config.security && config.security.dbIntegrityKey) {
          integrityKey = config.security.dbIntegrityKey;
        } else {
          // 从主密钥派生
          integrityKey = crypto.createHmac('sha256', this.masterKey)
            .update('integrity-protection-key')
            .digest('hex');
        }
      }
      
      this.integritySecret = integrityKey;
    } catch (error) {
      logger.error('加载完整性保护密钥失败', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('加载完整性保护密钥失败');
    }
  }

  /**
   * 初始化加密密钥
   * @private
   */
  _initializeEncryptionKeys() {
    try {
      // 在生产环境中应从安全的密钥存储服务加载
      // 这里为了示例，我们从配置加载或派生密钥
      
      let keyConfig;
      
      // 尝试从配置加载密钥配置
      if (config.security && config.security.dbEncryptionKeys) {
        keyConfig = config.security.dbEncryptionKeys;
      } else {
        // 使用默认配置
        keyConfig = [{
          id: 'key-1',
          version: 1,
          created: Date.now()
        }];
      }
      
      // 如果存在本地密钥存储，从本地加载
      const localKeysPath = this._getLocalKeysPath();
      if (fs.existsSync(localKeysPath)) {
        try {
          const localKeys = JSON.parse(fs.readFileSync(localKeysPath, 'utf8'));
          
          // 合并本地配置
          const localKeyIds = new Set(localKeys.map(k => k.id));
          keyConfig = [...localKeys, ...keyConfig.filter(k => !localKeyIds.has(k.id))];
          
          logger.info('从本地存储加载密钥配置', {
            keyCount: localKeys.length
          });
        } catch (e) {
          logger.warn('无法从本地存储加载密钥配置', {
            error: e.message
          });
        }
      }
      
      // 初始化密钥
      for (const keyInfo of keyConfig) {
        // 派生加密密钥
        const { id, version, created } = keyInfo;
        const derivedKey = this._deriveKeyFromMaster(id);
        
        // 存储密钥
        this.encryptionKeys.set(id, derivedKey);
        this.keyVersions.set(id, {
          version,
          created: created || Date.now(),
          algorithm: this.algorithms.primary
        });
      }
      
      // 设置活动密钥
      // 选择最新的密钥作为活动密钥
      if (keyConfig.length > 0) {
        const sortedKeys = [...keyConfig].sort((a, b) => 
          (b.created || 0) - (a.created || 0)
        );
        this.activeKeyId = sortedKeys[0].id;
        this.lastKeyRotation = sortedKeys[0].created || Date.now();
      } else {
        // 创建首个密钥
        this._generateNewEncryptionKey();
      }
    } catch (error) {
      logger.error('初始化加密密钥失败', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('初始化加密密钥失败');
    }
  }

  /**
   * 获取本地密钥存储路径
   * @private
   * @returns {string} 本地密钥存储路径
   */
  _getLocalKeysPath() {
    // 在生产环境中，应使用更安全的密钥存储方式
    // 这里仅用于开发/测试环境
    const configDir = process.env.NODE_ENV === 'production'
      ? process.env.DB_KEYS_PATH || '/etc/app/security'
      : path.join(os.homedir(), '.app-security');
    
    // 确保目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
    
    return path.join(configDir, 'db-encryption-keys.json');
  }

  /**
   * 从主密钥派生加密密钥
   * @private
   * @param {string} keyId - 密钥ID
   * @returns {Buffer} 派生的密钥
   */
  _deriveKeyFromMaster(keyId) {
    try {
      // 增加计数
      this.operationCount.keyDerivation++;
      
      // 检查缓存
      const cacheKey = `derive:${keyId}`;
      const cachedKey = this.keyCache.get(cacheKey);
      if (cachedKey && cachedKey.expires > Date.now()) {
        return cachedKey.key;
      }
      
      // 创建唯一的盐值
      const salt = crypto.createHash('sha256')
        .update(`${keyId}-salt-${this.masterKey.substring(0, 8)}`)
        .digest();
      
      // 使用PBKDF2派生密钥
      const derivedKey = crypto.pbkdf2Sync(
        this.masterKey,
        salt,
        this.pbkdfIterations,
        this.keyLength,
        'sha512'
      );
      
      // 添加到缓存
      this.keyCache.set(cacheKey, {
        key: derivedKey,
        expires: Date.now() + this.keyCacheTTL
      });
      
      return derivedKey;
    } catch (error) {
      this.operationCount.failed++;
      logger.error('派生加密密钥失败', {
        error: error.message,
        keyId,
        stack: error.stack
      });
      throw new Error('密钥派生失败');
    }
  }

  /**
   * 生成新的加密密钥
   * @private
   * @returns {string} 新密钥的ID
   */
  _generateNewEncryptionKey() {
    try {
      // 生成新的密钥ID
      const keyId = `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const created = Date.now();
      const version = this.encryptionKeys.size + 1;
      
      // 派生密钥
      const derivedKey = this._deriveKeyFromMaster(keyId);
      
      // 存储密钥
      this.encryptionKeys.set(keyId, derivedKey);
      this.keyVersions.set(keyId, {
        version,
        created,
        algorithm: this.algorithms.primary
      });
      
      // 更新活动密钥
      this.activeKeyId = keyId;
      this.lastKeyRotation = created;
      
      // 保存密钥配置到本地存储
      this._saveKeyConfig();
      
      logger.info('生成新加密密钥', {
        keyId,
        version
      });
      
      return keyId;
    } catch (error) {
      logger.error('生成新加密密钥失败', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('生成新密钥失败');
    }
  }

  /**
   * 保存密钥配置到本地存储
   * @private
   */
  _saveKeyConfig() {
    try {
      // 在生产环境中应使用安全的密钥管理服务
      // 这里仅用于开发/测试环境
      
      if (process.env.NODE_ENV === 'production' && !process.env.DB_KEYS_PATH) {
        // 在生产环境中不保存本地密钥，除非明确指定路径
        return;
      }
      
      const keyConfig = [];
      for (const [id, info] of this.keyVersions.entries()) {
        keyConfig.push({
          id,
          version: info.version,
          created: info.created,
          algorithm: info.algorithm
        });
      }
      
      const localKeysPath = this._getLocalKeysPath();
      fs.writeFileSync(
        localKeysPath, 
        JSON.stringify(keyConfig, null, 2), 
        { mode: 0o600 }
      );
      
      logger.debug('密钥配置已保存到本地存储');
    } catch (error) {
      logger.warn('保存密钥配置到本地存储失败', {
        error: error.message
      });
      // 不抛出异常，因为这只是辅助功能
    }
  }

  /**
   * 设置密钥轮换计划
   * @private
   */
  _scheduleKeyRotation() {
    // 检查是否需要轮换密钥
    const checkRotation = () => {
      try {
        const now = Date.now();
        
        // 如果没有进行过轮换或已经超过密钥生命周期
        if (!this.lastKeyRotation || (now - this.lastKeyRotation) > this.keyLifetime) {
          logger.info('执行定期密钥轮换');
          this.rotateEncryptionKey();
        }
      } catch (error) {
        logger.error('密钥轮换检查失败', {
          error: error.message
        });
      }
    };
    
    // 每天检查一次
    setInterval(checkRotation, 24 * 60 * 60 * 1000);
    
    // 首次检查
    setTimeout(checkRotation, 5000);
  }

  /**
   * 计算密钥强度
   * @private
   * @param {string} key - 密钥
   * @returns {number} 估计的密钥强度（单位：位）
   */
  _calculateKeyStrength(key) {
    if (!key) return 0;
    
    // 简单的密钥强度估算
    const length = key.length;
    const hasUpperCase = /[A-Z]/.test(key);
    const hasLowerCase = /[a-z]/.test(key);
    const hasDigits = /[0-9]/.test(key);
    const hasSpecial = /[^A-Za-z0-9]/.test(key);
    
    // 计算字符集大小
    let charsetSize = 0;
    if (hasUpperCase) charsetSize += 26;
    if (hasLowerCase) charsetSize += 26;
    if (hasDigits) charsetSize += 10;
    if (hasSpecial) charsetSize += 32;
    
    // 估算强度: log2(字符集大小^长度)
    const strength = Math.floor(length * Math.log2(Math.max(charsetSize, 1)));
    
    return strength;
  }

  /**
   * 加密数据 - 增强版
   * @param {string|Object} data - 待加密数据
   * @param {Object} options - 加密选项
   * @returns {Object} 加密结果
   */
  async encrypt(data, options = {}) {
    try {
      // 增加计数
      this.operationCount.encrypt++;
      
      // 检查加密系统状态
      if (!this.activeKeyId || !this.encryptionKeys.has(this.activeKeyId)) {
        throw new Error('加密系统未正确初始化或密钥不可用');
      }
      
      // 获取密钥信息
      const keyId = options.keyId || this.activeKeyId;
      const key = this.encryptionKeys.get(keyId);
      const keyInfo = this.keyVersions.get(keyId);
      
      if (!key || !keyInfo) {
        throw new Error(`指定的加密密钥 ${keyId} 不存在`);
      }
      
      // 选择加密算法
      const algorithm = options.algorithm || keyInfo.algorithm || this.algorithms.primary;
      
      // 生成随机IV
      const iv = crypto.randomBytes(this.ivLength);
      
      // 创建加密器
      const cipher = crypto.createCipheriv(
        algorithm,
        key,
        iv,
        { authTagLength: this.tagLength }
      );
      
      // 转换数据为字符串
      const plaintext = typeof data === 'object' ? JSON.stringify(data) : String(data);
      
      // 加密数据
      let encrypted = cipher.update(plaintext, 'utf8', this.encoding);
      encrypted += cipher.final(this.encoding);
      
      // 获取认证标签
      const authTag = cipher.getAuthTag();
      
      // 构建加密结果
      const encryptedData = {
        version: keyInfo.version,
        keyId: keyId,
        algorithm,
        iv: iv.toString(this.encoding),
        data: encrypted,
        authTag: authTag.toString(this.encoding),
        timestamp: Date.now(),
        hmac: '' // 将填充HMAC
      };
      
      // 添加HMAC完整性保护
      encryptedData.hmac = this._generateHmac(encryptedData);
      
      return encryptedData;
    } catch (error) {
      this.operationCount.failed++;
      logger.error('数据加密失败', {
        error: error.message,
        options,
        stack: error.stack
      });
      throw new Error('数据加密失败: ' + error.message);
    }
  }

  /**
   * 解密数据 - 增强版
   * @param {Object} encryptedData - 加密的数据对象
   * @param {Object} options - 解密选项
   * @returns {string|Object} 解密后的数据
   */
  async decrypt(encryptedData, options = {}) {
    try {
      // 增加计数
      this.operationCount.decrypt++;
      
      // 验证加密数据格式
      this._validateEncryptedData(encryptedData);
      
      // 验证HMAC完整性
      if (!this._verifyHmac(encryptedData)) {
        throw new Error('数据完整性验证失败，数据可能被篡改');
      }
      
      const { keyId, algorithm, iv, data, authTag } = encryptedData;
      
      // 获取解密密钥
      if (!this.encryptionKeys.has(keyId)) {
        throw new Error(`解密密钥 ${keyId} 不存在`);
      }
      
      const key = this.encryptionKeys.get(keyId);
      
      // 创建解密器
      const decipher = crypto.createDecipheriv(
        algorithm,
        key,
        Buffer.from(iv, this.encoding),
        { authTagLength: this.tagLength }
      );
      
      // 设置认证标签
      decipher.setAuthTag(Buffer.from(authTag, this.encoding));
      
      // 解密数据
      let decrypted = decipher.update(data, this.encoding, 'utf8');
      decrypted += decipher.final('utf8');
      
      // 尝试解析JSON
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      this.operationCount.failed++;
      logger.error('数据解密失败', {
        error: error.message,
        encryptedData: {
          keyId: encryptedData?.keyId,
          version: encryptedData?.version,
          algorithm: encryptedData?.algorithm
        },
        stack: error.stack
      });
      throw new Error('数据解密失败: ' + error.message);
    }
  }

  /**
   * 验证加密数据格式
   * @private
   * @param {Object} encryptedData - 加密数据
   */
  _validateEncryptedData(encryptedData) {
    if (!encryptedData) {
      throw new Error('加密数据为空');
    }
    
    const requiredFields = ['version', 'keyId', 'algorithm', 'iv', 'data', 'authTag'];
    for (const field of requiredFields) {
      if (!encryptedData[field]) {
        throw new Error(`加密数据缺少必要字段: ${field}`);
      }
    }
    
    // 验证算法
    const validAlgorithms = [
      this.algorithms.primary, 
      this.algorithms.secondary, 
      this.algorithms.fallback
    ];
    
    if (!validAlgorithms.includes(encryptedData.algorithm)) {
      throw new Error(`不支持的加密算法: ${encryptedData.algorithm}`);
    }
  }

  /**
   * 为加密数据生成HMAC
   * @private
   * @param {Object} encryptedData - 加密数据
   * @returns {string} HMAC
   */
  _generateHmac(encryptedData) {
    // 创建要签名的数据字符串，不包括现有HMAC
    const { hmac, ...dataToSign } = encryptedData;
    
    // 序列化为排序后的JSON
    const serialized = this._canonicalJson(dataToSign);
    
    // 生成HMAC
    return crypto.createHmac(this.integrityAlgorithm, this.integritySecret)
      .update(serialized)
      .digest(this.encoding);
  }

  /**
   * 验证加密数据的HMAC
   * @private
   * @param {Object} encryptedData - 加密数据
   * @returns {boolean} 验证是否通过
   */
  _verifyHmac(encryptedData) {
    // 如果没有HMAC，认为是旧版数据，跳过验证
    if (!encryptedData.hmac) {
      logger.warn('加密数据没有HMAC完整性保护', {
        keyId: encryptedData.keyId,
        version: encryptedData.version
      });
      return true;
    }
    
    // 计算期望的HMAC
    const expectedHmac = this._generateHmac(encryptedData);
    
    // 使用恒定时间比较，防止计时攻击
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedHmac, this.encoding),
        Buffer.from(encryptedData.hmac, this.encoding)
      );
    } catch (error) {
      logger.error('HMAC验证错误', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * 将对象规范化为一致的JSON表示
   * @private
   * @param {Object} obj - 要序列化的对象
   * @returns {string} 规范化的JSON字符串
   */
  _canonicalJson(obj) {
    // 排序键并递归序列化
    const sortObjectKeys = (obj) => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }
      
      if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
      }
      
      return Object.keys(obj)
        .sort()
        .reduce((sorted, key) => {
          sorted[key] = sortObjectKeys(obj[key]);
          return sorted;
        }, {});
    };
    
    return JSON.stringify(sortObjectKeys(obj));
  }

  /**
   * 加密对象的指定字段
   * @param {Object} obj - 待处理对象
   * @param {Array<string>} fields - 需要加密的字段数组
   * @param {Object} options - 加密选项
   * @returns {Object} 处理后的对象
   */
  async encryptFields(obj, fields, options = {}) {
    try {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }
      
      const result = { ...obj };
      
      for (const field of fields) {
        if (obj[field] !== undefined && obj[field] !== null) {
          result[field] = await this.encrypt(obj[field], options);
        }
      }
      
      return result;
    } catch (error) {
      logger.error('加密对象字段失败', {
        error: error.message,
        fields,
        stack: error.stack
      });
      throw new Error('加密对象字段失败: ' + error.message);
    }
  }

  /**
   * 解密对象的指定字段
   * @param {Object} obj - 待处理对象
   * @param {Array<string>} fields - 需要解密的字段数组
   * @param {Object} options - 解密选项
   * @returns {Object} 处理后的对象
   */
  async decryptFields(obj, fields, options = {}) {
    try {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }
      
      const result = { ...obj };
      
      for (const field of fields) {
        if (obj[field] !== undefined && obj[field] !== null) {
          try {
            result[field] = await this.decrypt(obj[field], options);
          } catch (fieldError) {
            logger.warn(`无法解密字段 ${field}`, {
              error: fieldError.message
            });
            // 对于解密错误，保留原始加密数据
            result[field] = obj[field];
          }
        }
      }
      
      return result;
    } catch (error) {
      logger.error('解密对象字段失败', {
        error: error.message,
        fields,
        stack: error.stack
      });
      throw new Error('解密对象字段失败: ' + error.message);
    }
  }

  /**
   * 创建Mongoose加密中间件
   * @param {Array<string>} fields - 需要加密的字段
   * @param {Object} options - 加密选项
   * @returns {Function} Mongoose中间件
   */
  createMongooseEncryptionPlugin(fields, options = {}) {
    const self = this;
    
    return function(schema) {
      // 在保存前加密字段
      schema.pre('save', async function(next) {
        try {
          const doc = this;
          
          for (const field of fields) {
            if (doc.isModified(field)) {
              doc[field] = await self.encrypt(doc[field], options);
            }
          }
          
          next();
        } catch (error) {
          next(error);
        }
      });

      // 在查询后解密字段
      schema.post('find', async function(docs) {
        try {
          if (!Array.isArray(docs)) return;
          
          for (const doc of docs) {
            for (const field of fields) {
              if (doc[field]) {
                try {
                  doc[field] = await self.decrypt(doc[field], options);
                } catch (fieldError) {
                  logger.warn(`查询结果解密字段 ${field} 失败`, {
                    error: fieldError.message,
                    docId: doc._id
                  });
                }
              }
            }
          }
        } catch (error) {
          logger.error('查询后解密失败', {
            error: error.message,
            stack: error.stack
          });
        }
      });

      // 在findOne后解密字段
      schema.post('findOne', async function(doc) {
        if (!doc) return;
        
        try {
          for (const field of fields) {
            if (doc[field]) {
              try {
                doc[field] = await self.decrypt(doc[field], options);
              } catch (fieldError) {
                logger.warn(`findOne结果解密字段 ${field} 失败`, {
                  error: fieldError.message,
                  docId: doc._id
                });
              }
            }
          }
        } catch (error) {
          logger.error('findOne后解密失败', {
            error: error.message,
            stack: error.stack
          });
        }
      });
    };
  }

  /**
   * 轮换加密密钥
   * @param {Object} options - 轮换选项
   * @returns {string} 新密钥ID
   */
  async rotateEncryptionKey(options = {}) {
    try {
      logger.info('开始加密密钥轮换');
      
      // 记录旧密钥
      const oldKeyId = this.activeKeyId;
      const oldKey = this.encryptionKeys.get(oldKeyId);
      
      if (!oldKey) {
        throw new Error('找不到当前活动密钥');
      }
      
      // 生成新密钥
      const newKeyId = this._generateNewEncryptionKey();
      
      // 记录轮换
      this.lastKeyRotation = Date.now();
      
      // 如果提供了重新加密回调，调用它
      if (typeof options.reencryptCallback === 'function') {
        await options.reencryptCallback(newKeyId, oldKeyId);
      }
      
      logger.info('加密密钥轮换完成', {
        oldKeyId,
        newKeyId
      });
      
      return newKeyId;
    } catch (error) {
      logger.error('加密密钥轮换失败', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('密钥轮换失败: ' + error.message);
    }
  }

  /**
   * 重新加密数据
   * @param {Object} encryptedData - 加密数据
   * @param {string} targetKeyId - 目标密钥ID
   * @returns {Object} 重新加密的数据
   */
  async reencrypt(encryptedData, targetKeyId = null) {
    try {
      // 验证数据
      this._validateEncryptedData(encryptedData);
      
      // 如果没有指定目标密钥，使用当前活动密钥
      const newKeyId = targetKeyId || this.activeKeyId;
      
      // 如果数据已经使用目标密钥加密，直接返回
      if (encryptedData.keyId === newKeyId) {
        return encryptedData;
      }
      
      // 解密数据
      const decrypted = await this.decrypt(encryptedData);
      
      // 使用新密钥重新加密
      return await this.encrypt(decrypted, { keyId: newKeyId });
    } catch (error) {
      logger.error('重新加密数据失败', {
        error: error.message,
        fromKeyId: encryptedData?.keyId,
        toKeyId: targetKeyId,
        stack: error.stack
      });
      throw new Error('重新加密失败: ' + error.message);
    }
  }

  /**
   * 获取加密状态信息
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      activeKeyId: this.activeKeyId,
      keyCount: this.encryptionKeys.size,
      lastRotation: this.lastKeyRotation,
      operationCount: { ...this.operationCount },
      algorithm: this.algorithms.primary,
      keyVersions: Array.from(this.keyVersions.entries()).map(([id, info]) => ({
        id,
        version: info.version,
        created: info.created,
        isActive: id === this.activeKeyId
      }))
    };
  }
}

// 导出单例
module.exports = new DatabaseEncryption(); 