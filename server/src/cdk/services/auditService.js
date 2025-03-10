/**
 * CDK审计服务
 * 实现CDK全生命周期的审计跟踪和安全分析
 */

const mongoose = require('mongoose');
const { CDK, CDK_STATUS } = require('../models/CDK');
const CDKBatch = require('../models/CDKBatch');
const logger = require('../../utils/logger');

// 定义审计事件类型
const AUDIT_EVENTS = {
  GENERATE: 'generate',
  ACTIVATE: 'activate',
  USE: 'use',
  REVOKE: 'revoke',
  EXPIRE: 'expire',
  EXPORT: 'export',
  BATCH_CREATE: 'batch_create',
  BATCH_REVOKE: 'batch_revoke',
  ACCESS_DENIED: 'access_denied',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity'
};

// 定义风险级别
const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * 记录CDK操作审计
 * @param {string} cdkId - CDK ID
 * @param {string} eventType - 事件类型
 * @param {string} userId - 用户ID
 * @param {Object} eventDetails - 事件详情
 * @returns {Promise<Object>} 审计记录
 */
async function logCDKAudit(cdkId, eventType, userId, eventDetails = {}) {
  try {
    const { ip, deviceInfo } = eventDetails;
    
    // 创建审计记录
    const auditEntry = {
      action: eventType,
      performedBy: userId,
      timestamp: new Date(),
      ipAddress: ip,
      details: eventDetails
    };
    
    // 添加到CDK的审计记录
    const updateResult = await CDK.updateOne(
      { _id: cdkId },
      {
        $push: {
          auditTrail: auditEntry,
          ...(eventType === AUDIT_EVENTS.USE || eventType === AUDIT_EVENTS.ACTIVATE ? {
            usageHistory: {
              timestamp: new Date(),
              userId,
              ip,
              deviceInfo,
              action: eventType === AUDIT_EVENTS.USE ? 'use' : 'activate',
              actionBy: userId
            }
          } : {})
        }
      }
    );
    
    if (updateResult.modifiedCount === 0) {
      logger.warn('无法记录CDK审计，CDK不存在或无法修改', {
        cdkId,
        eventType,
        userId
      });
    }
    
    // 记录敏感操作到系统日志
    if ([AUDIT_EVENTS.REVOKE, AUDIT_EVENTS.ACCESS_DENIED, AUDIT_EVENTS.SUSPICIOUS_ACTIVITY].includes(eventType)) {
      logger.warn('CDK敏感操作', {
        cdkId,
        eventType,
        userId,
        ip,
        details: eventDetails
      });
    }
    
    return auditEntry;
  } catch (error) {
    logger.error('记录CDK审计失败', {
      error: error.message,
      stack: error.stack,
      cdkId,
      eventType,
      userId
    });
    
    // 失败时仍返回一个对象，保证调用方可以继续执行
    return {
      action: eventType,
      performedBy: userId,
      timestamp: new Date(),
      error: error.message
    };
  }
}

/**
 * 记录批次操作审计
 * @param {string} batchId - 批次ID
 * @param {string} eventType - 事件类型
 * @param {string} userId - 用户ID
 * @param {Object} eventDetails - 事件详情
 * @returns {Promise<Object>} 审计记录
 */
async function logBatchAudit(batchId, eventType, userId, eventDetails = {}) {
  try {
    const { ip } = eventDetails;
    
    // 创建审计记录
    const auditEntry = {
      action: eventType,
      performedBy: userId,
      timestamp: new Date(),
      ipAddress: ip,
      details: eventDetails
    };
    
    // 添加到批次的审计记录
    const updateResult = await CDKBatch.updateOne(
      { batchId },
      {
        $push: {
          auditTrail: auditEntry
        }
      }
    );
    
    if (updateResult.modifiedCount === 0) {
      logger.warn('无法记录批次审计，批次不存在或无法修改', {
        batchId,
        eventType,
        userId
      });
    }
    
    return auditEntry;
  } catch (error) {
    logger.error('记录批次审计失败', {
      error: error.message,
      stack: error.stack,
      batchId,
      eventType,
      userId
    });
    
    return {
      action: eventType,
      performedBy: userId,
      timestamp: new Date(),
      error: error.message
    };
  }
}

