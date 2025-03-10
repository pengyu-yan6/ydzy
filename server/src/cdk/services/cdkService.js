/**
 * CDK服务模块
 * 提供CDK相关功能，确保在高并发环境下安全操作
 */

const mongoose = require('mongoose');
const CDK = require('../models/CDK');
const CDKBatch = require('../models/CDKBatch');
const logger = require('../../utils/logger');
const encryptionUtils = require('../../utils/encryption');
const config = require('../../config');
const { v4: uuidv4 } = require('uuid');

// 分布式锁最大持有时间（秒）
const LOCK_MAX_HOLD_TIME = 30;

/**
 * 使用CDK
 * @param {string} code - CDK兑换码
 * @param {string} userId - 使用者ID
 * @param {Object} options - 附加选项
 * @returns {Promise<Object>} 使用结果
 */
async function redeemCDK(code, userId, options = {}) {
  const { 
    ip, 
    deviceInfo,
    verificationCode // 用于需要二次验证的CDK
  } = options;
  
  // 验证参数
  if (!code || !userId) {
    throw new Error('兑换码和用户ID不能为空');
  }
  
  // 清理输入
  const cleanCode = code.trim().toUpperCase();
  
  // 创建事务会话
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 先查询CDK
    const cdk = await CDK.findOne({ code: cleanCode });
    
    // CDK不存在
    if (!cdk) {
      logger.info('CDK不存在', { code: code.substring(0, 4) + '***', userId });
      
      await session.abortTransaction();
      session.endSession();
      
      return {
        success: false,
        message: 'CDK不存在或已被使用',
        code: 'CDK_NOT_FOUND'
      };
    }
    
    // 尝试锁定CDK，防止并发操作
    // 使用findOneAndUpdate而不是直接操作实例，确保原子性
    const lockedCDK = await CDK.findOneAndUpdate(
      { 
        _id: cdk._id, 
        locked: false // 仅当未锁定时才能锁定
      },
      {
        $set: {
          locked: true,
          lockedAt: new Date(),
          lockExpiresAt: new Date(Date.now() + LOCK_MAX_HOLD_TIME * 1000)
        }
      },
      { 
        new: true, // 返回更新后的文档
        session 
      }
    );
    
    // 如果锁定失败，说明CDK正被其他请求处理中
    if (!lockedCDK) {
      logger.warn('CDK正被处理中，无法锁定', { code: code.substring(0, 4) + '***', userId });
      
      await session.abortTransaction();
      session.endSession();
      
      return {
        success: false,
        message: 'CDK正在处理中，请稍后再试',
        code: 'CDK_LOCKED'
      };
    }
    
    // 验证数据完整性
    if (!lockedCDK.verifyIntegrity()) {
      logger.security('CDK数据完整性验证失败', { 
        code: code.substring(0, 4) + '***', 
        userId,
        batchId: lockedCDK.batchId 
      });
      
      // 解锁并返回错误
      await CDK.updateOne(
        { _id: lockedCDK._id },
        { 
          $set: { 
            locked: false,
            lockedAt: null,
            lockExpiresAt: null
          },
          $push: {
            usageHistory: {
              timestamp: new Date(),
              userId,
              ip,
              deviceInfo,
              action: 'verify_integrity',
              success: false,
              reason: 'CDK数据完整性验证失败'
            }
          }
        },
        { session }
      );
      
      await session.abortTransaction();
      session.endSession();
      
      return {
        success: false,
        message: 'CDK数据已损坏',
        code: 'CDK_INTEGRITY_FAILED'
      };
    }
    
    // 检查CDK状态
    if (lockedCDK.status === 'used' && lockedCDK.mode === 'single_use') {
      logger.info('CDK已被使用', { 
        code: code.substring(0, 4) + '***', 
        userId,
        batchId: lockedCDK.batchId 
      });
      
      // 记录使用尝试
      await CDK.updateOne(
        { _id: lockedCDK._id },
        { 
          $set: { 
            locked: false,
            lockedAt: null,
            lockExpiresAt: null
          },
          $push: {
            usageHistory: {
              timestamp: new Date(),
              userId,
              ip,
              deviceInfo,
              action: 'use',
              success: false,
              reason: 'CDK已被使用'
            }
          }
        },
        { session }
      );
      
      await session.commitTransaction();
      session.endSession();
      
      return {
        success: false,
        message: 'CDK已被使用',
        code: 'CDK_ALREADY_USED'
      };
    }
    
    // 检查是否过期
    if (lockedCDK.status === 'expired' || (lockedCDK.expiresAt && lockedCDK.expiresAt < new Date())) {
      logger.info('CDK已过期', { 
        code: code.substring(0, 4) + '***', 
        userId,
        batchId: lockedCDK.batchId 
      });
      
      // 更新状态为过期（如果尚未标记）
      const updateFields = {
        locked: false,
        lockedAt: null,
        lockExpiresAt: null
      };
      
      if (lockedCDK.status !== 'expired') {
        updateFields.status = 'expired';
        updateFields.statusChangedAt = new Date();
      }
      
      await CDK.updateOne(
        { _id: lockedCDK._id },
        { 
          $set: updateFields,
          $push: {
            usageHistory: {
              timestamp: new Date(),
              userId,
              ip,
              deviceInfo,
              action: 'use',
              success: false,
              reason: 'CDK已过期'
            }
          }
        },
        { session }
      );
      
      await session.commitTransaction();
      session.endSession();
      
      return {
        success: false,
        message: 'CDK已过期',
        code: 'CDK_EXPIRED'
      };
    }
    
    // 检查是否作废
    if (lockedCDK.status === 'revoked') {
      logger.info('CDK已作废', { 
        code: code.substring(0, 4) + '***', 
        userId,
        batchId: lockedCDK.batchId,
        revokeReason: lockedCDK.revokeReason
      });
      
      await CDK.updateOne(
        { _id: lockedCDK._id },
        { 
          $set: { 
            locked: false,
            lockedAt: null,
            lockExpiresAt: null
          },
          $push: {
            usageHistory: {
              timestamp: new Date(),
              userId,
              ip,
              deviceInfo,
              action: 'use',
              success: false,
              reason: 'CDK已作废'
            }
          }
        },
        { session }
      );
      
      await session.commitTransaction();
      session.endSession();
      
      return {
        success: false,
        message: 'CDK已作废',
        code: 'CDK_REVOKED'
      };
    }
    
    // 检查使用次数限制
    if (lockedCDK.mode === 'multi_use' && lockedCDK.usageCount >= lockedCDK.maxUsageCount) {
      logger.info('CDK已达到最大使用次数', { 
        code: code.substring(0, 4) + '***', 
        userId,
        batchId: lockedCDK.batchId,
        maxUsageCount: lockedCDK.maxUsageCount,
        usageCount: lockedCDK.usageCount
      });
      
      // 更新状态
      await CDK.updateOne(
        { _id: lockedCDK._id },
        { 
          $set: { 
            locked: false,
            lockedAt: null,
            lockExpiresAt: null,
            status: 'used', // 多次使用达到上限也标记为已使用
            statusChangedAt: new Date()
          },
          $push: {
            usageHistory: {
              timestamp: new Date(),
              userId,
              ip,
              deviceInfo,
              action: 'use',
              success: false,
              reason: '已达到最大使用次数'
            }
          }
        },
        { session }
      );
      
      await session.commitTransaction();
      session.endSession();
      
      return {
        success: false,
        message: 'CDK已达到最大使用次数',
        code: 'CDK_MAX_USAGE_REACHED'
      };
    }
    
    // 检查是否需要二次验证
    if (lockedCDK.requires2FA && !verificationCode) {
      logger.info('CDK需要二次验证', { 
        code: code.substring(0, 4) + '***', 
        userId,
        batchId: lockedCDK.batchId
      });
      
      // 解锁CDK
      await CDK.updateOne(
        { _id: lockedCDK._id },
        { 
          $set: { 
            locked: false,
            lockedAt: null,
            lockExpiresAt: null
          }
        },
        { session }
      );
      
      await session.commitTransaction();
      session.endSession();
      
      return {
        success: false,
        message: 'CDK需要二次验证',
        code: 'CDK_REQUIRES_2FA',
        requires2FA: true
      };
    }
    
    // 如果提供了二次验证码，需要验证
    if (lockedCDK.requires2FA && verificationCode) {
      // 这里应该调用验证2FA的服务
      const { twoFactorAuthService } = require('../services/twoFactorAuth');
      
      try {
        const isValid = await twoFactorAuthService.validateSecureCDKUsage(
          userId, 
          lockedCDK._id.toString(), 
          verificationCode
        );
        
        if (!isValid) {
          logger.security('CDK二次验证失败', { 
            code: code.substring(0, 4) + '***', 
            userId,
            batchId: lockedCDK.batchId
          });
          
          // 记录失败尝试
          await CDK.updateOne(
            { _id: lockedCDK._id },
            { 
              $set: { 
                locked: false,
                lockedAt: null,
                lockExpiresAt: null
              },
              $push: {
                usageHistory: {
                  timestamp: new Date(),
                  userId,
                  ip,
                  deviceInfo,
                  action: 'verify_2fa',
                  success: false,
                  reason: '二次验证失败'
                }
              }
            },
            { session }
          );
          
          await session.commitTransaction();
          session.endSession();
          
          return {
            success: false,
            message: '二次验证失败',
            code: 'CDK_2FA_FAILED'
          };
        }
      } catch (error) {
        logger.error('验证2FA过程发生错误', { 
          error: error.message,
          code: code.substring(0, 4) + '***', 
          userId
        });
        
        // 解锁CDK
        await CDK.updateOne(
          { _id: lockedCDK._id },
          { 
            $set: { 
              locked: false,
              lockedAt: null,
              lockExpiresAt: null
            }
          },
          { session }
        );
        
        await session.abortTransaction();
        session.endSession();
        
        throw error;
      }
    }
    
    // 所有检查通过，可以使用CDK
    const now = new Date();
    
    // 准备更新字段
    const updateFields = {
      locked: false, // 解锁
      lockedAt: null,
      lockExpiresAt: null,
      usedAt: now,
      usedBy: userId
    };
    
    // 根据使用模式更新状态
    if (lockedCDK.mode === 'single_use') {
      updateFields.status = 'used';
      updateFields.statusChangedAt = now;
    } else {
      // 多次使用模式，增加使用次数
      updateFields.usageCount = (lockedCDK.usageCount || 0) + 1;
      
      // 如果达到最大使用次数，也标记为已使用
      if (updateFields.usageCount >= lockedCDK.maxUsageCount) {
        updateFields.status = 'used';
        updateFields.statusChangedAt = now;
      }
    }
    
    // 更新CDK
    await CDK.updateOne(
      { _id: lockedCDK._id },
      { 
        $set: updateFields,
        $push: {
          usageHistory: {
            timestamp: now,
            userId,
            ip,
            deviceInfo,
            action: 'use',
            success: true
          },
          auditTrail: {
            action: 'redeem',
            performedBy: userId,
            timestamp: now,
            ipAddress: ip,
            details: {
              deviceInfo,
              remainingUses: lockedCDK.mode === 'multi_use' ? 
                (lockedCDK.maxUsageCount - (lockedCDK.usageCount + 1)) : 0
            }
          }
        }
      },
      { session }
    );
    
    // 如果是批次中的CDK，更新批次使用计数
    if (lockedCDK.batchId) {
      await CDKBatch.updateOne(
        { batchId: lockedCDK.batchId },
        { 
          $inc: { usedCount: 1 },
          $push: {
            auditTrail: {
              action: 'redeem_cdk',
              performedBy: userId,
              timestamp: now,
              details: {
                cdkId: lockedCDK._id,
                code: code.substring(0, 4) + '***'
              }
            }
          }
        },
        { session }
      );
    }
    
    // 提交事务
    await session.commitTransaction();
    session.endSession();
    
    // 从CDK解密价值内容（如果已加密）
    let value = lockedCDK.value;
    if (lockedCDK.valueEncrypted && lockedCDK.securityLevel >= 2) {
      try {
        // 使用加密上下文验证
        const context = encryptionUtils.createEncryptionContext(
          'CDK', 
          lockedCDK._id.toString()
        );
        
        const decrypted = encryptionUtils.decrypt(
          lockedCDK.valueEncrypted, 
          { context }
        );
        
        // 尝试解析为JSON对象
        try {
          value = JSON.parse(decrypted);
        } catch {
          value = decrypted; // 不是有效的JSON，直接返回解密的字符串
        }
      } catch (error) {
        logger.error('解密CDK值失败', { 
          error: error.message,
          code: code.substring(0, 4) + '***',
          userId
        });
        // 使用未加密的值作为后备
      }
    }
    
    logger.info('CDK兑换成功', { 
      code: code.substring(0, 4) + '***', 
      userId,
      batchId: lockedCDK.batchId,
      type: lockedCDK.type
    });
    
    return {
      success: true,
      message: 'CDK兑换成功',
      value,
      type: lockedCDK.type,
      mode: lockedCDK.mode,
      remainingUses: lockedCDK.mode === 'multi_use' ? 
        (lockedCDK.maxUsageCount - updateFields.usageCount) : 0
    };
    
  } catch (error) {
    logger.error('CDK兑换过程发生错误', { 
      error: error.message, 
      code: code.substring(0, 4) + '***',
      userId
    });
    
    // 事务回滚
    await session.abortTransaction();
    session.endSession();
    
    throw error;
  }
}

