/**
 * DamageCalculator.ts
 * 实现伤害计算模块，处理战斗中的伤害计算逻辑
 */
import { CharacterStatsComponent } from '../components/MovementComponents';
import { Entity } from '../Entity';

/**
 * 伤害类型枚举
 */
export enum DamageType {
  PHYSICAL = 'physical',   // 物理伤害
  MAGICAL = 'magical',     // 魔法伤害
  TRUE = 'true',           // 真实伤害（无视防御）
  PURE = 'pure'            // 纯粹伤害（无视所有减伤效果）
}

/**
 * 伤害结果接口
 */
export interface DamageResult {
  rawDamage: number;       // 原始伤害值
  finalDamage: number;     // 最终伤害值
  isCritical: boolean;     // 是否暴击
  isEvaded: boolean;       // 是否闪避
  damageReduction: number; // 伤害减免量
  damageType: DamageType;  // 伤害类型
}

/**
 * 伤害计算器 - 处理战斗中的伤害计算
 */
export class DamageCalculator {
  /**
   * 计算伤害
   * @param attacker 攻击者实体
   * @param defender 防御者实体
   * @param baseDamage 基础伤害值
   * @param damageType 伤害类型
   * @param skillMultiplier 技能倍率
   */
  public static calculateDamage(
    attacker: Entity,
    defender: Entity,
    baseDamage: number = 0,
    damageType: DamageType = DamageType.PHYSICAL,
    skillMultiplier: number = 1.0
  ): DamageResult {
    // 获取攻击者和防御者的属性组件
    const attackerStats = attacker.getComponent<CharacterStatsComponent>('CharacterStats');
    const defenderStats = defender.getComponent<CharacterStatsComponent>('CharacterStats');
    
    if (!attackerStats || !defenderStats) {
      return this.createEmptyDamageResult(damageType);
    }
    
    // 计算基础伤害
    let rawDamage = baseDamage;
    
    // 如果没有提供基础伤害，则根据伤害类型和攻击者属性计算
    if (rawDamage <= 0) {
      if (damageType === DamageType.PHYSICAL) {
        rawDamage = attackerStats.attack;
      } else if (damageType === DamageType.MAGICAL) {
        rawDamage = attackerStats.magicPower;
      } else {
        // 对于真实伤害和纯粹伤害，使用攻击力和法术强度的平均值
        rawDamage = (attackerStats.attack + attackerStats.magicPower) / 2;
      }
    }
    
    // 应用技能倍率
    rawDamage *= skillMultiplier;
    
    // 检查闪避（仅对物理伤害有效）
    const isEvaded = damageType === DamageType.PHYSICAL && this.checkEvasion(defenderStats);
    if (isEvaded) {
      return {
        rawDamage,
        finalDamage: 0,
        isCritical: false,
        isEvaded: true,
        damageReduction: rawDamage,
        damageType
      };
    }
    
    // 检查暴击
    const isCritical = this.checkCritical(attackerStats);
    let finalDamage = rawDamage;
    
    // 应用暴击伤害
    if (isCritical) {
      finalDamage *= attackerStats.critDamage;
    }
    
    // 计算伤害减免
    let damageReduction = 0;
    
    // 根据伤害类型应用不同的防御计算
    if (damageType === DamageType.PHYSICAL) {
      // 物理伤害减免公式
      damageReduction = this.calculatePhysicalDamageReduction(finalDamage, defenderStats.defense);
    } else if (damageType === DamageType.MAGICAL) {
      // 魔法伤害减免公式
      damageReduction = this.calculateMagicalDamageReduction(finalDamage, defenderStats.magicResist);
    } else if (damageType === DamageType.TRUE) {
      // 真实伤害无视防御，但可能受到其他减伤效果影响
      damageReduction = 0;
    } else if (damageType === DamageType.PURE) {
      // 纯粹伤害无视所有减伤效果
      damageReduction = 0;
    }
    
    // 应用伤害减免
    finalDamage -= damageReduction;
    
    // 确保最终伤害不小于1（除非完全闪避）
    finalDamage = Math.max(finalDamage, 1);
    
    return {
      rawDamage,
      finalDamage,
      isCritical,
      isEvaded: false,
      damageReduction,
      damageType
    };
  }
  
