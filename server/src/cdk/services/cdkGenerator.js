/**
 * CDK生成服务
 * 支持自定义格式和多种加密算法的CDK批量生成功能
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { CDK, CDK_STATUS } = require('../models/CDK');
const CDKBatch = require('../models/CDKBatch');
const logger = require('../../utils/logger');
const config = require('../../config');
const encryptionUtils = require('../../utils/encryption');
const { setTimeout } = require('timers/promises');

// 定义重试常量
const MAX_RETRIES = 3;

// 字符集定义
const CHAR_SETS = {
  numbers: '0123456789',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  special: '!@#$%^&*()-_=+[]{}|;:,.<>?'
};

// 易混淆字符
const AMBIGUOUS_CHARS = ['0', 'O', '1', 'I', 'l', '5', 'S', '8', 'B', '2', 'Z'];

/**
 * 根据格式配置生成字符集
 * @param {Object} formatConfig - 格式配置
 * @returns {string} 符合要求的字符集
 */
function buildCharacterSet(formatConfig) {
  // 默认字符集
  const defaultCharsets = {
    uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // 移除容易混淆的字符 I,O
    lowercase: 'abcdefghijkmnpqrstuvwxyz', // 移除容易混淆的字符 l,o
    numbers: '0123456789',
    special: '#$%&@*+-=?' // 安全的特殊字符
  };
  
  // 检查配置有效性
  if (!formatConfig || typeof formatConfig !== 'object') {
    // 使用默认安全配置
    return defaultCharsets.uppercase + defaultCharsets.numbers;
  }
  
  let charset = '';
  
  // 根据配置构建字符集
  if (formatConfig.useUppercase !== false) {
    charset += formatConfig.uppercaseChars || defaultCharsets.uppercase;
  }
  
  if (formatConfig.useLowercase === true) {
    charset += formatConfig.lowercaseChars || defaultCharsets.lowercase;
  }
  
  if (formatConfig.useNumbers !== false) {
    charset += formatConfig.numberChars || defaultCharsets.numbers;
  }
  
  if (formatConfig.useSpecial === true) {
    charset += formatConfig.specialChars || defaultCharsets.special;
  }
  
  // 自定义附加字符
  if (formatConfig.customChars) {
    charset += formatConfig.customChars;
  }
  
  // 确保字符集不为空
  if (charset.length === 0) {
    logger.warn('字符集配置无效，使用默认安全字符集');
    charset = defaultCharsets.uppercase + defaultCharsets.numbers;
  }
  
  // 移除重复字符
  charset = [...new Set(charset)].join('');
  
  return charset;
}

/**
 * 生成随机字符串段 - 安全增强版
 * @param {number} length - 字符串长度
 * @param {string} charset - 使用的字符集
 * @returns {string} 随机字符串
 */
function generateRandomSegment(length, charset) {
  if (length <= 0 || charset.length === 0) {
    throw new Error('无效的长度或字符集');
  }
  
  // 确保足够的熵
  const randomBytesNeeded = Math.ceil(length * 1.5); // 增加熵的量
  const randomBytes = crypto.randomBytes(randomBytesNeeded);
  
  let result = '';
  const charsetLength = charset.length;
  
  // 使用取模偏差修正算法
  const maxByteValue = 256;
  const chunkSize = Math.floor(maxByteValue / charsetLength) * charsetLength;
  
  for (let i = 0; i < randomBytesNeeded && result.length < length; i++) {
    // 拒绝取模偏差区域的值
    if (randomBytes[i] < chunkSize) {
      result += charset[randomBytes[i] % charsetLength];
    }
  }
  
  // 万一没有生成足够长度的结果（极少可能性）
  while (result.length < length) {
    const extraByte = crypto.randomBytes(1)[0];
    if (extraByte < chunkSize) {
      result += charset[extraByte % charsetLength];
    }
  }
  
  return result;
}

/**
 * 增强版随机数生成函数，使用额外熵和密码学安全的随机源
 * @param {number} min - 最小值（包含）
 * @param {number} max - 最大值（包含）
 * @returns {number} 随机数
 */