/**
 * 批量作废CDK
 * @param {Object} filter - 筛选条件
 * @param {string} userId - 操作用户ID
 * @param {string} reason - 作废原因
 * @param {Object} options - 附加选项
 * @returns {Promise<Object>} 作废结果
 */
async function revokeCDKs(filter, userId, reason, options = {}) {
  // 验证参数
  if (!filter || !userId) {
    throw new Error('筛选条件和用户ID不能为空');
  }
  
  // 创建事务会话
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 安全筛选条件，只允许作废未使用的CDK
    const safeFilter = {
      ...filter,
      status: { $nin: ['used', 'expired', 'revoked'] }
    };
    
    // 记录操作批次ID
    const operationId = uuidv4();
    const now = new Date();
    
    // 执行批量更新
    const updateResult = await CDK.updateMany(
      safeFilter,
      {
        $set: {
          status: 'revoked',
          statusChangedAt: now,
          revokedAt: now,
          revokedBy: userId,
          revokeReason: reason || '管理员作废'
        },
        $push: {
          auditTrail: {
            action: 'revoke',
            performedBy: userId,
            timestamp: now,
            details: {
              reason,
              operationId
            }
          }
        }
      },
      { session }
    );
    
    // 如果是按批次ID作废，更新批次记录
    if (filter.batchId) {
      await CDKBatch.updateOne(
        { batchId: filter.batchId },
        {
          $inc: { revokedCount: updateResult.modifiedCount },
          $push: {
            auditTrail: {
              action: 'revoke_cdks',
              performedBy: userId,
              timestamp: now,
              details: {
                reason,
                count: updateResult.modifiedCount,
                operationId
              }
            }
          }
        },
        { session }
      );
    }
    
    // 提交事务
    await session.commitTransaction();
    session.endSession();
    
    logger.info('批量作废CDK完成', {
      operationId,
      count: updateResult.modifiedCount,
      filter: JSON.stringify(safeFilter),
      userId
    });
    
    return {
      success: true,
      count: updateResult.modifiedCount,
      operationId
    };
    
  } catch (error) {
    logger.error('批量作废CDK过程发生错误', {
      error: error.message,
      filter: JSON.stringify(filter),
      userId
    });
    
    // 事务回滚
    await session.abortTransaction();
    session.endSession();
    
    throw error;
  }
}