/**
 * 记录可疑活动
 * @param {string} cdkId - CDK ID
 * @param {string} userId - 用户ID
 * @param {string} activityType - 活动类型
 * @param {Object} details - 活动详情
 * @param {string} riskLevel - 风险级别
 * @returns {Promise<Object>} 审计记录
 */
async function logSuspiciousActivity(cdkId, userId, activityType, details = {}, riskLevel = RISK_LEVELS.MEDIUM) {
  try {
    const eventDetails = {
      ...details,
      activityType,
      riskLevel,
      detectedAt: new Date()
    };
    
    // 记录到审计系统
    const auditEntry = await logCDKAudit(
      cdkId,
      AUDIT_EVENTS.SUSPICIOUS_ACTIVITY,
      userId,
      eventDetails
    );
    
    // 高风险活动额外处理
    if (riskLevel === RISK_LEVELS.HIGH || riskLevel === RISK_LEVELS.CRITICAL) {
      // 1. 记录警告日志
      logger.warn('检测到高风险CDK活动', {
        cdkId,
        userId,
        activityType,
        riskLevel,
        details
      });
      
      // 2. 对于关键风险，可能需要自动采取行动
      if (riskLevel === RISK_LEVELS.CRITICAL) {
        // 例如自动锁定CDK
        await CDK.updateOne(
          { _id: cdkId },
          {
            $set: {
              status: CDK_STATUS.REVOKED,
              revokedAt: new Date(),
              revokeReason: '检测到关键安全风险，系统自动作废'
            }
          }
        );
        
        logger.warn('由于关键安全风险，已自动作废CDK', { cdkId, userId });
      }
    }
    
    return auditEntry;
  } catch (error) {
    logger.error('记录可疑活动失败', {
      error: error.message,
      stack: error.stack,
      cdkId,
      userId,
      activityType
    });
    
    return {
      action: AUDIT_EVENTS.SUSPICIOUS_ACTIVITY,
      performedBy: userId,
      timestamp: new Date(),
      error: error.message
    };
  }
}

/**
 * 记录访问拒绝事件
 * @param {string} cdkId - CDK ID
 * @param {string} userId - 用户ID
 * @param {string} reason - 拒绝原因
 * @param {Object} details - 额外详情
 * @returns {Promise<Object>} 审计记录
 */
async function logAccessDenied(cdkId, userId, reason, details = {}) {
  try {
    const eventDetails = {
      ...details,
      reason,
      deniedAt: new Date()
    };
    
    // 记录到审计系统
    return await logCDKAudit(
      cdkId,
      AUDIT_EVENTS.ACCESS_DENIED,
      userId,
      eventDetails
    );
  } catch (error) {
    logger.error('记录访问拒绝事件失败', {
      error: error.message,
      stack: error.stack,
      cdkId,
      userId,
      reason
    });
    
    return {
      action: AUDIT_EVENTS.ACCESS_DENIED,
      performedBy: userId,
      timestamp: new Date(),
      error: error.message
    };
  }
}

/**
 * 获取CDK的完整审计记录
 * @param {string} cdkId - CDK ID
 * @returns {Promise<Array>} 审计记录列表
 */
async function getCDKAuditTrail(cdkId) {
  try {
    const cdk = await CDK.findById(cdkId)
      .select('auditTrail usageHistory')
      .populate('auditTrail.performedBy', 'username')
      .populate('usageHistory.userId', 'username')
      .populate('usageHistory.actionBy', 'username');
    
    if (!cdk) {
      throw new Error('CDK不存在');
    }
    
    // 合并并按时间排序审计记录
    const auditTrail = [...cdk.auditTrail];
    
    // 按时间戳排序（最新的在前）
    auditTrail.sort((a, b) => b.timestamp - a.timestamp);
    
    return auditTrail;
  } catch (error) {
    logger.error('获取CDK审计记录失败', {
      error: error.message,
      stack: error.stack,
      cdkId
    });
    
    throw error;
  }
}

