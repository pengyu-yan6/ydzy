/**
 * 基于角色的访问控制(RBAC)系统 - 安全强化版
 */
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config/security.config');

class RBACManager {
  constructor() {
    // 角色定义
    this.roles = new Map();
    
    // 权限定义
    this.permissions = new Map();
    
    // 资源定义
    this.resources = new Map();
    
    // 权限缓存
    this.permissionCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5分钟缓存过期
    
    // 安全审计
    this.securityAuditTrail = [];
    this.maxAuditEntries = 1000;
    
    // 初始化默认角色和权限
    this._initializeDefaults();
    
    // 定期清理权限缓存
    setInterval(() => this._cleanupPermissionCache(), 15 * 60 * 1000);
  }

  /**
   * 初始化默认角色和权限
   * @private
   */
  _initializeDefaults() {
    try {
      // 基础权限
      this.addPermission('read', '读取权限');
      this.addPermission('write', '写入权限');
      this.addPermission('delete', '删除权限');
      this.addPermission('admin', '管理权限');
      
      // 资源特定权限
      this.addPermission('user:read', '读取用户信息');
      this.addPermission('user:write', '修改用户信息');
      this.addPermission('payment:read', '查看支付信息');
      this.addPermission('payment:process', '处理支付');
      this.addPermission('system:config', '系统配置管理');
      
      // 默认角色
      this.addRole('guest', '访客', ['read']);
      this.addRole('user', '普通用户', ['read', 'write', 'user:read']);
      this.addRole('moderator', '版主', ['read', 'write', 'delete', 'user:read']);
      this.addRole('admin', '管理员', ['read', 'write', 'delete', 'admin', 'user:read', 'user:write', 'payment:read']);
      this.addRole('superadmin', '超级管理员', ['*']); // 所有权限
      
      // 添加默认资源
      this.addResource('user', '用户管理', {
        owner: 'system',
        securityLevel: 'high'
      });
      this.addResource('game', '游戏管理', {
        owner: 'system',
        securityLevel: 'medium'
      });
      this.addResource('payment', '支付管理', {
        owner: 'system',
        securityLevel: 'critical'
      });
      this.addResource('log', '日志管理', {
        owner: 'system',
        securityLevel: 'high'
      });
      this.addResource('config', '配置管理', {
        owner: 'system',
        securityLevel: 'critical'
      });
      
      logger.info('RBAC系统初始化完成');
    } catch (error) {
      logger.error('RBAC系统初始化失败', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('权限系统初始化失败，系统无法启动');
    }
  }

  /**
   * 添加角色
   * @param {string} name - 角色名称
   * @param {string} description - 角色描述
   * @param {Array<string>} permissions - 权限列表
   * @param {Object} options - 附加选项
   */
  addRole(name, description, permissions = [], options = {}) {
    try {
      if (this.roles.has(name)) {
        throw new Error('角色已存在');
      }

      // 添加附加安全属性
      this.roles.set(name, {
        name,
        description,
        permissions: new Set(permissions),
        securityLevel: options.securityLevel || 'normal',
        requiresMFA: options.requiresMFA || false,
        maxInactiveTime: options.maxInactiveTime || 30 * 60 * 1000, // 默认30分钟
        ipRestrictions: options.ipRestrictions || [],
        timeRestrictions: options.timeRestrictions || [],
        createdAt: Date.now(),
        createdBy: options.createdBy || 'system',
        status: 'active'
      });

      // 更新权限缓存
      this._invalidateRoleCache(name);

      // 记录安全日志
      this._addSecurityAudit('ROLE_CREATED', {
        role: name,
        permissions: [...permissions],
        by: options.createdBy || 'system'
      });

      logger.info('添加角色成功', {
        name,
        description,
        permissions,
        options
      });
    } catch (error) {
      logger.error('添加角色失败', {
        error: error.message,
        name,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 添加权限
   * @param {string} name - 权限名称
   * @param {string} description - 权限描述
   * @param {Object} options - 附加选项
   */
  addPermission(name, description, options = {}) {
    try {
      if (this.permissions.has(name)) {
        throw new Error('权限已存在');
      }

      this.permissions.set(name, {
        name,
        description,
        securityLevel: options.securityLevel || 'normal',
        requiresApproval: options.requiresApproval || false,
        auditTrail: options.auditTrail || true,
        riskLevel: options.riskLevel || 'low',
        createdAt: Date.now(),
        createdBy: options.createdBy || 'system'
      });

      // 记录安全日志
      this._addSecurityAudit('PERMISSION_CREATED', {
        permission: name,
        by: options.createdBy || 'system'
      });

      logger.info('添加权限成功', {
        name,
        description,
        options
      });
    } catch (error) {
      logger.error('添加权限失败', {
        error: error.message,
        name,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 添加资源
   * @param {string} name - 资源名称
   * @param {string} description - 资源描述
   * @param {Object} options - 附加选项
   */
  addResource(name, description, options = {}) {
    try {
      if (this.resources.has(name)) {
        throw new Error('资源已存在');
      }

      this.resources.set(name, {
        name,
        description,
        securityLevel: options.securityLevel || 'normal',
        owner: options.owner || 'system',
        accessControl: options.accessControl || 'role-based', // role-based, attribute-based
        encryptionRequired: options.encryptionRequired || false,
        retentionPolicy: options.retentionPolicy || 'standard',
        createdAt: Date.now(),
        createdBy: options.createdBy || 'system',
        status: 'active'
      });

      // 记录安全日志
      this._addSecurityAudit('RESOURCE_CREATED', {
        resource: name,
        by: options.createdBy || 'system'
      });

      logger.info('添加资源成功', {
        name,
        description,
        options
      });
    } catch (error) {
      logger.error('添加资源失败', {
        error: error.message,
        name,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 检查权限 - 增强版
   * @param {string} role - 角色名称
   * @param {string} permission - 权限名称
   * @param {string} resource - 资源名称
   * @param {Object} context - 上下文信息
   * @returns {boolean} 是否有权限
   */
  checkPermission(role, permission, resource, context = {}) {
    try {
      // 先检查缓存
      const cacheKey = this._getCacheKey(role, permission, resource);
      const cachedResult = this._getFromCache(cacheKey);
      
      if (cachedResult !== undefined) {
        return cachedResult;
      }
      
      // 获取角色信息
      const roleInfo = this.roles.get(role);
      if (!roleInfo) {
        this._addSecurityAudit('PERMISSION_CHECK_FAILED', {
          role,
          permission,
          resource,
          reason: 'ROLE_NOT_FOUND'
        });
        this._setInCache(cacheKey, false);
        return false;
      }
      
      // 检查角色状态
      if (roleInfo.status !== 'active') {
        this._addSecurityAudit('PERMISSION_CHECK_FAILED', {
          role,
          permission,
          resource,
          reason: 'ROLE_INACTIVE'
        });
        this._setInCache(cacheKey, false);
        return false;
      }

      // 超级管理员拥有所有权限
      if (role === 'superadmin' || roleInfo.permissions.has('*')) {
        this._setInCache(cacheKey, true);
        return true;
      }
      
      // 资源级权限检查
      const resourceInfo = this.resources.get(resource);
      
      // 如果资源存在且设置了安全级别
      if (resourceInfo && resourceInfo.securityLevel === 'critical') {
        // 严格权限检查
        if (roleInfo.securityLevel !== 'high' && role !== 'admin') {
          this._addSecurityAudit('PERMISSION_CHECK_FAILED', {
            role,
            permission,
            resource,
            reason: 'INSUFFICIENT_SECURITY_LEVEL'
          });
          this._setInCache(cacheKey, false);
          return false;
        }
        
        // 关键资源可能需要MFA
        if (resourceInfo.securityLevel === 'critical' && roleInfo.requiresMFA) {
          if (!context.mfaVerified) {
            this._addSecurityAudit('PERMISSION_CHECK_FAILED', {
              role,
              permission,
              resource,
              reason: 'MFA_REQUIRED'
            });
            this._setInCache(cacheKey, false);
            return false;
          }
        }
      }
      
      // 时间限制检查
      if (roleInfo.timeRestrictions && roleInfo.timeRestrictions.length > 0) {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay(); // 0-6, 0表示周日
        
        const allowed = roleInfo.timeRestrictions.some(restriction => {
          if (restriction.days && !restriction.days.includes(day)) {
            return false;
          }
          
          if (restriction.hours) {
            const [start, end] = restriction.hours;
            if (hour < start || hour >= end) {
              return false;
            }
          }
          
          return true;
        });
        
        if (!allowed) {
          this._addSecurityAudit('PERMISSION_CHECK_FAILED', {
            role,
            permission,
            resource,
            reason: 'TIME_RESTRICTION'
          });
          this._setInCache(cacheKey, false);
          return false;
        }
      }
      
      // IP限制检查
      if (roleInfo.ipRestrictions && roleInfo.ipRestrictions.length > 0 && context.ip) {
        if (!this._checkIpAllowed(context.ip, roleInfo.ipRestrictions)) {
          this._addSecurityAudit('PERMISSION_CHECK_FAILED', {
            role,
            permission,
            resource,
            ip: context.ip,
            reason: 'IP_RESTRICTION'
          });
          this._setInCache(cacheKey, false);
          return false;
        }
      }

      // 检查资源特定权限
      const resourceSpecificPermission = `${resource}:${permission}`;
      if (roleInfo.permissions.has(resourceSpecificPermission)) {
        this._setInCache(cacheKey, true);
        return true;
      }

      // 检查一般权限
      const hasPermission = roleInfo.permissions.has(permission);
      this._setInCache(cacheKey, hasPermission);
      
      if (!hasPermission) {
        this._addSecurityAudit('PERMISSION_CHECK_FAILED', {
          role,
          permission,
          resource,
          reason: 'PERMISSION_NOT_GRANTED'
        });
      }
      
      return hasPermission;
    } catch (error) {
      logger.error('检查权限失败', {
        error: error.message,
        role,
        permission,
        resource,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * 检查IP是否在允许列表中
   * @private
   * @param {string} ip - IP地址
   * @param {Array<string>} allowedIps - 允许的IP列表
   * @returns {boolean} 是否允许
   */
  _checkIpAllowed(ip, allowedIps) {
    return allowedIps.some(allowed => {
      // 精确匹配
      if (allowed === ip) return true;
      
      // CIDR匹配
      if (allowed.includes('/')) {
        return this._ipInCidr(ip, allowed);
      }
      
      // 范围匹配 (192.168.1.*)
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\./g, '\\.').replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(ip);
      }
      
      return false;
    });
  }
  
  /**
   * 检查IP是否在CIDR范围内
   * @private
   * @param {string} ip - IP地址
   * @param {string} cidr - CIDR表示法
   * @returns {boolean} 是否在范围内
   */
  _ipInCidr(ip, cidr) {
    // 简单实现，生产环境建议使用专业库
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    
    // 转换IP为数字
    const ipNum = ip.split('.').reduce((sum, octet) => {
      return (sum << 8) + parseInt(octet);
    }, 0) >>> 0;
    
    const rangeNum = range.split('.').reduce((sum, octet) => {
      return (sum << 8) + parseInt(octet);
    }, 0) >>> 0;
    
    return (ipNum & mask) === (rangeNum & mask);
  }

  /**
   * 创建权限检查中间件 - 增强版
   * @param {string} permission - 所需权限
   * @param {string} resource - 资源名称
   * @param {Object} options - 中间件选项
   * @returns {Function} Express中间件
   */
  requirePermission(permission, resource, options = {}) {
    return (req, res, next) => {
      // 检查用户是否已认证
      if (!req.user) {
        logger.warn('未认证的访问尝试', {
          path: req.path,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
        
        return res.status(401).json({
          success: false,
          message: '未认证的访问',
          error: 'UNAUTHORIZED'
        });
      }

      // 获取用户角色
      const role = req.user.role || 'guest';
      
      // 构建上下文信息
      const context = {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        mfaVerified: req.session?.mfaVerified || false,
        timestamp: Date.now(),
        requestId: req.id,
        path: req.path
      };

      // 检查权限
      if (!this.checkPermission(role, permission, resource, context)) {
        // 记录权限拒绝
        logger.warn('权限检查失败', {
          userId: req.user.id,
          role,
          permission,
          resource,
          path: req.path,
          ip: req.ip
        });
        
        // 添加安全审计
        this._addSecurityAudit('ACCESS_DENIED', {
          userId: req.user.id,
          role,
          permission,
          resource,
          ip: req.ip,
          path: req.path
        });
        
        // 特殊处理：如果是因为需要MFA
        if (req.session && this.roles.get(role)?.requiresMFA && !req.session.mfaVerified) {
          return res.status(403).json({
            success: false,
            message: '需要多因素认证',
            error: 'MFA_REQUIRED'
          });
        }

        return res.status(403).json({
          success: false,
          message: '没有足够的权限',
          error: 'FORBIDDEN'
        });
      }
      
      // 记录成功访问
      if (options.auditSuccess) {
        this._addSecurityAudit('ACCESS_GRANTED', {
          userId: req.user.id,
          role,
          permission,
          resource,
          ip: req.ip,
          path: req.path
        });
      }

      next();
    };
  }

  /**
   * 获取角色的所有权限
   * @param {string} role - 角色名称
   * @returns {Array<string>} 权限列表
   */
  getRolePermissions(role) {
    const roleInfo = this.roles.get(role);
    return roleInfo ? Array.from(roleInfo.permissions) : [];
  }

  /**
   * 更新角色权限
   * @param {string} role - 角色名称
   * @param {Array<string>} permissions - 新的权限列表
   * @param {Object} options - 更新选项
   */
  updateRolePermissions(role, permissions, options = {}) {
    try {
      const roleInfo = this.roles.get(role);
      if (!roleInfo) {
        throw new Error('角色不存在');
      }
      
      // 权限变更审计
      const oldPermissions = Array.from(roleInfo.permissions);
      const addedPermissions = permissions.filter(p => !roleInfo.permissions.has(p));
      const removedPermissions = oldPermissions.filter(p => !permissions.includes(p));

      // 更新权限
      roleInfo.permissions = new Set(permissions);
      roleInfo.updatedAt = Date.now();
      roleInfo.updatedBy = options.updatedBy || 'system';

      // 安全审计
      this._addSecurityAudit('ROLE_PERMISSIONS_UPDATED', {
        role,
        addedPermissions,
        removedPermissions,
        by: options.updatedBy || 'system'
      });
      
      // 清除权限缓存
      this._invalidateRoleCache(role);

      logger.info('更新角色权限成功', {
        role,
        addedPermissions,
        removedPermissions,
        by: options.updatedBy || 'system'
      });
    } catch (error) {
      logger.error('更新角色权限失败', {
        error: error.message,
        role,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 删除角色
   * @param {string} name - 角色名称
   * @param {Object} options - 删除选项
   */
  deleteRole(name, options = {}) {
    try {
      if (!this.roles.has(name)) {
        throw new Error('角色不存在');
      }

      // 检查是否是默认角色
      if (['guest', 'user', 'admin', 'superadmin'].includes(name)) {
        throw new Error('不能删除默认角色');
      }
      
      // 如果提供了执行人，进行额外的权限检查
      if (options.deletedBy && options.deletedBy !== 'system') {
        if (options.deletedBy !== 'superadmin') {
          const audit = {
            action: 'ROLE_DELETE_ATTEMPTED',
            role: name,
            by: options.deletedBy,
            timestamp: Date.now(),
            status: 'REJECTED',
            reason: 'INSUFFICIENT_PRIVILEGES'
          };
          
          this._addSecurityAudit('ROLE_DELETE_REJECTED', audit);
          
          throw new Error('没有删除角色的权限');
        }
      }

      // 获取角色信息用于审计
      const roleInfo = this.roles.get(name);
      
      // 删除角色
      this.roles.delete(name);
      
      // 清除权限缓存
      this._invalidateRoleCache(name);
      
      // 安全审计
      this._addSecurityAudit('ROLE_DELETED', {
        role: name,
        permissions: Array.from(roleInfo.permissions),
        by: options.deletedBy || 'system'
      });

      logger.info('删除角色成功', { 
        name,
        by: options.deletedBy || 'system'
      });
    } catch (error) {
      logger.error('删除角色失败', {
        error: error.message,
        name,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * 获取缓存键
   * @private
   * @param {string} role - 角色
   * @param {string} permission - 权限
   * @param {string} resource - 资源
   * @returns {string} 缓存键
   */
  _getCacheKey(role, permission, resource) {
    return `${role}:${permission}:${resource}`;
  }
  
  /**
   * 从缓存获取结果
   * @private
   * @param {string} key - 缓存键
   * @returns {boolean|undefined} 缓存结果
   */
  _getFromCache(key) {
    const cached = this.permissionCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.result;
    }
    return undefined;
  }
  
  /**
   * 设置缓存
   * @private
   * @param {string} key - 缓存键
   * @param {boolean} result - 缓存结果
   */
  _setInCache(key, result) {
    this.permissionCache.set(key, {
      result,
      expires: Date.now() + this.cacheTTL
    });
  }
  
  /**
   * 清理过期缓存
   * @private
   */
  _cleanupPermissionCache() {
    const now = Date.now();
    let count = 0;
    
    for (const [key, cached] of this.permissionCache.entries()) {
      if (cached.expires <= now) {
        this.permissionCache.delete(key);
        count++;
      }
    }
    
    if (count > 0) {
      logger.debug('清理权限缓存', { count });
    }
  }
  
  /**
   * 使角色的缓存失效
   * @private
   * @param {string} role - 角色名称
   */
  _invalidateRoleCache(role) {
    const keysToDelete = [];
    
    for (const key of this.permissionCache.keys()) {
      if (key.startsWith(`${role}:`)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.permissionCache.delete(key);
    }
    
    logger.debug('清除角色缓存', { role, count: keysToDelete.length });
  }
  
  /**
   * 添加安全审计记录
   * @private
   * @param {string} action - 操作类型
   * @param {Object} data - 审计数据
   */
  _addSecurityAudit(action, data) {
    // 创建审计记录
    const auditEntry = {
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now(),
      action,
      data,
      hash: '' // 将计算哈希以确保完整性
    };
    
    // 计算哈希以保证审计记录完整性
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify({
        timestamp: auditEntry.timestamp,
        action: auditEntry.action,
        data: auditEntry.data,
        previousHash: this.securityAuditTrail.length > 0 
          ? this.securityAuditTrail[this.securityAuditTrail.length - 1].hash 
          : ''
      }))
      .digest('hex');
    
    auditEntry.hash = hash;
    
    // 添加到审计跟踪
    this.securityAuditTrail.push(auditEntry);
    
    // 限制审计记录数量
    if (this.securityAuditTrail.length > this.maxAuditEntries) {
      this.securityAuditTrail.shift();
    }
    
    // 特定事件可能需要额外操作（如发送警报）
    if (['ACCESS_DENIED', 'ROLE_PERMISSIONS_UPDATED', 'ROLE_DELETED'].includes(action)) {
      // 在实际系统中可能发送通知或警报
      logger.warn('安全事件', { action, data });
    }
  }
  
  /**
   * 验证审计跟踪完整性
   * @returns {boolean} 审计跟踪是否完整
   */
  verifyAuditIntegrity() {
    try {
      if (this.securityAuditTrail.length === 0) {
        return true;
      }
      
      let previousHash = '';
      
      for (let i = 0; i < this.securityAuditTrail.length; i++) {
        const entry = this.securityAuditTrail[i];
        
        // 计算哈希
        const expectedHash = crypto.createHash('sha256')
          .update(JSON.stringify({
            timestamp: entry.timestamp,
            action: entry.action,
            data: entry.data,
            previousHash
          }))
          .digest('hex');
        
        // 验证哈希
        if (expectedHash !== entry.hash) {
          logger.error('审计跟踪完整性检查失败', {
            index: i,
            expectedHash,
            actualHash: entry.hash
          });
          return false;
        }
        
        previousHash = entry.hash;
      }
      
      return true;
    } catch (error) {
      logger.error('验证审计跟踪完整性失败', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }
  
  /**
   * 获取安全审计日志
   * @param {Object} query - 查询条件
   * @returns {Array} 审计记录
   */
  getSecurityAuditLogs(query = {}) {
    try {
      let logs = [...this.securityAuditTrail];
      
      // 按条件筛选
      if (query.action) {
        logs = logs.filter(log => log.action === query.action);
      }
      
      if (query.startTime) {
        logs = logs.filter(log => log.timestamp >= query.startTime);
      }
      
      if (query.endTime) {
        logs = logs.filter(log => log.timestamp <= query.endTime);
      }
      
      // 按时间排序
      logs.sort((a, b) => b.timestamp - a.timestamp);
      
      // 分页
      if (query.limit) {
        const start = query.offset || 0;
        const end = start + query.limit;
        logs = logs.slice(start, end);
      }
      
      return logs;
    } catch (error) {
      logger.error('获取安全审计日志失败', {
        error: error.message,
        query,
        stack: error.stack
      });
      return [];
    }
  }
  
  /**
   * 检查资源所有权
   * @param {string} userId - 用户ID
   * @param {string} resourceType - 资源类型
   * @param {string} resourceId - 资源ID
   * @param {Object} context - 额外上下文
   * @returns {boolean} 是否拥有资源
   */
  checkResourceOwnership(userId, resourceType, resourceId, context = {}) {
    try {
      // 在实际系统中，这里应该查询数据库
      // 这里是一个示例实现
      
      // 超级管理员可以访问所有资源
      if (context.userRole === 'superadmin' || context.userRole === 'admin') {
        return true;
      }
      
      // 模拟资源所有权查询
      // 实际应用中应查询数据库
      const resourceOwnerId = context.resourceOwnerId;
      
      if (!resourceOwnerId) {
        return false;
      }
      
      return userId === resourceOwnerId;
    } catch (error) {
      logger.error('检查资源所有权失败', {
        error: error.message,
        userId,
        resourceType,
        resourceId,
        stack: error.stack
      });
      return false;
    }
  }
}

// 导出单例
module.exports = new RBACManager(); 