/**
 * 批量激活CDK
 * @param {Object} filter - 筛选条件
 * @param {string} userId - 操作用户ID
 * @param {Object} options - 附加选项
 * @returns {Promise<Object>} 激活结果
 */
async function activateCDKs(filter, userId, options = {}) {
  // 验证参数
  if (!filter || !userId) {
    throw new Error('筛选条件和用户ID不能为空');
  }
  
  // 创建事务会话
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 安全筛选条件，只允许激活已生成的CDK
    const safeFilter = {
      ...filter,
      status: 'generated'
    };
    
    // 记录操作批次ID
    const operationId = uuidv4();
    const now = new Date();
    
    // 执行批量更新
    const updateResult = await CDK.updateMany(
      safeFilter,
      {
        $set: {
          status: 'activated',
          statusChangedAt: now,
          activatedAt: now
        },
        $push: {
          auditTrail: {
            action: 'activate',
            performedBy: userId,
            timestamp: now,
            details: {
              operationId
            }
          },
          usageHistory: {
            timestamp: now,
            action: 'activate',
            actionBy: userId,
            success: true
          }
        }
      },
      { session }
    );
    
    // 如果是按批次ID激活，更新批次记录
    if (filter.batchId) {
      await CDKBatch.updateOne(
        { batchId: filter.batchId },
        {
          $inc: { activatedCount: updateResult.modifiedCount },
          $push: {
            auditTrail: {
              action: 'activate_cdks',
              performedBy: userId,
              timestamp: now,
              details: {
                count: updateResult.modifiedCount,
                operationId
              }
            }
          }
        },
        { session }
      );
    }
    
    // 提交事务
    await session.commitTransaction();
    session.endSession();
    
    logger.info('批量激活CDK完成', {
      operationId,
      count: updateResult.modifiedCount,
      filter: JSON.stringify(safeFilter),
      userId
    });
    
    return {
      success: true,
      count: updateResult.modifiedCount,
      operationId
    };
    
  } catch (error) {
    logger.error('批量激活CDK过程发生错误', {
      error: error.message,
      filter: JSON.stringify(filter),
      userId
    });
    
    // 事务回滚
    await session.abortTransaction();
    session.endSession();
    
    throw error;
  }
}

/**
 * 自动解锁长时间锁定的CDK
 * 用于处理因为请求中断导致的锁定状态
 * @returns {Promise<number>} 解锁的CDK数量
 */
async function unlockStalledCDKs() {
  try {
    const now = new Date();
    
    // 查找所有锁定时间超过最大限制的CDK
    const result = await CDK.updateMany(
      {
        locked: true,
        lockExpiresAt: { $lt: now }
      },
      {
        $set: {
          locked: false,
          lockedAt: null,
          lockExpiresAt: null
        },
        $push: {
          auditTrail: {
            action: 'auto_unlock',
            performedBy: 'system',
            timestamp: now,
            details: {
              reason: '锁定超时自动解锁'
            }
          }
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      logger.info('自动解锁超时CDK', { count: result.modifiedCount });
    }
    
    return result.modifiedCount;
  } catch (error) {
    logger.error('自动解锁CDK失败', { error: error.message });
    return 0;
  }
}

// 定期执行解锁任务
setInterval(unlockStalledCDKs, 60 * 1000); // 每分钟检查一次

module.exports = {
  redeemCDK,
  revokeCDKs,
  activateCDKs,
  unlockStalledCDKs
}; 