function secureRandomInt(min, max) {
  if (min >= max) {
    throw new Error('最小值必须小于最大值');
  }
  
  const range = max - min + 1;
  const bitsNeeded = Math.ceil(Math.log2(range));
  const bytesNeeded = Math.ceil(bitsNeeded / 8);
  const maxValue = Math.pow(2, bitsNeeded) - 1;
  
  let randomValue, randomBytes;
  
  // 循环直到找到范围内的有效值（避免偏差）
  do {
    randomBytes = crypto.randomBytes(bytesNeeded);
    randomValue = 0;
    
    for (let i = 0; i < bytesNeeded; i++) {
      randomValue = (randomValue << 8) | randomBytes[i];
    }
    
    // 确保值不超过我们能代表的最大整数
    randomValue = randomValue & maxValue;
    
  } while (randomValue >= range);
  
  return min + randomValue;
}

/**
 * 根据格式配置生成单个CDK码
 * @param {Object} formatConfig - 格式配置
 * @returns {string} 生成的CDK码
 */
function generateSingleCDKCode(formatConfig) {
  // 验证配置
  if (!formatConfig) {
    formatConfig = {
      segmentCount: 4,
      segmentLength: 4,
      delimiter: '-'
    };
  }
  
  // 验证段数
  const segmentCount = parseInt(formatConfig.segmentCount) || 4;
  if (segmentCount <= 0 || segmentCount > 10) {
    throw new Error('段数必须在1-10之间');
  }
  
  // 验证段长度
  const segmentLength = parseInt(formatConfig.segmentLength) || 4;
  if (segmentLength <= 0 || segmentLength > 16) {
    throw new Error('段长度必须在1-16之间');
  }
  
  // 验证整体长度
  const totalLength = segmentCount * segmentLength + (segmentCount - 1);
  if (totalLength > 100) {
    throw new Error('CDK总长度不能超过100个字符');
  }
  
  // 获取字符集
  const charset = buildCharacterSet(formatConfig);
  
  // 确保字符集足够大，提供足够的熵
  if (charset.length < 10) {
    throw new Error('字符集太小，不安全');
  }
  
  // 计算CDK的熵
  const entropy = Math.log2(Math.pow(charset.length, segmentCount * segmentLength));
  if (entropy < 40) {
    logger.warn('CDK熵值较低，可能不够安全', { entropy });
  }
  
  // 获取分隔符
  const delimiter = formatConfig.delimiter || '-';
  
  // 生成各段CDK
  const segments = [];
  for (let i = 0; i < segmentCount; i++) {
    segments.push(generateRandomSegment(segmentLength, charset));
  }
  
  // 组合成最终CDK码
  return segments.join(delimiter);
}

/**
 * 检查CDK是否已存在
 * @param {string} code - CDK码
 * @param {string} algorithm - 哈希算法
 * @returns {Promise<boolean>} 是否存在
 */
async function checkCDKExists(code, algorithm = 'sha256') {
  const { generateHash } = require('../../utils/encryption');
  
  // 计算CDK哈希（使用加密工具而不是直接使用crypto）
  const codeHash = generateHash(code, config.security.cdkSalt);
  
  // 查询数据库
  const existingCDK = await CDK.findOne({ codeHash });
  return !!existingCDK;
}

/**
 * 批量生成CDK - 使用会话和并发控制
 * @param {Object} batchData - 批次数据
 * @param {Object} options - 生成选项
 * @returns {Promise<Object>} 生成结果
 */
