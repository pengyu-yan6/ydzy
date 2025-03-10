/**
 * AIComponent.ts
 * AI组件 - 存储AI实体的行为状态和决策参数
 */
import { Component } from '../Component';
import { AIBehaviorType } from '../systems/AISystem';

/**
 * AI组件 - 用于控制非玩家角色的行为
 */
export class AIComponent implements Component {
  readonly type: string = 'AI';
  
  // 当前行为
  public currentBehavior: AIBehaviorType = AIBehaviorType.IDLE;
  
  // 默认行为
  public defaultBehavior: AIBehaviorType = AIBehaviorType.PATROL;
  
  // AI决策计时器
  public decisionTimer: number = 0;
  
  // AI决策间隔（秒）
  public decisionInterval: number = 1.0;
  
  // 待机计时器
  public idleTimer: number = 0;
  
  // 当前朝向（角度）
  public facingDirection: number = 0;
  
  // 巡逻路径点
  public patrolPoints: { x: number, y: number }[] = [];
  
  // 当前巡逻点索引
  public currentPatrolIndex: number = -1;
  
  // 巡逻半径
  public patrolRadius: number = 5;
  
  // 守卫位置
  public guardPosition: { x: number, y: number } | null = null;
  
  // 检测范围
  public detectionRange: number = 5;
  
  // 支援范围
  public supportRange: number = 8;
  
  // 逃跑生命值百分比阈值
  public fleeHealthPercentage: number = 20;
  
  // 安全生命值百分比阈值（停止逃跑）
  public safeHealthPercentage: number = 40;
  
  // 攻击性（0-100）
  public aggressiveness: number = 50;
  
  constructor(params: Partial<AIComponent> = {}) {
    Object.assign(this, params);
  }
}