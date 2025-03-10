/**
 * StatsComponent.ts
 * 属性组件 - 存储实体的各种属性数值
 */
import { Component } from '../Component';

/**
 * 属性组件 - 用于存储实体的各种属性数值
 */
export class StatsComponent implements Component {
  readonly type: string = 'Stats';
  
  // 基础属性
  public maxHealth: number = 100;       // 最大生命值
  public currentHealth: number = 100;    // 当前生命值
  public maxMana: number = 100;          // 最大法力值
  public currentMana: number = 100;      // 当前法力值
  
  // 攻击属性
  public attackDamage: number = 10;      // 攻击力
  public attackSpeed: number = 100;      // 攻击速度（百分比，100为基准）
  public critChance: number = 5;         // 暴击几率（百分比）
  public critDamage: number = 150;       // 暴击伤害（百分比）
  public armorPenetration: number = 0;   // 护甲穿透
  public magicPenetration: number = 0;   // 法术穿透
  
  // 防御属性
  public armor: number = 10;             // 护甲
  public magicResist: number = 10;       // 魔法抗性
  public dodgeChance: number = 0;        // 闪避几率（百分比）
  public blockChance: number = 0;        // 格挡几率（百分比）
  public damageReduction: number = 0;    // 伤害减免（百分比）
  
  // 恢复属性
  public healthRegen: number = 1;        // 生命恢复（每秒）
  public manaRegen: number = 1;          // 法力恢复（每秒）
  public lifeSteal: number = 0;          // 生命偷取（百分比）
  public spellVamp: number = 0;          // 法术吸血（百分比）
  
  // 特殊属性
  public moveSpeed: number = 100;        // 移动速度（百分比，100为基准）
  public cooldownReduction: number = 0;  // 冷却缩减（百分比）
  public healingPower: number = 100;     // 治疗效果（百分比，100为基准）
  public tenacity: number = 0;           // 韧性（减少控制效果持续时间，百分比）
  public deathResist: number = 0;        // 死亡抵抗（概率抵抗致命伤害，百分比）
  
  // 法术属性
  public magicPower: number = 0;         // 法术强度
  
  constructor(params: Partial<StatsComponent> = {}) {
    Object.assign(this, params);
  }
  
  /**
   * 应用伤害
   * @param amount 伤害量
   * @returns 实际造成的伤害
   */
  applyDamage(amount: number): number {
    const actualDamage = Math.min(this.currentHealth, amount);
    this.currentHealth -= actualDamage;
    return actualDamage;
  }
  
  /**
   * 应用治疗
   * @param amount 治疗量
   * @returns 实际恢复的生命值
   */
  applyHealing(amount: number): number {
    const missingHealth = this.maxHealth - this.currentHealth;
    const actualHealing = Math.min(missingHealth, amount);
    this.currentHealth += actualHealing;
    return actualHealing;
  }
  
  /**
   * 消耗法力
   * @param amount 法力消耗量
   * @returns 是否消耗成功
   */
  useMana(amount: number): boolean {
    if (this.currentMana >= amount) {
      this.currentMana -= amount;
      return true;
    }
    return false;
  }
  
  /**
   * 恢复法力
   * @param amount 法力恢复量
   * @returns 实际恢复的法力值
   */
  restoreMana(amount: number): number {
    const missingMana = this.maxMana - this.currentMana;
    const actualRestoration = Math.min(missingMana, amount);
    this.currentMana += actualRestoration;
    return actualRestoration;
  }
  
  /**
   * 更新属性恢复
   * @param deltaTime 时间增量（秒）
   */
  updateRegeneration(deltaTime: number): void {
    // 生命恢复
    if (this.currentHealth < this.maxHealth) {
      this.currentHealth = Math.min(
        this.maxHealth,
        this.currentHealth + this.healthRegen * deltaTime
      );
    }
    
    // 法力恢复
    if (this.currentMana < this.maxMana) {
      this.currentMana = Math.min(
        this.maxMana,
        this.currentMana + this.manaRegen * deltaTime
      );
    }
  }
  
  /**
   * 检查是否存活
   * @returns 是否存活
   */
  isAlive(): boolean {
    return this.currentHealth > 0;
  }
  
  /**
   * 重置生命值和法力值为最大值
   */
  resetStats(): void {
    this.currentHealth = this.maxHealth;
    this.currentMana = this.maxMana;
  }
}