async function generateCDKs(batchData, options = {}) {
  const {
    batchSize = 1000, // 默认批次大小
    concurrentLimit = 3, // 并发生成限制
    retryCount = 3, // 重试次数
    sessionToken // 会话令牌，用于追踪长时间任务
  } = options;
  
  // 初始化结果对象
  const result = {
    batchId: batchData.batchId,
    totalRequested: batchData.quantity,
    generated: 0,
    skipped: 0,
    failed: 0,
    collisions: 0,
    timeElapsed: 0,
    status: 'pending',
    errorDetails: []
  };
  
  // 记录开始时间
  const startTime = Date.now();
  
  try {
    // 验证批量数据
    if (!batchData || !batchData.batchId || !batchData.quantity) {
      throw new Error('批量生成数据无效');
    }
    
    // 生成格式配置
    const formatConfig = buildCharacterSet(batchData.formatConfig);
    
    // 创建会话令牌（如果没有提供）
    const jobId = sessionToken || uuidv4();
    
    // 检查任务是否已存在
    if (generationTasks.has(jobId)) {
      const existingTask = generationTasks.get(jobId);
      return {
        ...result,
        status: 'in_progress',
        message: '任务已在进行中',
        jobId,
        progress: existingTask.progress,
        timeElapsed: Date.now() - startTime
      };
    }
    
    // 计算总批次数
    const totalBatches = Math.ceil(batchData.quantity / batchSize);
    
    // 创建任务
    const task = createGenerationTask(
      batchData,
      jobId,
      batchData.batchId,
      batchData.createdBy,
      {
        formatConfig,
        retryCount,
        totalBatches,
        batchSize,
        concurrentLimit
      }
    );
    
    // 设置初始状态
    generationTasks.set(jobId, {
      id: jobId,
      status: 'queued',
      progress: {
        current: 0,
        total: batchData.quantity,
        batches: {
          completed: 0,
          total: totalBatches
        }
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      batchId: batchData.batchId
    });
    
    // 启动任务处理（非阻塞）
    setImmediate(task);
    
    // 立即返回任务状态
    return {
      ...result,
      status: 'queued',
      message: '任务已加入队列',
      jobId,
      timeElapsed: Date.now() - startTime
    };
  } catch (error) {
    logger.error('CDK批量生成失败', { 
      error: error.message, 
      batchId: batchData.batchId,
      timeElapsed: Date.now() - startTime
    });
    
    return {
      ...result,
      status: 'failed',
      errorDetails: [{ message: error.message }],
      timeElapsed: Date.now() - startTime
    };
  }
}

// 全局任务队列
const generationTasks = new Map();
// 并发控制计数器
let runningTasks = 0;
// 最大并发任务数
const MAX_CONCURRENT_TASKS = 5;
// 队列处理间隔（毫秒）
const QUEUE_PROCESSING_INTERVAL = 1000;

/**
 * 创建CDK生成任务
 * @param {Object} batchData - 批次数据
 * @param {string} jobId - 任务ID
 * @param {string} batchId - 批次ID
 * @param {string} userId - 用户ID
 * @param {Object} options - 任务选项
 * @returns {Function} 任务函数
 */
function createGenerationTask(batchData, jobId, batchId, userId, options) {
  const {
    formatConfig,
    retryCount,
    totalBatches,
    batchSize,
    concurrentLimit
  } = options;
  
  // 定义执行任务
  const executeTask = async (retryCount = 0) => {
    // 更新任务状态
    if (generationTasks.has(jobId)) {
      const task = generationTasks.get(jobId);
      task.status = 'running';
      task.updatedAt = new Date();
      generationTasks.set(jobId, task);
    }
    
    // 增加运行中任务计数
    runningTasks++;
    
    try {
      logger.info('开始CDK批量生成任务', {
        jobId,
        batchId,
        quantity: batchData.quantity,
        totalBatches
      });
      
      // 初始化结果计数
      let totalGenerated = 0;
      let totalSkipped = 0;
      let totalCollisions = 0;
      
      // 计算每个批次的大小
      const batchSize = Math.min(1000, Math.ceil(batchData.quantity / totalBatches));
      
      // 并发限制
      const concurrencyLimit = concurrentLimit || 3;
      const batchPromises = [];
      
      // 批次处理函数
      const processBatch = async (batchIndex) => {
        const batchStart = batchIndex * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, batchData.quantity);
        const batchQuantity = batchEnd - batchStart;
        
        if (batchQuantity <= 0) return { generated: 0, skipped: 0, collisions: 0 };
        
        logger.info('处理CDK子批次', {
          jobId,
          batchId,
          batchIndex,
          start: batchStart,
          end: batchEnd,
          quantity: batchQuantity
        });
        
        // 生成当前批次的CDK
        const cdkCodes = [];
        let collisions = 0;
        
        for (let i = 0; i < batchQuantity; i++) {
          // 生成单个CDK
          let code;
          let isUnique = false;
          let attempts = 0;
          const maxAttempts = 5; // 最大尝试次数
          
          while (!isUnique && attempts < maxAttempts) {
            code = generateSingleCDKCode(formatConfig);
            
            // 先检查内存中是否已有此CDK（快速检查）
            if (cdkCodes.includes(code)) {
              attempts++;
              collisions++;
              continue;
            }
            
            // 再检查数据库（较慢检查）
            try {
              const exists = await checkCDKExists(code);
              if (!exists) {
                isUnique = true;
              } else {
                attempts++;
                collisions++;
              }
            } catch (err) {
              logger.error('检查CDK唯一性失败', {
                error: err.message,
                jobId,
                batchIndex
              });
              attempts++;
            }
          }
          
          if (isUnique) {
            cdkCodes.push(code);
          } else {
            logger.warn('无法生成唯一CDK，已达到最大尝试次数', {
              jobId,
              batchIndex,
              attempts
            });
          }
          
          // 更新进度
          if (generationTasks.has(jobId)) {
            const task = generationTasks.get(jobId);
            task.progress.current = totalGenerated + cdkCodes.length;
            task.updatedAt = new Date();
            generationTasks.set(jobId, task);
          }
        }
        
        // 将生成的CDK保存到数据库
        const docsToSave = cdkCodes.map(code => {
          return new CDK({
            code,
            codeHash: encryptionUtils.generateHash(code, config.security.cdkSalt),
            batchId,
            type: batchData.cdkType,
            value: batchData.value,
            expiresAt: batchData.expiresAt,
            createdBy: userId,
            status: 'generated',
            mode: batchData.cdkMode || 'single_use',
            algorithm: 'sha256',
            // 生成完整性签名
            integritySignature: encryptionUtils.generateHMAC(
              { code, type: batchData.cdkType, batchId, value: batchData.value },
              config.security.integrityKey || config.security.cdkSalt
            )
          });
        });
        
        try {
          // 批量插入
          if (docsToSave.length > 0) {
            await CDK.insertMany(docsToSave, { ordered: false });
          }
          
          logger.info('子批次CDK保存成功', {
            jobId,
            batchIndex,
            generated: cdkCodes.length,
            collisions
          });
          
          return {
            generated: cdkCodes.length,
            skipped: batchQuantity - cdkCodes.length,
            collisions
          };
        } catch (err) {
          logger.error('保存子批次CDK失败', {
            error: err.message,
            jobId,
            batchIndex
          });
          
          // 检查是否是重复键错误
          if (err.code === 11000) {
            // 提取成功插入的数量
            const insertedCount = docsToSave.length - err.writeErrors?.length || 0;
            return {
              generated: insertedCount,
              skipped: batchQuantity - insertedCount,
              collisions: collisions + (err.writeErrors?.length || 0)
            };
          }
          
          throw err;
        }
      };
      
      // 分批处理
      for (let i = 0; i < totalBatches; i++) {
        // 控制并发数量
        if (batchPromises.length >= concurrencyLimit) {
          // 等待其中一个批次完成
          const results = await Promise.race(
            batchPromises.map((p, index) => 
              p.then(result => ({ result, index }))
            )
          );
          
          // 处理完成的批次结果
          const { result, index } = results;
          totalGenerated += result.generated;
          totalSkipped += result.skipped;
          totalCollisions += result.collisions;
          
          // 从等待列表中移除已完成的批次
          batchPromises.splice(index, 1);
          
          // 更新批次完成进度
          if (generationTasks.has(jobId)) {
            const task = generationTasks.get(jobId);
            task.progress.batches.completed++;
            generationTasks.set(jobId, task);
          }
        }
        
        // 添加新批次
        batchPromises.push(processBatch(i));
      }
      
      // 等待所有剩余批次完成
      const remainingResults = await Promise.all(batchPromises);
      
      // 汇总剩余批次结果
      for (const result of remainingResults) {
        totalGenerated += result.generated;
        totalSkipped += result.skipped;
        totalCollisions += result.collisions;
      }
      
      // 优化索引（如果生成的CDK数量较多）
      if (totalGenerated > 10000) {
        try {
          await optimizeIndexes(batchId);
        } catch (err) {
          logger.warn('优化索引失败', {
            error: err.message,
            batchId
          });
        }
      }
      
      // 更新任务状态为完成
      if (generationTasks.has(jobId)) {
        const task = generationTasks.get(jobId);
        task.status = 'completed';
        task.progress.current = totalGenerated;
        task.progress.batches.completed = totalBatches;
        task.result = {
          generated: totalGenerated,
          skipped: totalSkipped,
          collisions: totalCollisions,
          timeElapsed: Date.now() - task.createdAt.getTime()
        };
        task.completedAt = new Date();
        task.updatedAt = new Date();
        generationTasks.set(jobId, task);
      }
      
      logger.info('CDK批量生成任务完成', {
        jobId,
        batchId,
        generated: totalGenerated,
        skipped: totalSkipped,
        collisions: totalCollisions,
        timeElapsed: Date.now() - startTime
      });
      
      // 设置任务过期时间（1小时后自动从内存中清除）
      setTimeout(() => {
        if (generationTasks.has(jobId)) {
          generationTasks.delete(jobId);
        }
      }, 60 * 60 * 1000);
      
      return {
        batchId,
        jobId,
        status: 'completed',
        totalRequested: batchData.quantity,
        generated: totalGenerated,
        skipped: totalSkipped,
        collisions: totalCollisions,
        timeElapsed: Date.now() - startTime
      };
      
    } catch (error) {
      logger.error('CDK批量生成任务失败', {
        jobId,
        batchId,
        error: error.message,
        stack: error.stack
      });
      
      // 检查是否需要重试
      if (retryCount > 0) {
        logger.info('任务失败，准备重试', {
          jobId,
          batchId,
          remainingRetries: retryCount - 1
        });
        
        // 更新任务状态
        if (generationTasks.has(jobId)) {
          const task = generationTasks.get(jobId);
          task.status = 'retrying';
          task.retries = (task.retries || 0) + 1;
          task.updatedAt = new Date();
          task.lastError = error.message;
          generationTasks.set(jobId, task);
        }
        
        // 等待一段时间后重试
        setTimeout(() => {
          runningTasks--; // 减少运行中任务计数
          executeTask(retryCount - 1);
        }, 5000);
        
        return;
      }
      
      // 更新任务状态为失败
      if (generationTasks.has(jobId)) {
        const task = generationTasks.get(jobId);
        task.status = 'failed';
        task.error = error.message;
        task.updatedAt = new Date();
        task.completedAt = new Date();
        generationTasks.set(jobId, task);
      }
      
      // 设置任务过期时间（1小时后自动从内存中清除）
      setTimeout(() => {
        if (generationTasks.has(jobId)) {
          generationTasks.delete(jobId);
        }
      }, 60 * 60 * 1000);
      
      throw error;
    } finally {
      // 减少运行中任务计数
      runningTasks--;
    }
  };
  
  return executeTask;
}