/**
 * 获取批次的完整审计记录
 * @param {string} batchId - 批次ID
 * @returns {Promise<Array>} 审计记录列表
 */
async function getBatchAuditTrail(batchId) {
  try {
    const batch = await CDKBatch.findOne({ batchId })
      .select('auditTrail')
      .populate('auditTrail.performedBy', 'username');
    
    if (!batch) {
      throw new Error('批次不存在');
    }
    
    // 按时间戳排序（最新的在前）
    const auditTrail = [...batch.auditTrail];
    auditTrail.sort((a, b) => b.timestamp - a.timestamp);
    
    return auditTrail;
  } catch (error) {
    logger.error('获取批次审计记录失败', {
      error: error.message,
      stack: error.stack,
      batchId
    });
    
    throw error;
  }
}

/**
 * 分析批次使用情况
 * @param {string} batchId - 批次ID
 * @returns {Promise<Object>} 使用情况分析
 */
async function analyzeBatchUsage(batchId) {
  try {
    const batch = await CDKBatch.findOne({ batchId });
    if (!batch) {
      throw new Error('批次不存在');
    }
    
    // 批次使用率
    const usageRate = batch.quantity > 0 
      ? (batch.usedCount / batch.quantity) * 100 
      : 0;
    
    // 获取该批次的使用时间分布
    const usageTimestamps = await CDK.aggregate([
      { $match: { batchId, status: CDK_STATUS.USED } },
      { $group: {
        _id: null,
        firstUsed: { $min: '$usedAt' },
        lastUsed: { $max: '$usedAt' },
        usageTimes: { $push: '$usedAt' }
      }}
    ]);
    
    let usageDistribution = null;
    let averageUsageTime = null;
    
    if (usageTimestamps.length > 0 && usageTimestamps[0].usageTimes.length > 0) {
      const times = usageTimestamps[0].usageTimes;
      
      // 计算使用时间分布
      const hourCounts = new Array(24).fill(0);
      const dayCounts = new Array(7).fill(0);
      
      times.forEach(time => {
        const date = new Date(time);
        hourCounts[date.getHours()]++;
        dayCounts[date.getDay()]++;
      });
      
      // 计算从激活到使用的平均时间（如果有这些数据）
      const cdksWithBothTimes = await CDK.find({
        batchId,
        status: CDK_STATUS.USED,
        activatedAt: { $exists: true },
        usedAt: { $exists: true }
      });
      
      if (cdksWithBothTimes.length > 0) {
        const totalMinutes = cdksWithBothTimes.reduce((sum, cdk) => {
          const activatedTime = new Date(cdk.activatedAt).getTime();
          const usedTime = new Date(cdk.usedAt).getTime();
          return sum + ((usedTime - activatedTime) / (1000 * 60)); // 转换为分钟
        }, 0);
        
        averageUsageTime = totalMinutes / cdksWithBothTimes.length;
      }
      
      usageDistribution = {
        byHour: hourCounts,
        byDay: dayCounts,
        peakHour: hourCounts.indexOf(Math.max(...hourCounts)),
        peakDay: dayCounts.indexOf(Math.max(...dayCounts))
      };
    }
    
    return {
      batchId: batch.batchId,
      name: batch.name,
      totalCount: batch.quantity,
      usedCount: batch.usedCount,
      activatedCount: batch.activatedCount,
      expiredCount: batch.expiredCount,
      revokedCount: batch.revokedCount,
      usageRate: usageRate.toFixed(2) + '%',
      usagePeriod: usageTimestamps.length > 0 ? {
        firstUsed: usageTimestamps[0].firstUsed,
        lastUsed: usageTimestamps[0].lastUsed,
        durationDays: usageTimestamps[0].firstUsed && usageTimestamps[0].lastUsed ? 
          Math.ceil((new Date(usageTimestamps[0].lastUsed) - new Date(usageTimestamps[0].firstUsed)) / (1000 * 60 * 60 * 24)) : 0
      } : null,
      usageDistribution,
      averageTimeToUse: averageUsageTime ? `${Math.round(averageUsageTime)} 分钟` : null
    };
  } catch (error) {
    logger.error('分析批次使用情况失败', {
      error: error.message,
      stack: error.stack,
      batchId
    });
    
    throw error;
  }
}

