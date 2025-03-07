/**
 * MonitoringService.ts
 * 游戏监控服务实现
 * 实现支付成功率监控、战斗逻辑异常率统计和自动扩容触发的具体逻辑
 */
import { 
  PaymentSuccessRateConfig, 
  BattleLogicErrorRateConfig, 
  AutoScalingConfig,
  defaultPaymentSuccessRateConfig,
  defaultBattleLogicErrorRateConfig,
  defaultAutoScalingConfig,
  peakTimeAutoScalingConfig,
  paymentSystemAutoScalingConfig
} from './MonitoringConfig';

/**
 * 支付事件数据
 */
export interface PaymentEvent {
  orderId: string;
  channel: 'weapp' | 'alipay' | 'tt';
  amount: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  timestamp: number;
}

/**
 * 战斗逻辑异常事件数据
 */
export interface BattleLogicErrorEvent {
  battleId: string;
  errorType: string;
  message: string;
  stackTrace?: string;
  affectedEntities?: string[];
  timestamp: number;
}

/**
 * 系统资源使用情况
 */
export interface SystemResourceUsage {
  cpuUsage: number; // 百分比
  memoryUsage: number; // 百分比
  responseTime: number; // 毫秒
  concurrentUsers: number; // 当前并发用户数
  timestamp: number;
}

/**
 * 告警级别
 */
export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

/**
 * 告警消息
 */
export interface AlertMessage {
  level: AlertLevel;
  title: string;
  message: string;
  metricName: string;
  metricValue: number;
  threshold: number;
  timestamp: number;
}

/**
 * 监控服务类
 */
export class MonitoringService {
  private static instance: MonitoringService;
  
  // 配置
  private paymentConfig: PaymentSuccessRateConfig;
  private battleLogicConfig: BattleLogicErrorRateConfig;
  private autoScalingConfig: AutoScalingConfig;
  
  // 数据存储
  private paymentEvents: PaymentEvent[] = [];
  private battleLogicErrors: BattleLogicErrorEvent[] = [];
  private resourceUsageHistory: SystemResourceUsage[] = [];
  
  // 告警回调
  private alertCallbacks: ((alert: AlertMessage) => void)[] = [];
  
  // 自动扩容回调
  private scaleOutCallback?: (reason: string) => void;
  private scaleInCallback?: (reason: string) => void;
  
  // 上次扩容时间
  private lastScalingTime: number = 0;
  
  /**
   * 私有构造函数，使用单例模式
   */
  private constructor() {
    this.paymentConfig = defaultPaymentSuccessRateConfig;
    this.battleLogicConfig = defaultBattleLogicErrorRateConfig;
    this.autoScalingConfig = defaultAutoScalingConfig;
    
    // 启动定时监控任务
    this.startMonitoringTasks();
  }
  
