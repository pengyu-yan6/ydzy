/**
 * MonitoringConfig.ts
 * 游戏监控指标配置
 * 定义支付成功率、战斗逻辑异常率和自动扩容触发条件的监控指标
 */

/**
 * 支付成功率监控配置
 */
export interface PaymentSuccessRateConfig {
  // 监控指标名称
  metricName: string;
  // 监控频率（秒）
  interval: number;
  // 告警阈值（百分比）
  alertThreshold: number;
  // 严重告警阈值（百分比）
  criticalThreshold: number;
  // 按支付渠道分类
  channelSpecific: boolean;
  // 统计窗口大小（分钟）
  windowSize: number;
}

/**
 * 战斗逻辑异常率监控配置
 */
export interface BattleLogicErrorRateConfig {
  // 监控指标名称
  metricName: string;
  // 监控频率（秒）
  interval: number;
  // 告警阈值（百分比）
  alertThreshold: number;
  // 严重告警阈值（百分比）
  criticalThreshold: number;
  // 异常类型分类监控
  errorTypeSpecific: boolean;
  // 统计窗口大小（分钟）
  windowSize: number;
}

/**
 * 自动扩容触发条件配置
 */
export interface AutoScalingConfig {
  // CPU使用率触发阈值（百分比）
  cpuThreshold: number;
  // 内存使用率触发阈值（百分比）
  memoryThreshold: number;
  // 请求响应时间阈值（毫秒）
  responseTimeThreshold: number;
  // 并发用户数阈值
  concurrentUsersThreshold: number;
  // 冷却时间（分钟）
  cooldownPeriod: number;
  // 最小实例数
  minInstances: number;
  // 最大实例数
  maxInstances: number;
  // 每次扩容增加的实例数
  scaleOutIncrement: number;
  // 每次缩容减少的实例数
  scaleInDecrement: number;
  // 是否启用预测性扩容
  predictiveScaling: boolean;
}

/**
 * 默认支付成功率监控配置
 */
export const defaultPaymentSuccessRateConfig: PaymentSuccessRateConfig = {
  metricName: 'payment_success_rate',
  interval: 60, // 每分钟监控一次
  alertThreshold: 95, // 成功率低于95%告警
  criticalThreshold: 90, // 成功率低于90%严重告警
  channelSpecific: true, // 按支付渠道分类监控
  windowSize: 5 // 5分钟滑动窗口
};

/**
 * 默认战斗逻辑异常率监控配置
 */
export const defaultBattleLogicErrorRateConfig: BattleLogicErrorRateConfig = {
  metricName: 'battle_logic_error_rate',
  interval: 300, // 每5分钟监控一次
  alertThreshold: 2, // 异常率超过2%告警
  criticalThreshold: 5, // 异常率超过5%严重告警
  errorTypeSpecific: true, // 按异常类型分类监控
  windowSize: 15 // 15分钟滑动窗口
};

/**
 * 默认自动扩容触发条件配置
 */
export const defaultAutoScalingConfig: AutoScalingConfig = {
  cpuThreshold: 70, // CPU使用率超过70%触发扩容
  memoryThreshold: 75, // 内存使用率超过75%触发扩容
  responseTimeThreshold: 500, // 响应时间超过500ms触发扩容
  concurrentUsersThreshold: 1000, // 并发用户数超过1000触发扩容
  cooldownPeriod: 5, // 扩容后5分钟冷却时间
  minInstances: 2, // 最小2个实例
  maxInstances: 10, // 最大10个实例
  scaleOutIncrement: 2, // 每次扩容增加2个实例
  scaleInDecrement: 1, // 每次缩容减少1个实例
  predictiveScaling: true // 启用预测性扩容
};

/**
 * 游戏高峰期自动扩容配置
 */
export const peakTimeAutoScalingConfig: AutoScalingConfig = {
  ...defaultAutoScalingConfig,
  cpuThreshold: 60, // 更低的CPU阈值，提前扩容
  responseTimeThreshold: 300, // 更低的响应时间阈值
  concurrentUsersThreshold: 800, // 更低的并发用户数阈值
  minInstances: 4, // 更高的最小实例数
  maxInstances: 20, // 更高的最大实例数
  scaleOutIncrement: 4 // 更快的扩容速度
};

/**
 * 支付系统专用自动扩容配置
 */
export const paymentSystemAutoScalingConfig: AutoScalingConfig = {
  ...defaultAutoScalingConfig,
  cpuThreshold: 50, // 支付系统CPU阈值更低
  memoryThreshold: 60, // 支付系统内存阈值更低
  responseTimeThreshold: 200, // 支付系统响应时间要求更高
  minInstances: 3, // 支付系统最小实例数更高
  cooldownPeriod: 10 // 支付系统扩容冷却期更长，避免频繁扩缩容
};