/**
 * 检测异常使用模式
 * @param {string} batchId - 批次ID
 * @returns {Promise<Array>} 异常使用列表
 */
async function detectAnomalousUsage(batchId) {
  try {
    // 1. 查找使用频率异常的用户
    const userFrequency = await CDK.aggregate([
      { $match: { batchId, status: CDK_STATUS.USED } },
      { $group: {
        _id: '$usedBy',
        count: { $sum: 1 },
        cdks: { $push: { id: '$_id', code: '$code', usedAt: '$usedAt' } }
      }},
      { $sort: { count: -1 } }
    ]);
    
    // 计算平均每个用户使用数量
    const totalUsed = userFrequency.reduce((sum, user) => sum + user.count, 0);
    const averagePerUser = totalUsed / userFrequency.length || 0;
    
    // 标准差
    const variance = userFrequency.reduce((sum, user) => {
      return sum + Math.pow(user.count - averagePerUser, 2);
    }, 0) / userFrequency.length || 0;
    const stdDev = Math.sqrt(variance);
    
    // 阈值：平均值 + 2个标准差
    const threshold = averagePerUser + (2 * stdDev);
    
    // 筛选异常用户
    const anomalousUsers = userFrequency.filter(user => user.count > threshold);
    
    // 2. 检测短时间内多次使用的情况
    const rapidUsage = [];
    for (const user of userFrequency) {
      if (user.cdks.length < 2) continue;
      
      // 按时间排序
      user.cdks.sort((a, b) => new Date(a.usedAt) - new Date(b.usedAt));
      
      // 检查相邻使用的时间间隔
      for (let i = 1; i < user.cdks.length; i++) {
        const prevTime = new Date(user.cdks[i-1].usedAt).getTime();
        const currTime = new Date(user.cdks[i].usedAt).getTime();
        const diffMinutes = (currTime - prevTime) / (1000 * 60);
        
        // 如果间隔小于1分钟，标记为异常
        if (diffMinutes < 1) {
          rapidUsage.push({
            userId: user._id,
            cdk1: user.cdks[i-1],
            cdk2: user.cdks[i],
            timeDiff: `${diffMinutes.toFixed(2)}分钟`,
            riskLevel: RISK_LEVELS.MEDIUM
          });
        }
      }
    }
    
    return {
      anomalousUsers: anomalousUsers.map(user => ({
        userId: user._id,
        usageCount: user.count,
        averageCount: averagePerUser.toFixed(2),
        threshold: threshold.toFixed(2),
        deviation: ((user.count - averagePerUser) / stdDev).toFixed(2) + '个标准差',
        riskLevel: user.count > (averagePerUser + 3 * stdDev) ? RISK_LEVELS.HIGH : RISK_LEVELS.MEDIUM
      })),
      rapidUsage
    };
  } catch (error) {
    logger.error('检测异常使用模式失败', {
      error: error.message,
      stack: error.stack,
      batchId
    });
    
    throw error;
  }
}

module.exports = {
  AUDIT_EVENTS,
  RISK_LEVELS,
  logCDKAudit,
  logBatchAudit,
  logSuspiciousActivity,
  logAccessDenied,
  getCDKAuditTrail,
  getBatchAuditTrail,
  analyzeBatchUsage,
  detectAnomalousUsage
}; 