// 任务队列处理函数
function processQueue() {
  // 检查是否有等待中的任务
  if (runningTasks >= MAX_CONCURRENT_TASKS) {
    return; // 已达到最大并发数
  }
  
  // 寻找队列中的任务
  for (const [jobId, task] of generationTasks.entries()) {
    if (task.status === 'queued') {
      // 找到一个等待中的任务
      logger.info('从队列中启动任务', { jobId });
      
      // 更新状态
      task.status = 'starting';
      task.updatedAt = new Date();
      generationTasks.set(jobId, task);
      
      // 获取任务数据
      const batchId = task.batchId;
      
      // 异步启动任务（避免阻塞队列处理）
      setImmediate(async () => {
        try {
          // 从数据库获取批次数据
          const batchData = await CDKBatch.findById(batchId).lean();
          
          if (!batchData) {
            logger.error('找不到批次数据', { jobId, batchId });
            
            // 更新任务状态
            if (generationTasks.has(jobId)) {
              const task = generationTasks.get(jobId);
              task.status = 'failed';
              task.error = '找不到批次数据';
              task.updatedAt = new Date();
              generationTasks.set(jobId, task);
            }
            
            return;
          }
          
          // 创建任务执行函数
          const taskFn = createGenerationTask(
            batchData,
            jobId,
            batchId,
            batchData.createdBy,
            {
              formatConfig: buildCharacterSet(batchData.formatConfig),
              retryCount: 3,
              totalBatches: Math.ceil(batchData.quantity / 1000),
              batchSize: 1000,
              concurrentLimit: 3
            }
          );
          
          // 执行任务
          await taskFn();
          
        } catch (err) {
          logger.error('启动任务失败', {
            jobId,
            batchId,
            error: err.message
          });
          
          // 更新任务状态
          if (generationTasks.has(jobId)) {
            const task = generationTasks.get(jobId);
            task.status = 'failed';
            task.error = err.message;
            task.updatedAt = new Date();
            generationTasks.set(jobId, task);
          }
        }
      });
      
      // 只启动一个任务，然后退出
      return;
    }
  }
}