  /**
   * 检查是否触发暴击
   * @param stats 攻击者属性
   */
  private static checkCritical(stats: CharacterStatsComponent): boolean {
    return Math.random() < stats.critChance;
  }
  
  /**
   * 检查是否闪避攻击
   * @param stats 防御者属性
   */
  private static checkEvasion(stats: CharacterStatsComponent): boolean {
    // 根据角色敏捷属性计算闪避率
    const evasionChance = stats.agility * 0.001; // 每点敏捷提供0.1%闪避率
    return Math.random() < evasionChance;
  }
  
  /**
   * 计算物理伤害减免
   * @param damage 伤害值
   * @param defense 防御值
   */
  private static calculatePhysicalDamageReduction(damage: number, defense: number): number {
    // 物理伤害减免公式：防御/(防御+100) 的百分比减伤
    const damageReductionRatio = defense / (defense + 100);
    return damage * damageReductionRatio;
  }
  
  /**
   * 计算魔法伤害减免
   * @param damage 伤害值
   * @param magicResist 魔法抗性
   */
  private static calculateMagicalDamageReduction(damage: number, magicResist: number): number {
    // 魔法伤害减免公式：魔抗/(魔抗+100) 的百分比减伤
    const damageReductionRatio = magicResist / (magicResist + 100);
    return damage * damageReductionRatio;
  }
  
  /**
   * 创建空的伤害结果
   * @param damageType 伤害类型
   */
  private static createEmptyDamageResult(damageType: DamageType): DamageResult {
    return {
      rawDamage: 0,
      finalDamage: 0,
      isCritical: false,
      isEvaded: false,
      damageReduction: 0,
      damageType
    };
  }
  
  /**
   * 应用伤害到目标实体
   * @param target 目标实体
   * @param damageResult 伤害结果
   * @returns 目标是否死亡
   */
  public static applyDamage(target: Entity, damageResult: DamageResult): boolean {
    const stats = target.getComponent<CharacterStatsComponent>('CharacterStats');
    if (!stats) return false;
    
    // 应用伤害
    stats.health -= damageResult.finalDamage;
    
    // 检查是否死亡
    if (stats.health <= 0) {
      stats.health = 0;
      return true; // 目标死亡
    }
    
    return false; // 目标存活
  }
  
  /**
   * 计算治疗量
   * @param healer 治疗者实体
   * @param target 目标实体
   * @param baseHeal 基础治疗量
   * @param healMultiplier 治疗倍率
   */
  public static calculateHealing(
    healer: Entity,
    target: Entity,
    baseHeal: number = 0,
    healMultiplier: number = 1.0
  ): number {
    const healerStats = healer.getComponent<CharacterStatsComponent>('CharacterStats');
    const targetStats = target.getComponent<CharacterStatsComponent>('CharacterStats');
    
    if (!healerStats || !targetStats) return 0;
    
    // 计算基础治疗量
    let healing = baseHeal;
    
    // 如果没有提供基础治疗量，则根据治疗者的魔法强度计算
    if (healing <= 0) {
      healing = healerStats.magicPower * 0.5; // 治疗量为魔法强度的50%
    }
    
    // 应用治疗倍率
    healing *= healMultiplier;
    
    // 检查暴击（治疗也可以暴击）
    const isCritical = this.checkCritical(healerStats);
    if (isCritical) {
      healing *= healerStats.critDamage;
    }
    
    // 确保治疗量不小于1
    healing = Math.max(healing, 1);
    
    return healing;
  }
  
  /**
   * 应用治疗到目标实体
   * @param target 目标实体
   * @param healAmount 治疗量
   */
  public static applyHealing(target: Entity, healAmount: number): void {
    const stats = target.getComponent<CharacterStatsComponent>('CharacterStats');
    if (!stats) return;
    
    // 应用治疗
    stats.health += healAmount;
    
    // 确保生命值不超过最大生命值
    stats.health = Math.min(stats.health, stats.maxHealth);
  }
}