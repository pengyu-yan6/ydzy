/**
 * CombatComponents.ts
 * 定义与战斗相关的组件
 */
import { Component } from '../Component';
import { EffectType, Skill, TargetType } from '../../../models/CharacterStats';

/**
 * 战斗状态组件 - 用于表示实体的战斗状态
 */
export class CombatStateComponent implements Component {
  readonly type: string = 'CombatState';
  
  constructor(
    public isInCombat: boolean = false,    // 是否在战斗中
    public isAlive: boolean = true,        // 是否存活
    public currentTarget: number | null = null, // 当前目标实体ID
    public attackCooldown: number = 0,     // 攻击冷却时间
    public lastAttackTime: number = 0,     // 上次攻击时间
    public combatStartTime: number = 0     // 战斗开始时间
  ) {}
}

/**
 * 技能组件 - 用于管理实体的技能
 */
export class SkillsComponent implements Component {
  readonly type: string = 'Skills';
  
  constructor(
    public skills: Skill[] = [],           // 技能列表
    public activeSkillIndex: number = -1,   // 当前激活的技能索引
    public skillCooldowns: Map<string, number> = new Map(), // 技能冷却时间映射
    public currentEnergy: number = 0,       // 当前能量值
    public maxEnergy: number = 100          // 最大能量值
  ) {}
  
  /**
   * 检查技能是否可用
   * @param skillId 技能ID
   */
  canUseSkill(skillId: string): boolean {
    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return false;
    
    // 检查冷却时间
    const cooldown = this.skillCooldowns.get(skillId) || 0;
    if (cooldown > 0) return false;
    
    // 检查能量
    if (skill.energyCost > this.currentEnergy) return false;
    
    return true;
  }
  
  /**
   * 使用技能
   * @param skillId 技能ID
   */
  useSkill(skillId: string): Skill | null {
    if (!this.canUseSkill(skillId)) return null;
    
    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return null;
    
    // 消耗能量
    this.currentEnergy -= skill.energyCost;
    
    // 设置冷却时间
    this.skillCooldowns.set(skillId, skill.cooldown);
    
    return skill;
  }
  
  /**
   * 更新技能冷却时间
   * @param deltaTime 时间增量
   */
  updateCooldowns(deltaTime: number): void {
    for (const [skillId, cooldown] of this.skillCooldowns.entries()) {
      if (cooldown > 0) {
        const newCooldown = cooldown - deltaTime;
        this.skillCooldowns.set(skillId, Math.max(0, newCooldown));
      }
    }
  }
}

/**
 * 效果组件 - 用于管理实体身上的增益/减益效果
 */
export class EffectsComponent implements Component {
  readonly type: string = 'Effects';
  
  constructor(
    public effects: {
      id: string;              // 效果ID
      name: string;            // 效果名称
      type: EffectType;        // 效果类型
      value: number;           // 效果数值
      duration: number;        // 持续时间
      remainingTime: number;   // 剩余时间
      sourceEntityId: number;  // 效果来源实体ID
    }[] = []
  ) {}
  
  /**
   * 添加效果
   * @param effect 效果对象
   */
  addEffect(effect: {
    id: string;
    name: string;
    type: EffectType;
    value: number;
    duration: number;
    sourceEntityId: number;
  }): void {
    // 检查是否已存在相同效果，如果存在则刷新持续时间
    const existingEffect = this.effects.find(e => e.id === effect.id);
    if (existingEffect) {
      existingEffect.value = effect.value;
      existingEffect.duration = effect.duration;
      existingEffect.remainingTime = effect.duration;
      return;
    }
    
    // 添加新效果
    this.effects.push({
      ...effect,
      remainingTime: effect.duration
    });
  }
  
  /**
   * 移除效果
   * @param effectId 效果ID
   */
  removeEffect(effectId: string): void {
    const index = this.effects.findIndex(e => e.id === effectId);
    if (index !== -1) {
      this.effects.splice(index, 1);
    }
  }
  
  /**
   * 更新效果持续时间
   * @param deltaTime 时间增量
   * @returns 已过期的效果ID列表
   */
  updateEffects(deltaTime: number): string[] {
    const expiredEffects: string[] = [];
    
    for (const effect of this.effects) {
      effect.remainingTime -= deltaTime;
      
      if (effect.remainingTime <= 0) {
        expiredEffects.push(effect.id);
      }
    }
    
    // 移除过期效果
    this.effects = this.effects.filter(e => e.remainingTime > 0);
    
    return expiredEffects;
  }
  
  /**
   * 获取特定类型的效果总值
   * @param type 效果类型
   */
  getEffectValueByType(type: EffectType): number {
    return this.effects
      .filter(e => e.type === type)
      .reduce((sum, effect) => sum + effect.value, 0);
  }
}

/**
 * 目标选择组件 - 用于处理目标选择逻辑
 */
export class TargetingComponent implements Component {
  readonly type: string = 'Targeting';
  
  constructor(
    public targetType: TargetType = TargetType.SINGLE, // 目标类型
    public range: number = 1,                          // 攻击范围
    public preferredTargets: number[] = [],            // 优先目标实体ID列表
    public targetEntityIds: number[] = []              // 当前目标实体ID列表
  ) {}
}

/**
 * 队伍组件 - 用于标识实体所属队伍
 */
export class TeamComponent implements Component {
  readonly type: string = 'Team';
  
  constructor(
    public teamId: number = 0,         // 队伍ID
    public position: number = 0,        // 在队伍中的位置
    public isLeader: boolean = false    // 是否为队长
  ) {}
}

/**
 * 羁绊组件 - 用于处理角色羁绊效果
 */
export class SynergyComponent implements Component {
  readonly type: string = 'Synergy';
  
  constructor(
    public activeClassSynergies: Map<string, number> = new Map(), // 激活的职业羁绊及其等级
    public activeRaceSynergies: Map<string, number> = new Map(),  // 激活的种族羁绊及其等级
    public synergyBonuses: Partial<Record<string, number>> = {}   // 羁绊提供的属性加成
  ) {}
}