/**
 * CombatCalculator.ts - 战斗伤害计算系统
 * 定义游戏中战斗伤害的计算方法和公式
 */

import { Character, CharacterStats, EffectType } from './CharacterStats';

/**
 * 伤害类型枚举
 */
export enum DamageType {
  PHYSICAL = 'physical',   // 物理伤害
  MAGICAL = 'magical',     // 魔法伤害
  TRUE = 'true',           // 真实伤害(无视防御和魔抗)
  PURE = 'pure'            // 纯粹伤害(无法被减免或增强)
}

/**
 * 战斗状态效果
 */
export interface StatusEffect {
  id: string;              // 效果ID
  name: string;            // 效果名称
  description: string;     // 效果描述
  duration: number;        // 持续回合数
  stacks: number;          // 叠加层数
  type: 'buff' | 'debuff'; // 效果类型
  stats: Partial<CharacterStats>; // 属性修改
  tickEffect?: () => void; // 每回合触发效果
}

/**
 * 战斗单位状态
 */
export interface CombatUnit {
  character: Character;    // 角色基础信息
  currentStats: CharacterStats; // 当前属性
  position: { x: number, y: number }; // 位置坐标
  currentHealth: number;   // 当前生命值
  currentMana: number;     // 当前法力值
  statusEffects: StatusEffect[]; // 状态效果列表
  cooldowns: Map<string, number>; // 技能冷却状态
}

/**
 * 战斗结果接口
 */
export interface CombatResult {
  damage: number;          // 造成的伤害
  isCritical: boolean;     // 是否暴击
  isEvaded: boolean;       // 是否闪避
  statusEffects: StatusEffect[]; // 附加的状态效果
  description: string;     // 战斗描述
}

/**
 * 战斗伤害计算器
 * 负责计算战斗中的伤害、治疗和效果
 */
export class CombatCalculator {
  
  /**
   * 计算物理伤害
   * 物理伤害公式: (攻击力 * 技能系数) * (100 / (100 + 防御力))
   * 
   * @param attacker 攻击者
   * @param defender 防御者
   * @param skillMultiplier 技能伤害系数
   * @returns 计算后的伤害值
   */
  static calculatePhysicalDamage(attacker: CombatUnit, defender: CombatUnit, skillMultiplier: number = 1.0): CombatResult {
    // 基础伤害计算
    const baseDamage = attacker.currentStats.attack * skillMultiplier;
    
    // 防御减伤计算
    const damageReduction = 100 / (100 + defender.currentStats.defense);
    
    // 计算最终伤害
    let finalDamage = baseDamage * damageReduction;
    
    // 暴击判定
    const isCritical = Math.random() < attacker.currentStats.critChance;
    if (isCritical) {
      finalDamage *= attacker.currentStats.critDamage;
    }
    
    // 闪避判定 (假设闪避率为5%)
    const isEvaded = Math.random() < 0.05;
    if (isEvaded) {
      finalDamage = 0;
    }
    
    // 返回战斗结果
    return {
      damage: Math.round(finalDamage),
      isCritical,
      isEvaded,
      statusEffects: [],
      description: this.generateCombatDescription(attacker, defender, finalDamage, isCritical, isEvaded, DamageType.PHYSICAL)
    };
  }
  
  /**
   * 计算魔法伤害
   * 魔法伤害公式: (法术强度 * 技能系数) * (100 / (100 + 魔法抗性))
   * 
   * @param attacker 攻击者
   * @param defender 防御者
   * @param skillMultiplier 技能伤害系数
   * @returns 计算后的伤害值
   */
  static calculateMagicalDamage(attacker: CombatUnit, defender: CombatUnit, skillMultiplier: number = 1.0): CombatResult {
    // 基础伤害计算
    const baseDamage = attacker.currentStats.magicPower * skillMultiplier;
    
    // 魔抗减伤计算
    const damageReduction = 100 / (100 + defender.currentStats.magicResist);
    
    // 计算最终伤害
    let finalDamage = baseDamage * damageReduction;
    
    // 魔法暴击判定 (法师也可以暴击)
    const isCritical = Math.random() < attacker.currentStats.critChance;
    if (isCritical) {
      finalDamage *= attacker.currentStats.critDamage;
    }
    
    // 魔法无法闪避
    const isEvaded = false;
    
    // 返回战斗结果
    return {
      damage: Math.round(finalDamage),
      isCritical,
      isEvaded,
      statusEffects: [],
      description: this.generateCombatDescription(attacker, defender, finalDamage, isCritical, isEvaded, DamageType.MAGICAL)
    };
  }
  