// 启动队列处理器
setInterval(processQueue, QUEUE_PROCESSING_INTERVAL);

// 清理过期任务
function cleanupTasks() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [jobId, task] of generationTasks.entries()) {
    // 清理完成超过1小时或失败超过3小时的任务
    const completedTimeout = 60 * 60 * 1000; // 1小时
    const failedTimeout = 3 * 60 * 60 * 1000; // 3小时
    
    if (task.completedAt) {
      const taskAge = now - task.completedAt.getTime();
      
      if ((task.status === 'completed' && taskAge > completedTimeout) ||
          (task.status === 'failed' && taskAge > failedTimeout)) {
        generationTasks.delete(jobId);
        cleanedCount++;
      }
    } else if (task.updatedAt) {
      // 清理超过6小时未更新的任务（可能卡住）
      const stalledTimeout = 6 * 60 * 60 * 1000; // 6小时
      const taskAge = now - task.updatedAt.getTime();
      
      if (taskAge > stalledTimeout) {
        generationTasks.delete(jobId);
        cleanedCount++;
      }
    }
  }
  
  if (cleanedCount > 0) {
    logger.info('清理过期任务', { cleanedCount });
  }
}

// 每小时清理一次过期任务
setInterval(cleanupTasks, 60 * 60 * 1000);

