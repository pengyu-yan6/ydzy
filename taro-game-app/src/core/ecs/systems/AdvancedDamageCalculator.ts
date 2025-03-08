/**
 * AdvancedDamageCalculator.ts
 * 高级伤害计算系统 - 提供更复杂和动态的伤害计算功能
 */
import { Entity } from '../Entity';
import { EntityManager } from '../EntityManager';
import { StatsComponent } from '../components/StatsComponent';
import { EffectsComponent } from '../components/CombatComponents';
import { DamageType } from '../../../models/CombatCalculator';
import { EffectType } from '../../../models/CharacterStats';

/**
 * 伤害计算结果接口
 */
export interface DamageResult {
  rawDamage: number;         // 原始伤害
  finalDamage: number;       // 最终伤害
  isCritical: boolean;       // 是否暴击
  isEvaded: boolean;         // 是否闪避
  isBlocked: boolean;        // 是否格挡
  damageReduction: number;   // 伤害减免量
  damageReflected: number;   // 反弹伤害量
  damageAbsorbed: number;    // 吸收伤害量
  effectiveDamageType: DamageType; // 实际伤害类型
}

/**
 * 元素类型枚举
 */
export enum ElementType {
  NONE = 'none',       // 无元素
  FIRE = 'fire',       // 火
  WATER = 'water',     // 水
  EARTH = 'earth',     // 土
  AIR = 'air',         // 风
  LIGHT = 'light',     // 光
  DARK = 'dark'        // 暗
}

/**
 * 元素相克关系
 * 第一个元素对第二个元素有优势，造成额外伤害
 */
const ELEMENT_COUNTERS: [ElementType, ElementType, number][] = [
  [ElementType.FIRE, ElementType.AIR, 1.5],     // 火克风，造成1.5倍伤害
  [ElementType.WATER, ElementType.FIRE, 1.5],   // 水克火，造成1.5倍伤害
  [ElementType.EARTH, ElementType.WATER, 1.5],  // 土克水，造成1.5倍伤害
  [ElementType.AIR, ElementType.EARTH, 1.5],    // 风克土，造成1.5倍伤害
  [ElementType.LIGHT, ElementType.DARK, 2.0],   // 光克暗，造成2.0倍伤害
  [ElementType.DARK, ElementType.LIGHT, 2.0],   // 暗克光，造成2.0倍伤害
];

/**
 * 高级伤害计算器
 */
export class AdvancedDamageCalculator {
  /**
   * 计算伤害
   * @param attacker 攻击者实体
   * @param defender 防御者实体
   * @param baseDamage 基础伤害
   * @param damageType 伤害类型
   * @param elementType 元素类型
   * @param entityManager 实体管理器
   * @returns 伤害计算结果
   */
  static calculateDamage(
    attacker: Entity,
    defender: Entity,
    baseDamage: number,
    damageType: DamageType = DamageType.PHYSICAL,
    elementType: ElementType = ElementType.NONE,
    entityManager: EntityManager
  ): DamageResult {
    // 获取攻击者和防御者的属性组件
    const attackerStats = attacker.getComponent<StatsComponent>('Stats');
    const defenderStats = defender.getComponent<StatsComponent>('Stats');
    
    if (!attackerStats || !defenderStats) {
      return this.createEmptyDamageResult();
    }
    
    // 获取效果组件
    const attackerEffects = attacker.getComponent<EffectsComponent>('Effects');
    const defenderEffects = defender.getComponent<EffectsComponent>('Effects');
    
    // 初始化结果对象
    const result: DamageResult = {
      rawDamage: baseDamage,
      finalDamage: baseDamage,
      isCritical: false,
      isEvaded: false,
      isBlocked: false,
      damageReduction: 0,
      damageReflected: 0,
      damageAbsorbed: 0,
      effectiveDamageType: damageType
    };
    
    // 闪避判定
    if (this.rollEvade(defenderStats.dodgeChance)) {
      result.isEvaded = true;
      result.finalDamage = 0;
      return result;
    }
    
    // 暴击判定
    if (this.rollCritical(attackerStats.critChance)) {
      result.isCritical = true;
      result.finalDamage *= (attackerStats.critDamage / 100);
    }
    
    // 格挡判定
    if (this.rollBlock(defenderStats.blockChance)) {
      result.isBlocked = true;
      // 格挡减免30%伤害
      const blockReduction = result.finalDamage * 0.3;
      result.damageReduction += blockReduction;
      result.finalDamage -= blockReduction;
    }
    
    // 应用伤害类型和防御计算
    result.finalDamage = this.applyDefenseCalculation(
      result.finalDamage,
      damageType,
      attackerStats,
      defenderStats
    );
    
    // 应用元素相克
    if (elementType !== ElementType.NONE) {
      result.finalDamage = this.applyElementalCounters(
        result.finalDamage,
        elementType,
        defender,
        entityManager
      );
    }
    
    // 应用效果修饰
    if (attackerEffects && defenderEffects) {
      result.finalDamage = this.applyEffectsModifiers(
        result.finalDamage,
        attackerEffects,
        defenderEffects,
        damageType
      );
    }
    
    // 计算伤害反弹
    if (defenderEffects) {
      result.damageReflected = this.calculateDamageReflection(
        result.finalDamage,
        defenderEffects
      );
    }
    
    // 计算伤害吸收
    if (defenderEffects) {
      result.damageAbsorbed = this.calculateDamageAbsorption(
        result.finalDamage,
        defenderEffects
      );
      result.finalDamage -= result.damageAbsorbed;
    }
    
    // 确保最终伤害不小于1
    result.finalDamage = Math.max(1, Math.round(result.finalDamage));
    
    return result;
  }
  
