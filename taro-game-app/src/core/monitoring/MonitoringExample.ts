/**
 * MonitoringExample.ts
 * 监控系统使用示例
 * 展示如何在项目中使用监控系统记录支付事件、战斗逻辑异常和系统资源使用情况
 */
import { MonitoringService, PaymentEvent, BattleLogicErrorEvent, SystemResourceUsage, AlertLevel, AlertMessage } from './MonitoringService';

/**
 * 初始化监控系统
 */
export function initMonitoringSystem(): void {
  const monitoringService = MonitoringService.getInstance();
  
  // 注册告警回调
  monitoringService.registerAlertCallback((alert: AlertMessage) => {
    // 处理告警消息，例如发送到日志系统
    console.log(`收到告警: [${alert.level}] ${alert.title}`);
    
    // 对于严重告警，可以发送到运维人员
    if (alert.level === AlertLevel.CRITICAL) {
      sendAlertToOperations(alert);
    }
  });
  
  // 注册自动扩容回调
  monitoringService.registerScalingCallbacks(
    // 扩容回调
    (reason: string) => {
      console.log(`触发扩容: ${reason}`);
      // 调用云服务API进行实例扩容
      scaleOutInstances();
    },
    // 缩容回调
    (reason: string) => {
      console.log(`触发缩容: ${reason}`);
      // 调用云服务API进行实例缩容
      scaleInInstances();
    }
  );
  
  // 根据当前时间段设置不同的扩容策略
  setupScalingStrategy();
  
  // 启动资源使用情况采集
  startResourceUsageCollection();
  
  console.log('监控系统初始化完成');
}

/**
 * 记录支付事件
 * 在支付服务中调用此函数记录支付结果
 */
export function recordPayment(orderId: string, channel: 'weapp' | 'alipay' | 'tt', amount: number, success: boolean, errorCode?: string, errorMessage?: string): void {
  const paymentEvent: PaymentEvent = {
    orderId,
    channel,
    amount,
    success,
    errorCode,
    errorMessage,
    timestamp: Date.now()
  };
  
  // 记录支付事件
  MonitoringService.getInstance().recordPaymentEvent(paymentEvent);
  
  // 记录到日志系统
  console.log(`支付${success ? '成功' : '失败'}: 订单${orderId}, 渠道${channel}, 金额${amount}分`);
}

/**
 * 记录战斗逻辑异常
 * 在战斗系统中调用此函数记录异常情况
 */
export function recordBattleError(battleId: string, errorType: string, message: string, stackTrace?: string, affectedEntities?: string[]): void {
  const errorEvent: BattleLogicErrorEvent = {
    battleId,
    errorType,
    message,
    stackTrace,
    affectedEntities,
    timestamp: Date.now()
  };
  
  // 记录战斗逻辑异常
  MonitoringService.getInstance().recordBattleLogicError(errorEvent);
  
  // 记录到日志系统
  console.error(`战斗异常: 战斗ID${battleId}, 类型${errorType}, 消息: ${message}`);
}

/**
 * 采集系统资源使用情况
 */
function startResourceUsageCollection(): void {
  // 每30秒采集一次系统资源使用情况
  setInterval(() => {
    // 这里应该调用实际的系统API获取资源使用情况
    // 以下是模拟数据
    const usage: SystemResourceUsage = {
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
      responseTime: Math.random() * 1000,
      concurrentUsers: Math.floor(Math.random() * 2000),
      timestamp: Date.now()
    };
    
    // 记录系统资源使用情况
    MonitoringService.getInstance().recordSystemResourceUsage(usage);
  }, 30 * 1000);
}

/**
 * 根据当前时间段设置不同的扩容策略
 */
function setupScalingStrategy(): void {
  const monitoringService = MonitoringService.getInstance();
  
  // 检查当前是否是高峰期
  const now = new Date();
  const hour = now.getHours();
  
  // 假设19:00-23:00是游戏高峰期
  if (hour >= 19 && hour < 23) {
    // 使用高峰期扩容配置
    monitoringService.usePeakTimeScalingConfig();
    console.log('已启用高峰期扩容策略');
  } else {
    // 使用默认扩容配置
    monitoringService.setAutoScalingConfig({
      // 可以根据需要调整默认配置
    });
    console.log('已启用默认扩容策略');
  }
  
  // 每小时检查一次是否需要切换策略
  setInterval(setupScalingStrategy, 60 * 60 * 1000);
}

/**
 * 发送告警到运维人员
 */
function sendAlertToOperations(alert: AlertMessage): void {
  // 这里应该调用实际的告警API，如发送邮件、短信、钉钉等
  console.log(`向运维人员发送告警: ${alert.title} - ${alert.message}`);
}

/**
 * 调用云服务API进行实例扩容
 */
function scaleOutInstances(): void {
  // 这里应该调用实际的云服务API进行扩容
  console.log('调用云服务API进行实例扩容');
}

/**
 * 调用云服务API进行实例缩容
 */
function scaleInInstances(): void {
  // 这里应该调用实际的云服务API进行缩容
  console.log('调用云服务API进行实例缩容');
}

/**
 * 使用示例：
 * 
 * // 在应用启动时初始化监控系统
 * initMonitoringSystem();
 * 
 * // 在支付完成后记录支付事件
 * recordPayment('order123456', 'weapp', 9900, true);
 * 
 * // 在支付失败时记录支付事件
 * recordPayment('order654321', 'tt', 6800, false, 'PAYMENT_CANCEL', '用户取消支付');
 * 
 * // 在检测到战斗逻辑异常时记录
 * recordBattleError('battle789012', 'DAMAGE_CALCULATION_ERROR', '伤害计算结果为负数', 
 *   'Error stack trace...', ['player123', 'monster456']);
 */