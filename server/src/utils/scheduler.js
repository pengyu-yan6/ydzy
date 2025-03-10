/**
 * 计划任务管理器
 * 用于管理各种自动化任务，如密钥轮换、日志清理等
 */

const logger = require('./logger');
const encryptionUtils = require('./encryption');
const config = require('../config');

// 存储所有计划任务的定时器ID
const scheduledTasks = new Map();

/**
 * 启动自动密钥轮换任务
 * @param {Object} options - 配置选项
 * @returns {string} 任务ID
 */
function startKeyRotationTask(options = {}) {
  const taskId = 'key-rotation';
  
  // 如果任务已存在，先停止它
  if (scheduledTasks.has(taskId)) {
    stopTask(taskId);
  }
  
  // 设置检查间隔 - 默认每天检查一次
  const checkInterval = options.checkInterval || 24 * 60 * 60 * 1000; // 24小时
  
  // 设置轮换阈值 - 默认7天内到期的密钥会被轮换
  const daysBeforeExpiry = options.daysBeforeExpiry || 7;
  
  // 要检查的密钥提供商
  const providers = options.providers || ['default', 'weixin', 'zhifubao'];
  
  logger.info('启动自动密钥轮换任务', {
    taskId,
    checkInterval: `${checkInterval/1000/60/60}小时`,
    providers,
    daysBeforeExpiry
  });
  
  // 定义任务函数
  const rotationTask = async () => {
    try {
      logger.info('执行自动密钥轮换检查');
      
      // 执行密钥轮换
      const results = await encryptionUtils.autoRotateExpiringKeys(
        providers,
        daysBeforeExpiry
      );
      
      // 记录结果
      logger.info('密钥轮换检查完成', {
        rotated: results.rotated.length,
        failed: results.failed.length,
        unchanged: results.unchanged
      });
      
      // 如果有失败的密钥轮换，发送告警
      if (results.failed.length > 0) {
        // 在实际环境中，这里应该调用告警系统
        logger.error('部分密钥轮换失败', { failed: results.failed });
      }
    } catch (err) {
      logger.error('密钥轮换任务发生错误', { error: err.message });
    }
  };
  
  // 启动定时任务
  const timerId = setInterval(rotationTask, checkInterval);
  
  // 存储任务信息
  scheduledTasks.set(taskId, {
    id: timerId,
    type: 'interval',
    name: '密钥轮换',
    interval: checkInterval,
    lastRun: null,
    nextRun: new Date(Date.now() + checkInterval),
    status: 'running'
  });
  
  // 立即执行一次，检查当前状态
  setTimeout(rotationTask, 5000);
  
  return taskId;
}

/**
 * 启动自动日志清理任务
 * @param {Object} options - 配置选项
 * @returns {string} 任务ID
 */
function startLogCleanupTask(options = {}) {
  const taskId = 'log-cleanup';
  
  // 如果任务已存在，先停止它
  if (scheduledTasks.has(taskId)) {
    stopTask(taskId);
  }
  
  // 设置检查间隔 - 默认每周执行一次
  const checkInterval = options.checkInterval || 7 * 24 * 60 * 60 * 1000; // 7天
  
  // 设置要保留的日志天数 - 默认30天
  const keepDays = options.keepDays || 30;
  
  // 要清理的日志类型
  const logTypes = options.logTypes || ['payment', 'security', 'audit'];
  
  logger.info('启动自动日志清理任务', {
    taskId,
    checkInterval: `${checkInterval/1000/60/60/24}天`,
    keepDays,
    logTypes
  });
  
  // 定义任务函数
  const cleanupTask = async () => {
    try {
      logger.info('执行日志清理任务');
      
      // 记录开始时间
      const startTime = Date.now();
      
      // 在实际环境中，这里应该调用日志清理函数
      // 例如: await logManager.cleanupLogs(logTypes, keepDays);
      
      // 记录完成时间
      const duration = Date.now() - startTime;
      
      logger.info('日志清理任务完成', {
        duration: `${duration}ms`,
        logTypes,
        keepDays
      });
    } catch (err) {
      logger.error('日志清理任务发生错误', { error: err.message });
    }
  };
  
  // 启动定时任务
  const timerId = setInterval(cleanupTask, checkInterval);
  
  // 存储任务信息
  scheduledTasks.set(taskId, {
    id: timerId,
    type: 'interval',
    name: '日志清理',
    interval: checkInterval,
    lastRun: null,
    nextRun: new Date(Date.now() + checkInterval),
    status: 'running'
  });
  
  return taskId;
}

/**
 * 停止指定的计划任务
 * @param {string} taskId - 任务ID
 * @returns {boolean} 是否成功停止
 */
function stopTask(taskId) {
  if (!scheduledTasks.has(taskId)) {
    logger.warn('尝试停止不存在的任务', { taskId });
    return false;
  }
  
  const task = scheduledTasks.get(taskId);
  
  if (task.type === 'interval') {
    clearInterval(task.id);
  } else if (task.type === 'timeout') {
    clearTimeout(task.id);
  }
  
  logger.info('停止计划任务', {
    taskId,
    name: task.name
  });
  
  scheduledTasks.delete(taskId);
  return true;
}

/**
 * 获取所有计划任务的状态
 * @returns {Object[]} 任务状态列表
 */
function getTasksStatus() {
  const tasks = [];
  
  for (const [id, task] of scheduledTasks.entries()) {
    tasks.push({
      id,
      name: task.name,
      status: task.status,
      lastRun: task.lastRun,
      nextRun: task.nextRun,
      interval: task.interval
    });
  }
  
  return tasks;
}

/**
 * 应用启动时初始化所有计划任务
 */
function initScheduledTasks() {
  // 根据配置决定是否启动各任务
  if (config.security?.autoKeyRotation !== false) {
    startKeyRotationTask({
      providers: config.security?.keyProviders || ['default'],
      daysBeforeExpiry: config.security?.keyRotationDays || 7
    });
  }
  
  if (config.logs?.autoCleanup !== false) {
    startLogCleanupTask({
      keepDays: config.logs?.keepDays || 30,
      logTypes: config.logs?.cleanupTypes || ['payment', 'security', 'audit']
    });
  }
  
  logger.info('计划任务初始化完成');
}

/**
 * 应用关闭时停止所有计划任务
 */
function stopAllTasks() {
  for (const taskId of scheduledTasks.keys()) {
    stopTask(taskId);
  }
  
  logger.info('所有计划任务已停止');
}

// 导出函数
module.exports = {
  startKeyRotationTask,
  startLogCleanupTask,
  stopTask,
  getTasksStatus,
  initScheduledTasks,
  stopAllTasks
}; 