  /**
   * 创建空的伤害结果
   */
  private static createEmptyDamageResult(): DamageResult {
    return {
      rawDamage: 0,
      finalDamage: 0,
      isCritical: false,
      isEvaded: false,
      isBlocked: false,
      damageReduction: 0,
      damageReflected: 0,
      damageAbsorbed: 0,
      effectiveDamageType: DamageType.PHYSICAL
    };
  }
  
  /**
   * 闪避判定
   * @param dodgeChance 闪避几率
   */
  private static rollEvade(dodgeChance: number): boolean {
    return Math.random() * 100 < dodgeChance;
  }
  
  /**
   * 暴击判定
   * @param critChance 暴击几率
   */
  private static rollCritical(critChance: number): boolean {
    return Math.random() * 100 < critChance;
  }
  
  /**
   * 格挡判定
   * @param blockChance 格挡几率
   */
  private static rollBlock(blockChance: number): boolean {
    return Math.random() * 100 < blockChance;
  }
  
  /**
   * 应用防御计算
   * @param damage 伤害值
   * @param damageType 伤害类型
   * @param attackerStats 攻击者属性
   * @param defenderStats 防御者属性
   */
  private static applyDefenseCalculation(
    damage: number,
    damageType: DamageType,
    attackerStats: StatsComponent,
    defenderStats: StatsComponent
  ): number {
    switch (damageType) {
      case DamageType.PHYSICAL:
        // 计算护甲穿透
        const effectiveArmor = Math.max(0, defenderStats.armor - attackerStats.armorPenetration);
        // 护甲减伤公式: 100 / (100 + 护甲值)
        const physicalReduction = effectiveArmor / (100 + effectiveArmor);
        return damage * (1 - physicalReduction);
        
      case DamageType.MAGICAL:
        // 计算魔法穿透
        const effectiveMagicResist = Math.max(0, defenderStats.magicResist - attackerStats.magicPenetration);
        // 魔抗减伤公式: 100 / (100 + 魔抗值)
        const magicalReduction = effectiveMagicResist / (100 + effectiveMagicResist);
        return damage * (1 - magicalReduction);
        
      case DamageType.TRUE:
        // 真实伤害无视防御和魔抗，但受到伤害减免影响
        return damage * (1 - (defenderStats.damageReduction / 100));
        
      case DamageType.PURE:
        // 纯粹伤害无视所有减伤效果
        return damage;
        
      default:
        return damage;
    }
  }
  
  /**
   * 应用元素相克
   * @param damage 伤害值
   * @param attackerElement 攻击者元素
   * @param defender 防御者实体
   * @param entityManager 实体管理器
   */
  private static applyElementalCounters(
    damage: number,
    attackerElement: ElementType,
    _defender: Entity,
    _entityManager: EntityManager
  ): number {
    // 这里可以从防御者身上获取元素类型
    // 简化版本，假设防御者元素类型为NONE
    const defenderElement = ElementType.NONE;
    
    // 查找元素相克关系
    const counter = ELEMENT_COUNTERS.find(
      ([attacker, defender]) => attacker === attackerElement && defender === defenderElement
    );
    
    if (counter) {
      const [, , multiplier] = counter;
      return damage * multiplier;
    }
    
    return damage;
  }
  
  /**
   * 应用效果修饰
   * @param damage 伤害值
   * @param attackerEffects 攻击者效果
   * @param defenderEffects 防御者效果
   * @param damageType 伤害类型
   */
  private static applyEffectsModifiers(
    damage: number,
    attackerEffects: EffectsComponent,
    defenderEffects: EffectsComponent,
    _damageType: DamageType
  ): number {
    let modifiedDamage = damage;
    
    // 应用攻击者的伤害增益效果
    const attackerDamageBonus = attackerEffects.getEffectValueByType(EffectType.DAMAGE);
    modifiedDamage *= (1 + attackerDamageBonus / 100);
    
    // 应用防御者的伤害减免效果
    const defenderDamageReduction = defenderEffects.getEffectValueByType(EffectType.DAMAGE);
    if (defenderDamageReduction < 0) { // 负值表示减伤
      modifiedDamage *= (1 + defenderDamageReduction / 100);
    }
    
    return modifiedDamage;
  }
  
  /**
   * 计算伤害反弹
   * @param damage 伤害值
   * @param defenderEffects 防御者效果
   */
  private static calculateDamageReflection(
    damage: number,
    defenderEffects: EffectsComponent
  ): number {
    // 假设有一个特殊效果用于伤害反弹
    // 这里简化处理，可以根据实际需求扩展
    const reflectEffect = defenderEffects.effects.find(e => e.id.includes('reflect'));
    
    if (reflectEffect) {
      return damage * (reflectEffect.value / 100);
    }
    
    return 0;
  }
  
  /**
   * 计算伤害吸收
   * @param damage 伤害值
   * @param defenderEffects 防御者效果
   */
  private static calculateDamageAbsorption(
    damage: number,
    defenderEffects: EffectsComponent
  ): number {
    // 假设有一个特殊效果用于伤害吸收
    // 这里简化处理，可以根据实际需求扩展
    const absorbEffect = defenderEffects.effects.find(e => e.id.includes('absorb'));
    
    if (absorbEffect) {
      return Math.min(damage, absorbEffect.value);
    }
    
    return 0;
  }
}