/**
 * 优化指定批次的数据库索引
 * @param {string} batchId - 批次ID
 */
async function optimizeIndexes(batchId) {
  try {
    // 重建或确保索引存在并高效
    await CDK.collection.createIndex(
      { batchId: 1, status: 1 },
      { background: true }
    );
    
    await CDK.collection.createIndex(
      { code: 1 },
      { unique: true, background: true }
    );
    
    await CDK.collection.createIndex(
      { codeHash: 1 },
      { background: true }
    );
    
    logger.info('CDK索引优化完成', { batchId });
  } catch (error) {
    logger.error('CDK索引优化失败', { 
      error: error.message,
      batchId
    });
    throw error;
  }
}

/**
 * 获取任务状态
 * @param {string} jobId - 任务ID
 * @returns {Object|null} 任务状态
 */
function getTaskStatus(jobId) {
  if (!generationTasks.has(jobId)) {
    return null;
  }
  
  const task = generationTasks.get(jobId);
  
  return {
    id: jobId,
    status: task.status,
    progress: task.progress,
    result: task.result,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    error: task.error
  };
}

module.exports = {
  generateSingleCDKCode,
  checkCDKExists,
  generateCDKs,
  getTaskStatus,
  buildCharacterSet,  // 导出用于测试
  secureRandomInt,    // 安全的随机数生成
  generateRandomSegment // 随机段生成
}; 