  /**
   * 计算真实伤害 (无视防御和魔抗)
   * 
   * @param attacker 攻击者
   * @param defender 防御者
   * @param damageAmount 伤害数值
   * @returns 计算后的伤害值
   */
  static calculateTrueDamage(attacker: CombatUnit, defender: CombatUnit, damageAmount: number): CombatResult {
    // 真实伤害不受防御和魔抗影响
    const finalDamage = damageAmount;
    
    // 真实伤害不会暴击和闪避
    const isCritical = false;
    const isEvaded = false;
    
    // 返回战斗结果
    return {
      damage: Math.round(finalDamage),
      isCritical,
      isEvaded,
      statusEffects: [],
      description: this.generateCombatDescription(attacker, defender, finalDamage, isCritical, isEvaded, DamageType.TRUE)
    };
  }
  
  /**
   * 计算治疗量
   * 
   * @param healer 治疗者
   * @param target 目标
   * @param healAmount 基础治疗量
   * @param healMultiplier 治疗系数
   * @returns 最终治疗量
   */
  static calculateHealing(healer: CombatUnit, _target: CombatUnit, healAmount: number, healMultiplier: number = 1.0): number {
    // 基础治疗量 + 法术强度加成
    const baseHealing = healAmount + (healer.currentStats.magicPower * 0.5);
    
    // 计算最终治疗量
    const finalHealing = baseHealing * healMultiplier;
    
    // 治疗暴击判定 (治疗也可以暴击)
    const isCritical = Math.random() < healer.currentStats.critChance;
    
    // 返回最终治疗量
    return Math.round(isCritical ? finalHealing * 1.5 : finalHealing);
  }
  
  /**
   * 应用状态效果
   * 
   * @param target 目标单位
   * @param effect 状态效果
   */
  static applyStatusEffect(target: CombatUnit, effect: StatusEffect): void {
    // 检查是否已有相同效果
    const existingEffect = target.statusEffects.find(e => e.id === effect.id);
    
    if (existingEffect) {
      // 更新已有效果的持续时间和层数
      existingEffect.duration = Math.max(existingEffect.duration, effect.duration);
      existingEffect.stacks = Math.min(existingEffect.stacks + effect.stacks, 5); // 最多叠加5层
    } else {
      // 添加新效果
      target.statusEffects.push({ ...effect });
    }
    
    // 应用效果对属性的影响
    this.updateStatsFromEffects(target);
  }
  
  /**
   * 更新单位的属性基于状态效果
   * 
   * @param unit 战斗单位
   */
  static updateStatsFromEffects(unit: CombatUnit): void {
    // 重置属性为基础值
    unit.currentStats = { ...unit.character.baseStats } as CharacterStats;
    
    // 应用所有状态效果的属性修改
    for (const effect of unit.statusEffects) {
      for (const [key, value] of Object.entries(effect.stats)) {
        // @ts-ignore - 动态属性访问
        unit.currentStats[key] += value * effect.stacks;
      }
    }
  }
  