  /**
   * 获取单例实例
   */
  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }
  
  /**
   * 启动监控任务
   */
  private startMonitoringTasks(): void {
    // 支付成功率监控任务
    setInterval(() => {
      this.checkPaymentSuccessRate();
    }, this.paymentConfig.interval * 1000);
    
    // 战斗逻辑异常率监控任务
    setInterval(() => {
      this.checkBattleLogicErrorRate();
    }, this.battleLogicConfig.interval * 1000);
    
    // 自动扩容监控任务
    setInterval(() => {
      this.checkAutoScalingConditions();
    }, 60 * 1000); // 每分钟检查一次
    
    // 数据清理任务
    setInterval(() => {
      this.cleanupOldData();
    }, 3600 * 1000); // 每小时清理一次
  }
  
  /**
   * 记录支付事件
   * @param event 支付事件数据
   */
  public recordPaymentEvent(event: PaymentEvent): void {
    this.paymentEvents.push(event);
  }
  
  /**
   * 记录战斗逻辑异常
   * @param event 战斗逻辑异常事件数据
   */
  public recordBattleLogicError(event: BattleLogicErrorEvent): void {
    this.battleLogicErrors.push(event);
  }
  
  /**
   * 记录系统资源使用情况
   * @param usage 系统资源使用情况
   */
  public recordSystemResourceUsage(usage: SystemResourceUsage): void {
    this.resourceUsageHistory.push(usage);
  }
  
  /**
   * 注册告警回调
   * @param callback 告警回调函数
   */
  public registerAlertCallback(callback: (alert: AlertMessage) => void): void {
    this.alertCallbacks.push(callback);
  }
  
  /**
   * 注册自动扩容回调
   * @param scaleOut 扩容回调
   * @param scaleIn 缩容回调
   */
  public registerScalingCallbacks(
    scaleOut: (reason: string) => void,
    scaleIn: (reason: string) => void
  ): void {
    this.scaleOutCallback = scaleOut;
    this.scaleInCallback = scaleIn;
  }
  
  /**
   * 设置支付成功率监控配置
   * @param config 配置
   */
  public setPaymentConfig(config: Partial<PaymentSuccessRateConfig>): void {
    this.paymentConfig = { ...this.paymentConfig, ...config };
  }
  
  /**
   * 设置战斗逻辑异常率监控配置
   * @param config 配置
   */
  public setBattleLogicConfig(config: Partial<BattleLogicErrorRateConfig>): void {
    this.battleLogicConfig = { ...this.battleLogicConfig, ...config };
  }
  
  /**
   * 设置自动扩容配置
   * @param config 配置
   */
  public setAutoScalingConfig(config: Partial<AutoScalingConfig>): void {
    this.autoScalingConfig = { ...this.autoScalingConfig, ...config };
  }
  
  /**
   * 使用预设的高峰期扩容配置
   */
  public usePeakTimeScalingConfig(): void {
    this.autoScalingConfig = peakTimeAutoScalingConfig;
  }
  
  /**
   * 使用预设的支付系统扩容配置
   */
  public usePaymentSystemScalingConfig(): void {
    this.autoScalingConfig = paymentSystemAutoScalingConfig;
  }
  
  /**
   * 检查支付成功率
   */
  private checkPaymentSuccessRate(): void {
    const now = Date.now();
    const windowStartTime = now - (this.paymentConfig.windowSize * 60 * 1000);
    
    // 获取窗口期内的支付事件
    const eventsInWindow = this.paymentEvents.filter(event => event.timestamp >= windowStartTime);
    
    if (eventsInWindow.length === 0) return;
    
    // 如果需要按渠道分类监控
    if (this.paymentConfig.channelSpecific) {
      // 按渠道分组
      const channelGroups: Record<string, PaymentEvent[]> = {};
      eventsInWindow.forEach(event => {
        if (!channelGroups[event.channel]) {
          channelGroups[event.channel] = [];
        }
        channelGroups[event.channel].push(event);
      });
      
      // 检查每个渠道的成功率
      Object.entries(channelGroups).forEach(([channel, events]) => {
        this.checkChannelSuccessRate(channel, events);
      });
    } else {
      // 整体成功率监控
      const successCount = eventsInWindow.filter(event => event.success).length;
      const totalCount = eventsInWindow.length;
      const successRate = (successCount / totalCount) * 100;
      
      // 检查是否需要告警
      this.checkSuccessRateAlert('overall', successRate);
    }
  }
  
  /**
   * 检查特定渠道的支付成功率
   * @param channel 支付渠道
   * @param events 支付事件列表
   */
  private checkChannelSuccessRate(channel: string, events: PaymentEvent[]): void {
    const successCount = events.filter(event => event.success).length;
    const totalCount = events.length;
    const successRate = (successCount / totalCount) * 100;
    
    // 检查是否需要告警
    this.checkSuccessRateAlert(channel, successRate);
  }
  
  /**
   * 检查成功率是否需要告警
   * @param channel 支付渠道
   * @param successRate 成功率
   */
  private checkSuccessRateAlert(channel: string, successRate: number): void {
    if (successRate < this.paymentConfig.criticalThreshold) {
      // 严重告警
      this.sendAlert({
        level: AlertLevel.CRITICAL,
        title: `支付成功率严重下降 [${channel}]`,
        message: `${channel} 渠道支付成功率为 ${successRate.toFixed(2)}%，低于严重告警阈值 ${this.paymentConfig.criticalThreshold}%`,
        metricName: this.paymentConfig.metricName,
        metricValue: successRate,
        threshold: this.paymentConfig.criticalThreshold,
        timestamp: Date.now()
      });
    } else if (successRate < this.paymentConfig.alertThreshold) {
      // 一般告警
      this.sendAlert({
        level: AlertLevel.WARNING,
        title: `支付成功率下降 [${channel}]`,
        message: `${channel} 渠道支付成功率为 ${successRate.toFixed(2)}%，低于告警阈值 ${this.paymentConfig.alertThreshold}%`,
        metricName: this.paymentConfig.metricName,
        metricValue: successRate,
        threshold: this.paymentConfig.alertThreshold,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * 检查战斗逻辑异常率
   */
  private checkBattleLogicErrorRate(): void {
    const now = Date.now();
    const windowStartTime = now - (this.battleLogicConfig.windowSize * 60 * 1000);
    
    // 获取窗口期内的战斗逻辑异常事件
    const errorsInWindow = this.battleLogicErrors.filter(error => error.timestamp >= windowStartTime);
    
    // 估算总战斗次数（这里需要根据实际情况调整，可能需要额外记录总战斗次数）
    // 这里假设每分钟有100场战斗
    const estimatedBattleCount = this.battleLogicConfig.windowSize * 100;
    
    if (estimatedBattleCount === 0) return;
    
    // 如果需要按异常类型分类监控
    if (this.battleLogicConfig.errorTypeSpecific) {
      // 按异常类型分组
      const errorTypeGroups: Record<string, BattleLogicErrorEvent[]> = {};
      errorsInWindow.forEach(error => {
        if (!errorTypeGroups[error.errorType]) {
          errorTypeGroups[error.errorType] = [];
        }
        errorTypeGroups[error.errorType].push(error);
      });
      
      // 检查每种异常类型的发生率
      Object.entries(errorTypeGroups).forEach(([errorType, errors]) => {
        this.checkErrorTypeRate(errorType, errors.length, estimatedBattleCount);
      });
    } else {
      // 整体异常率监控
      const errorRate = (errorsInWindow.length / estimatedBattleCount) * 100;
      
      // 检查是否需要告警
      this.checkErrorRateAlert('overall', errorRate);
    }
  }
  
  /**
   * 检查特定异常类型的发生率
   * @param errorType 异常类型
   * @param errorCount 异常次数
   * @param totalCount 总战斗次数
   */
  private checkErrorTypeRate(errorType: string, errorCount: number, totalCount: number): void {
    const errorRate = (errorCount / totalCount) * 100;
    
    // 检查是否需要告警
    this.checkErrorRateAlert(errorType, errorRate);
  }
  
  /**
   * 检查异常率是否需要告警
   * @param errorType 异常类型
   * @param errorRate 异常率
   */
  private checkErrorRateAlert(errorType: string, errorRate: number): void {
    if (errorRate > this.battleLogicConfig.criticalThreshold) {
      // 严重告警
      this.sendAlert({
        level: AlertLevel.CRITICAL,
        title: `战斗逻辑异常率严重上升 [${errorType}]`,
        message: `${errorType} 类型的战斗逻辑异常率为 ${errorRate.toFixed(2)}%，超过严重告警阈值 ${this.battleLogicConfig.criticalThreshold}%`,
        metricName: this.battleLogicConfig.metricName,
        metricValue: errorRate,
        threshold: this.battleLogicConfig.criticalThreshold,
        timestamp: Date.now()
      });
    } else if (errorRate > this.battleLogicConfig.alertThreshold) {
      // 一般告警
      this.sendAlert({
        level: AlertLevel.WARNING,
        title: `战斗逻辑异常率上升 [${errorType}]`,
        message: `${errorType} 类型的战斗逻辑异常率为 ${errorRate.toFixed(2)}%，超过告警阈值 ${this.battleLogicConfig.alertThreshold}%`,
        metricName: this.battleLogicConfig.metricName,
        metricValue: errorRate,
        threshold: this.battleLogicConfig.alertThreshold,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * 发送告警消息
   * @param alert 告警消息
   */
  private sendAlert(alert: AlertMessage): void {
    // 调用所有注册的告警回调
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        console.error('告警回调执行失败:', error);
      }
    });
    
    // 这里可以添加其他告警渠道，如发送邮件、短信、钉钉等
    console.log(`[${alert.level}] ${alert.title}: ${alert.message}`);
  }
  
  /**
   * 检查自动扩容触发条件
   */
  private checkAutoScalingConditions(): void {
    const now = Date.now();
    
    // 检查冷却期
    if (now - this.lastScalingTime < this.autoScalingConfig.cooldownPeriod * 60 * 1000) {
      return; // 在冷却期内，不触发扩容
    }
    
    // 获取最近的资源使用情况
    const recentUsage = this.getRecentResourceUsage();
    if (!recentUsage) return;
    
    // 检查是否需要扩容
    if (this.needScaleOut(recentUsage)) {
      this.triggerScaleOut(recentUsage);
    }
    // 检查是否需要缩容
    else if (this.needScaleIn(recentUsage)) {
      this.triggerScaleIn(recentUsage);
    }
  }
  
  /**
   * 获取最近的资源使用情况
   */
  private getRecentResourceUsage(): SystemResourceUsage | null {
    if (this.resourceUsageHistory.length === 0) return null;
    
    // 获取最近5分钟的资源使用情况
    const now = Date.now();
    const recentTime = now - 5 * 60 * 1000;
    const recentUsages = this.resourceUsageHistory.filter(usage => usage.timestamp >= recentTime);
    
    if (recentUsages.length === 0) return null;
    
    // 计算平均值
    const avgCpuUsage = recentUsages.reduce((sum, usage) => sum + usage.cpuUsage, 0) / recentUsages.length;
    const avgMemoryUsage = recentUsages.reduce((sum, usage) => sum + usage.memoryUsage, 0) / recentUsages.length;
    const avgResponseTime = recentUsages.reduce((sum, usage) => sum + usage.responseTime, 0) / recentUsages.length;
    const maxConcurrentUsers = Math.max(...recentUsages.map(usage => usage.concurrentUsers));
    
    return {
      cpuUsage: avgCpuUsage,
      memoryUsage: avgMemoryUsage,
      responseTime: avgResponseTime,
      concurrentUsers: maxConcurrentUsers,
      timestamp: now
    };
  }
  
  /**
   * 检查是否需要扩容
   * @param usage 资源使用情况
   */
  private needScaleOut(usage: SystemResourceUsage): boolean {
    return (
      usage.cpuUsage > this.autoScalingConfig.cpuThreshold ||
      usage.memoryUsage > this.autoScalingConfig.memoryThreshold ||
      usage.responseTime > this.autoScalingConfig.responseTimeThreshold ||
      usage.concurrentUsers > this.autoScalingConfig.concurrentUsersThreshold
    );
  }
  
  /**
   * 检查是否需要缩容
   * @param usage 资源使用情况
   */
  private needScaleIn(usage: SystemResourceUsage): boolean {
    // 只有当所有指标都低于阈值的70%时才考虑缩容
    const cpuThreshold = this.autoScalingConfig.cpuThreshold * 0.7;
    const memoryThreshold = this.autoScalingConfig.memoryThreshold * 0.7;
    const responseTimeThreshold = this.autoScalingConfig.responseTimeThreshold * 0.7;
    const concurrentUsersThreshold = this.autoScalingConfig.concurrentUsersThreshold * 0.7;
    
    return (
      usage.cpuUsage < cpuThreshold &&
      usage.memoryUsage < memoryThreshold &&
      usage.responseTime < responseTimeThreshold &&
      usage.concurrentUsers < concurrentUsersThreshold
    );
  }
  
  /**
   * 触发扩容
   * @param usage 资源使用情况
   */
  private triggerScaleOut(usage: SystemResourceUsage): void {
    if (!this.scaleOutCallback) return;
    
    // 记录扩容时间
    this.lastScalingTime = Date.now();
    
    // 确定扩容原因
    let reason = '自动扩容触发: ';
    if (usage.cpuUsage > this.autoScalingConfig.cpuThreshold) {
      reason += `CPU使用率(${usage.cpuUsage.toFixed(2)}%)超过阈值(${this.autoScalingConfig.cpuThreshold}%) `;
    }
    if (usage.memoryUsage > this.autoScalingConfig.memoryThreshold) {
      reason += `内存使用率(${usage.memoryUsage.toFixed(2)}%)超过阈值(${this.autoScalingConfig.memoryThreshold}%) `;
    }
    if (usage.responseTime > this.autoScalingConfig.responseTimeThreshold) {
      reason += `响应时间(${usage.responseTime.toFixed(2)}ms)超过阈值(${this.autoScalingConfig.responseTimeThreshold}ms) `;
    }
    if (usage.concurrentUsers > this.autoScalingConfig.concurrentUsersThreshold) {
      reason += `并发用户数(${usage.concurrentUsers})超过阈值(${this.autoScalingConfig.concurrentUsersThreshold}) `;
    }
    
    // 调用扩容回调
    this.scaleOutCallback(reason);
    
    // 记录扩容事件
    console.log(`[自动扩容] ${reason}, 增加${this.autoScalingConfig.scaleOutIncrement}个实例`);
  }
  
  /**
   * 触发缩容
   * @param usage 资源使用情况
   */
  private triggerScaleIn(usage: SystemResourceUsage): void {
    if (!this.scaleInCallback) return;
    
    // 记录缩容时间
    this.lastScalingTime = Date.now();
    
    // 确定缩容原因
    const reason = `自动缩容触发: CPU使用率(${usage.cpuUsage.toFixed(2)}%), 内存使用率(${usage.memoryUsage.toFixed(2)}%), 响应时间(${usage.responseTime.toFixed(2)}ms), 并发用户数(${usage.concurrentUsers})均低于阈值的70%`;
    
    // 调用缩容回调
    this.scaleInCallback(reason);
    
    // 记录缩容事件
    console.log(`[自动缩容] ${reason}, 减少${this.autoScalingConfig.scaleInDecrement}个实例`);
  }
  
  /**
   * 清理旧数据
   */
  private cleanupOldData(): void {
    const now = Date.now();
    
    // 保留24小时内的支付事件
    const paymentRetentionTime = now - 24 * 60 * 60 * 1000;
    this.paymentEvents = this.paymentEvents.filter(event => event.timestamp >= paymentRetentionTime);
    
    // 保留24小时内的战斗逻辑异常
    this.battleLogicErrors = this.battleLogicErrors.filter(error => error.timestamp >= paymentRetentionTime);
    
    // 保留2小时内的资源使用情况
    const resourceRetentionTime = now - 2 * 60 * 60 * 1000;
    this.resourceUsageHistory = this.resourceUsageHistory.filter(usage => usage.timestamp >= resourceRetentionTime);
  }
}