  /**
   * 处理技能效果
   * 
   * @param caster 施法者
   * @param targets 目标列表
   * @param skillId 技能ID
   * @returns 战斗结果列表
   */
  static processSkillEffect(caster: CombatUnit, targets: CombatUnit[], skillId: string): CombatResult[] {
    // 获取技能信息
    const skill = caster.character.skills.find(s => s.id === skillId);
    if (!skill) {
      return [];
    }
    
    // 检查技能冷却
    if (caster.cooldowns.has(skillId) && caster.cooldowns.get(skillId)! > 0) {
      return [];
    }
    
    // 设置技能冷却
    caster.cooldowns.set(skillId, skill.cooldown);
    
    // 消耗能量
    caster.currentMana -= skill.energyCost;
    if (caster.currentMana < 0) {
      caster.currentMana = 0;
      return []; // 能量不足，无法释放技能
    }
    
    const results: CombatResult[] = [];
    
    // 根据技能效果类型处理
    switch (skill.effectType) {
      case EffectType.DAMAGE:
        // 伤害技能
        for (const target of targets) {
          // 根据职业决定伤害类型
          let result: CombatResult;
          if (caster.character.class === 'mage') {
            result = this.calculateMagicalDamage(caster, target, skill.effectValue / 100);
          } else {
            result = this.calculatePhysicalDamage(caster, target, skill.effectValue / 100);
          }
          
          // 应用伤害
          target.currentHealth -= result.damage;
          if (target.currentHealth < 0) target.currentHealth = 0;
          
          results.push(result);
        }
        break;
        
      case EffectType.HEAL:
        // 治疗技能
        for (const target of targets) {
          const healAmount = this.calculateHealing(caster, target, skill.effectValue);
          target.currentHealth += healAmount;
          
          // 防止过量治疗
          if (target.currentHealth > target.currentStats.health) {
            target.currentHealth = target.currentStats.health;
          }
          
          results.push({
            damage: -healAmount, // 负数表示治疗
            isCritical: false,
            isEvaded: false,
            statusEffects: [],
            description: `${caster.character.name} 对 ${target.character.name} 施放了 ${skill.name}，恢复了 ${healAmount} 点生命值。`
          });
        }
        break;
        
      case EffectType.BUFF:
      case EffectType.DEBUFF:
        // 增益/减益效果
        for (const target of targets) {
          // 创建状态效果
          const statusEffect: StatusEffect = {
            id: `${skill.id}_effect`,
            name: skill.name,
            description: skill.description,
            duration: 3, // 默认持续3回合
            stacks: 1,
            type: skill.effectType === EffectType.BUFF ? 'buff' : 'debuff',
            stats: {} as Partial<CharacterStats>
          };
          
          // 根据技能ID设置不同的效果
          if (skill.id === 'iron_will') {
            statusEffect.stats = { defense: 30, health: 200 };
          } else if (skill.id === 'overcharge') {
            statusEffect.stats = { magicPower: 30, health: -50 };
          } else if (skill.id === 'vanish') {
            statusEffect.stats = { moveSpeed: 2, critChance: 1.0 };
          }
          
          // 应用状态效果
          this.applyStatusEffect(target, statusEffect);
          
          results.push({
            damage: 0,
            isCritical: false,
            isEvaded: false,
            statusEffects: [statusEffect],
            description: `${caster.character.name} 对 ${target.character.name} 施放了 ${skill.name}，产生了 ${statusEffect.type === 'buff' ? '增益' : '减益'}效果。`
          });
        }
        break;
        
      case EffectType.CONTROL:
        // 控制技能
        for (const target of targets) {
          // 创建控制效果
          const controlEffect: StatusEffect = {
            id: `${skill.id}_control`,
            name: skill.name,
            description: skill.description,
            duration: 2, // 控制效果通常持续较短
            stacks: 1,
            type: 'debuff',
            stats: { moveSpeed: -10 } // 减少移动速度表示被控制
          };
          
          // 应用控制效果
          this.applyStatusEffect(target, controlEffect);
          
          results.push({
            damage: 0,
            isCritical: false,
            isEvaded: false,
            statusEffects: [controlEffect],
            description: `${caster.character.name} 对 ${target.character.name} 施放了 ${skill.name}，造成了控制效果。`
          });
        }
        break;
    }
    
    return results;
  }
  
  /**
   * 生成战斗描述文本
   * 
   * @param attacker 攻击者
   * @param defender 防御者
   * @param damage 伤害值
   * @param isCritical 是否暴击
   * @param isEvaded 是否闪避
   * @param damageType 伤害类型
   * @returns 战斗描述文本
   */
  static generateCombatDescription(attacker: CombatUnit, defender: CombatUnit, damage: number, isCritical: boolean, isEvaded: boolean, damageType: DamageType): string {
    if (isEvaded) {
      return `${defender.character.name} 闪避了 ${attacker.character.name} 的攻击！`;
    }
    
    let description = `${attacker.character.name} 对 ${defender.character.name} 造成了 `;
    
    // 添加伤害类型描述
    switch (damageType) {
      case DamageType.PHYSICAL:
        description += '物理';
        break;
      case DamageType.MAGICAL:
        description += '魔法';
        break;
      case DamageType.TRUE:
        description += '真实';
        break;
      case DamageType.PURE:
        description += '纯粹';
        break;
    }
    
    // 添加伤害数值
    description += `伤害 ${Math.round(damage)}`;
    
    // 添加暴击描述
    if (isCritical) {
      description += '（暴击）';
    }
    
    return description + '！';
  }
}