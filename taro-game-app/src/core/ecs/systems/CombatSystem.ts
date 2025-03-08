/**
 * CombatSystem.ts
 * 战斗系统 - 处理实体间的战斗逻辑
 */
import { AbstractSystem } from '../System';
import { EntityManager } from '../EntityManager';
import { Entity } from '../Entity';
import { CombatStateComponent, EffectsComponent, SkillsComponent, TargetingComponent, TeamComponent } from '../components/CombatComponents';
import { StatsComponent } from '../components/StatsComponent';
import { PositionComponent } from '../Component';
import { DamageType } from '../../../models/CombatCalculator';
import { EffectType, Skill } from '../../../models/CharacterStats';
import { ElementalComponent } from '../components/ElementalComponent';
import { AdvancedDamageCalculator, ElementType } from './AdvancedDamageCalculator';

/**
 * 战斗系统 - 处理实体间的战斗、技能使用和效果应用
 */
export class CombatSystem extends AbstractSystem {
  readonly type: string = 'Combat';
  
  constructor(priority: number = 10) {
    super(priority);
  }
  
  /**
   * 系统初始化
   * @param entityManager 实体管理器
   */
  init(_entityManager: EntityManager): void {
    console.log('战斗系统初始化');
  }
  
  /**
   * 系统更新
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  update(deltaTime: number, entityManager: EntityManager): void {
    // 获取所有具有战斗状态组件的实体
    const combatEntities = this.getEntitiesWithComponents(
      entityManager,
      ['CombatState', 'Stats', 'Position']
    );
    
    // 更新所有实体的战斗状态
    for (const entity of combatEntities) {
      this.updateCombatState(entity, deltaTime, entityManager);
    }
    
    // 处理实体间的战斗
    this.processCombat(combatEntities, deltaTime, entityManager);
    
    // 更新技能冷却时间
    this.updateSkillCooldowns(combatEntities, deltaTime);
    
    // 更新效果持续时间和应用效果
    this.updateEffects(combatEntities, deltaTime, entityManager);
  }
  
  /**
   * 更新实体的战斗状态
   * @param entity 实体
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private updateCombatState(entity: Entity, deltaTime: number, entityManager: EntityManager): void {
    const combatState = entity.getComponent<CombatStateComponent>('CombatState');
    if (!combatState) return;
    
    // 更新攻击冷却时间
    if (combatState.attackCooldown > 0) {
      combatState.attackCooldown -= deltaTime;
    }
    
    // 如果实体有目标但目标不存在或已死亡，清除目标
    if (combatState.currentTarget !== null) {
      const targetEntity = entityManager.getEntityById(combatState.currentTarget);
      if (!targetEntity) {
        combatState.currentTarget = null;
        return;
      }
      
      const targetCombatState = targetEntity.getComponent<CombatStateComponent>('CombatState');
      if (targetCombatState && !targetCombatState.isAlive) {
        combatState.currentTarget = null;
      }
    }
  }
  
  /**
   * 处理实体间的战斗
   * @param entities 实体列表
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private processCombat(entities: Entity[], _deltaTime: number, entityManager: EntityManager): void {
    for (const attacker of entities) {
      const attackerCombatState = attacker.getComponent<CombatStateComponent>('CombatState');
      if (!attackerCombatState || !attackerCombatState.isAlive || attackerCombatState.attackCooldown > 0) {
        continue;
      }
      
      // 如果没有目标，尝试寻找目标
      if (attackerCombatState.currentTarget === null) {
        this.findTarget(attacker, entities, entityManager);
      }
      
      // 如果有目标，进行攻击
      if (attackerCombatState.currentTarget !== null) {
        const target = entityManager.getEntityById(attackerCombatState.currentTarget);
        if (target) {
          this.performAttack(attacker, target, entityManager);
          attackerCombatState.lastAttackTime = Date.now();
          
          // 设置攻击冷却时间
          const attackerStats = attacker.getComponent<StatsComponent>('Stats');
          if (attackerStats) {
            // 根据攻击速度计算冷却时间
            attackerCombatState.attackCooldown = 1.0 / (attackerStats.attackSpeed / 100);
          } else {
            attackerCombatState.attackCooldown = 1.0; // 默认1秒
          }
        }
      }
    }
  }
  
  /**
   * 为实体寻找战斗目标
   * @param entity 实体
   * @param entities 所有实体
   * @param entityManager 实体管理器
   */
  private findTarget(entity: Entity, entities: Entity[], entityManager: EntityManager): void {
    const combatState = entity.getComponent<CombatStateComponent>('CombatState');
    const team = entity.getComponent<TeamComponent>('Team');
    const position = entity.getComponent<PositionComponent>('Position');
    const targeting = entity.getComponent<TargetingComponent>('Targeting');
    
    if (!combatState || !team || !position) return;
    
    let closestTarget: Entity | null = null;
    let closestDistance = targeting ? targeting.range : 5; // 默认攻击范围
    
    // 优先检查优先目标列表
    if (targeting && targeting.preferredTargets.length > 0) {
      for (const targetId of targeting.preferredTargets) {
        const target = entityManager.getEntityById(targetId);
        if (target) {
          const targetCombatState = target.getComponent<CombatStateComponent>('CombatState');
          const targetTeam = target.getComponent<TeamComponent>('Team');
          const targetPosition = target.getComponent<PositionComponent>('Position');
          
          if (targetCombatState && targetCombatState.isAlive && 
              targetTeam && targetTeam.teamId !== team.teamId && 
              targetPosition) {
            
            const distance = Math.sqrt(
              Math.pow(targetPosition.x - position.x, 2) + 
              Math.pow(targetPosition.y - position.y, 2)
            );
            
            if (distance <= closestDistance) {
              closestTarget = target;
              closestDistance = distance;
              break; // 找到优先目标就立即选择
            }
          }
        }
      }
    }
    
    // 如果没有找到优先目标，寻找最近的敌方单位
    if (!closestTarget) {
      for (const potentialTarget of entities) {
        const targetCombatState = potentialTarget.getComponent<CombatStateComponent>('CombatState');
        const targetTeam = potentialTarget.getComponent<TeamComponent>('Team');
        const targetPosition = potentialTarget.getComponent<PositionComponent>('Position');
        
        if (targetCombatState && targetCombatState.isAlive && 
            targetTeam && targetTeam.teamId !== team.teamId && 
            targetPosition) {
          
          const distance = Math.sqrt(
            Math.pow(targetPosition.x - position.x, 2) + 
            Math.pow(targetPosition.y - position.y, 2)
          );
          
          if (distance <= closestDistance) {
            closestTarget = potentialTarget;
            closestDistance = distance;
          }
        }
      }
    }
    
    // 设置目标
    if (closestTarget) {
      combatState.currentTarget = closestTarget.getId();
      combatState.isInCombat = true;
      if (combatState.combatStartTime === 0) {
        combatState.combatStartTime = Date.now();
      }
    }
  }
  
  /**
   * 执行攻击
   * @param attacker 攻击者
   * @param target 目标
   * @param entityManager 实体管理器
   */
  private performAttack(attacker: Entity, target: Entity, entityManager: EntityManager): void {
    const attackerStats = attacker.getComponent<StatsComponent>('Stats');
    const targetStats = target.getComponent<StatsComponent>('Stats');
    const targetCombatState = target.getComponent<CombatStateComponent>('CombatState');
    
    if (!attackerStats || !targetStats || !targetCombatState) return;
    
    // 获取攻击者的元素组件（如果有）
    const attackerElemental = attacker.getComponent<ElementalComponent>('Elemental');
    const elementType = attackerElemental ? attackerElemental.primaryElement : ElementType.NONE;
    
    // 使用高级伤害计算器计算伤害
    const damageResult = AdvancedDamageCalculator.calculateDamage(
      attacker,
      target,
      attackerStats.attackDamage,
      DamageType.PHYSICAL,
      elementType,
      entityManager
    );
    
    // 应用最终伤害
    this.applyDamage(target, damageResult.finalDamage, damageResult.effectiveDamageType, attacker.getId(), entityManager);
    
    // 处理伤害反弹
    if (damageResult.damageReflected > 0) {
      this.applyDamage(attacker, damageResult.damageReflected, DamageType.PHYSICAL, target.getId(), entityManager);
      console.log(`实体 ${target.getId()} 反弹了 ${Math.round(damageResult.damageReflected)} 点伤害给 ${attacker.getId()}`);
    }
    
    // 生成战斗描述
    const combatDescription = this.generateCombatDescription(
      attacker.getId(),
      target.getId(),
      damageResult.finalDamage,
      damageResult.isCritical,
      damageResult.isEvaded,
      damageResult.effectiveDamageType,
      entityManager
    );
    
    console.log(combatDescription);
    
    // 如果目标没有将攻击者作为目标，有50%几率将攻击者设为目标
    if (targetCombatState.currentTarget === null && Math.random() > 0.5) {
      targetCombatState.currentTarget = attacker.getId();
      targetCombatState.isInCombat = true;
      if (targetCombatState.combatStartTime === 0) {
        targetCombatState.combatStartTime = Date.now();
      }
    }
  }
  
  /**
   * 应用伤害到目标
   * @param target 目标实体
   * @param damage 伤害值
   * @param damageType 伤害类型
   * @param sourceEntityId 伤害来源实体ID
   * @param entityManager 实体管理器
   */
  private applyDamage(target: Entity, damage: number, _damageType: DamageType, sourceEntityId: number, entityManager: EntityManager): void {
    const targetStats = target.getComponent<StatsComponent>('Stats');
    const targetCombatState = target.getComponent<CombatStateComponent>('CombatState');
    
    if (!targetStats || !targetCombatState) return;
    
    // 应用伤害
    targetStats.currentHealth -= Math.round(damage);
    
    // 检查是否死亡
    if (targetStats.currentHealth <= 0) {
      targetStats.currentHealth = 0;
      targetCombatState.isAlive = false;
      
      // 处理死亡逻辑
      this.handleEntityDeath(target, sourceEntityId, entityManager);
    }
  }
  
  /**
   * 处理实体死亡
   * @param entity 死亡的实体
   * @param killerEntityId 击杀者实体ID
   * @param entityManager 实体管理器
   */
  private handleEntityDeath(entity: Entity, killerEntityId: number, entityManager: EntityManager): void {
    const entityId = entity.getId();
    console.log(`实体 ${entityId} 被实体 ${killerEntityId} 击杀`);
    
    // 可以在这里添加死亡奖励、经验值分配等逻辑
    const killer = entityManager.getEntityById(killerEntityId);
    if (killer) {
      // 处理击杀奖励
    }
    
    // 可以选择立即移除实体或者保留尸体一段时间
    // entityManager.removeEntity(entityId);
  }
  
  /**
   * 更新技能冷却时间
   * @param entities 实体列表
   * @param deltaTime 时间增量
   */
  private updateSkillCooldowns(entities: Entity[], deltaTime: number): void {
    for (const entity of entities) {
      const skillsComponent = entity.getComponent<SkillsComponent>('Skills');
      if (skillsComponent) {
        skillsComponent.updateCooldowns(deltaTime);
        
        // 每次更新增加少量能量
        if (entity.getComponent<CombatStateComponent>('CombatState')?.isInCombat) {
          skillsComponent.currentEnergy = Math.min(
            skillsComponent.maxEnergy,
            skillsComponent.currentEnergy + (5 * deltaTime) // 每秒恢复5点能量
          );
        }
      }
    }
  }
  
  /**
   * 更新效果持续时间和应用效果
   * @param entities 实体列表
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private updateEffects(entities: Entity[], deltaTime: number, entityManager: EntityManager): void {
    for (const entity of entities) {
      const effectsComponent = entity.getComponent<EffectsComponent>('Effects');
      if (!effectsComponent) continue;
      
      // 更新效果持续时间并获取过期效果
      const expiredEffects = effectsComponent.updateEffects(deltaTime);
      
      // 处理过期效果
      for (const effectId of expiredEffects) {
        console.log(`实体 ${entity.getId()} 的效果 ${effectId} 已过期`);
        
        // 获取效果信息，可以用于通知其他系统
        const effectInfo = effectsComponent.effects.find(e => e.id === effectId);
        
        // 如果效果来源实体存在，可以通知来源实体效果已过期
        if (effectInfo && effectInfo.sourceEntityId) {
          const sourceEntity = entityManager.getEntityById(effectInfo.sourceEntityId);
          if (sourceEntity) {
            // 这里可以添加通知逻辑，例如触发事件或更新来源实体的状态
            console.log(`通知实体 ${effectInfo.sourceEntityId} 其施加的效果 ${effectId} 已过期`);
          }
        }
        
        // 根据效果类型执行额外逻辑
        if (effectInfo) {
          switch (effectInfo.type) {
            case EffectType.BUFF:
              // 处理增益效果过期逻辑
              break;
            case EffectType.DEBUFF:
              // 处理减益效果过期逻辑
              break;
            // 可以添加更多效果类型的处理
          }
        }
      }
    }
  }
  
  /**
   * 使用技能
   * @param entity 使用技能的实体
   * @param skillId 技能ID
   * @param targetEntityIds 目标实体ID列表
   * @param entityManager 实体管理器
   * @returns 是否成功使用技能
   */
  public useSkill(entity: Entity, skillId: string, targetEntityIds: number[], entityManager: EntityManager): boolean {
    const skillsComponent = entity.getComponent<SkillsComponent>('Skills');
    if (!skillsComponent) return false;
    
    // 尝试使用技能
    const skill = skillsComponent.useSkill(skillId);
    if (!skill) return false;
    
    console.log(`实体 ${entity.getId()} 使用技能 ${skill.name}`);
    
    // 根据技能类型处理不同效果
    switch (skill.effectType) {
      case EffectType.DAMAGE:
        this.applyDamageSkill(entity, skill, targetEntityIds, entityManager);
        break;
      case EffectType.HEAL:
        this.applyHealSkill(entity, skill, targetEntityIds, entityManager);
        break;
      case EffectType.BUFF:
        this.applyBuffSkill(entity, skill, targetEntityIds, entityManager);
        break;
      case EffectType.DEBUFF:
        this.applyDebuffSkill(entity, skill, targetEntityIds, entityManager);
        break;
      // 可以添加更多技能类型处理
    }
    
    return true;
  }
  
  /**
   * 应用伤害技能
   * @param caster 施法者
   * @param skill 技能
   * @param targetEntityIds 目标实体ID列表
   * @param entityManager 实体管理器
   */
  private applyDamageSkill(caster: Entity, skill: Skill, targetEntityIds: number[], entityManager: EntityManager): void {
    const casterStats = caster.getComponent<StatsComponent>('Stats');
    if (!casterStats) return;
    
    // 计算技能伤害
    let baseDamage = skill.baseValue + (casterStats.magicPower * skill.scalingFactor);
    
    // 对每个目标应用伤害
    for (const targetId of targetEntityIds) {
      const target = entityManager.getEntityById(targetId);
      if (!target) continue;
      
      // 应用伤害
      this.applyDamage(target, baseDamage, DamageType.MAGICAL, caster.getId(), entityManager);
    }
  }
  
  /**
   * 应用治疗技能
   * @param caster 施法者
   * @param skill 技能
   * @param targetEntityIds 目标实体ID列表
   * @param entityManager 实体管理器
   */
  private applyHealSkill(caster: Entity, skill: Skill, targetEntityIds: number[], entityManager: EntityManager): void {
    const casterStats = caster.getComponent<StatsComponent>('Stats');
    if (!casterStats) return;
    
    // 计算治疗量
    let baseHeal = skill.baseValue + (casterStats.magicPower * skill.scalingFactor);
    
    // 对每个目标应用治疗
    for (const targetId of targetEntityIds) {
      const target = entityManager.getEntityById(targetId);
      if (!target) continue;
      
      const targetStats = target.getComponent<StatsComponent>('Stats');
      if (!targetStats) continue;
      
      // 应用治疗
      targetStats.currentHealth = Math.min(
        targetStats.maxHealth,
        targetStats.currentHealth + Math.round(baseHeal)
      );
      
      console.log(`实体 ${caster.getId()} 治疗了实体 ${targetId} ${Math.round(baseHeal)} 点生命值`);
    }
  }
  
  /**
   * 应用增益技能
   * @param caster 施法者
   * @param skill 技能
   * @param targetEntityIds 目标实体ID列表
   * @param entityManager 实体管理器
   */
  private applyBuffSkill(caster: Entity, skill: Skill, targetEntityIds: number[], entityManager: EntityManager): void {
    // 对每个目标应用增益效果
    for (const targetId of targetEntityIds) {
      const target = entityManager.getEntityById(targetId);
      if (!target) continue;
      
      const effectsComponent = target.getComponent<EffectsComponent>('Effects');
      if (!effectsComponent) continue;
      
      // 添加增益效果
      effectsComponent.addEffect({
        id: `${skill.id}_${Date.now()}`,
        name: skill.name,
        type: EffectType.BUFF,
        value: skill.baseValue,
        duration: skill.duration,
        sourceEntityId: caster.getId()
      });
      
      console.log(`实体 ${caster.getId()} 对实体 ${targetId} 施加了增益效果 ${skill.name}`);
    }
  }
  
  /**
   * 应用减益技能
   * @param caster 施法者
   * @param skill 技能
   * @param targetEntityIds 目标实体ID列表
   * @param entityManager 实体管理器
   */
  private applyDebuffSkill(caster: Entity, skill: Skill, targetEntityIds: number[], entityManager: EntityManager): void {
    // 对每个目标应用减益效果
    for (const targetId of targetEntityIds) {
      const target = entityManager.getEntityById(targetId);
      if (!target) continue;
      
      const effectsComponent = target.getComponent<EffectsComponent>('Effects');
      if (!effectsComponent) continue;
      
      // 添加减益效果
      effectsComponent.addEffect({
        id: `${skill.id}_${Date.now()}`,
        name: skill.name,
        type: EffectType.DEBUFF,
        value: skill.baseValue,
        duration: skill.duration,
        sourceEntityId: caster.getId()
      });
      
      console.log(`实体 ${caster.getId()} 对实体 ${targetId} 施加了减益效果 ${skill.name}`);
    }
  }
  
  /**
   * 生成战斗描述
   * @param attackerId 攻击者ID
   * @param defenderId 防御者ID
   * @param damage 伤害值
   * @param isCritical 是否暴击
   * @param isEvaded 是否闪避
   * @param damageType 伤害类型
   * @param entityManager 实体管理器
   * @returns 战斗描述文本
   */
  private generateCombatDescription(
    attackerId: number,
    defenderId: number,
    damage: number,
    isCritical: boolean,
    isEvaded: boolean,
    damageType: DamageType,
    entityManager: EntityManager
  ): string {
    const attacker = entityManager.getEntityById(attackerId);
    const defender = entityManager.getEntityById(defenderId);
    
    if (!attacker || !defender) {
      return "未知实体之间的战斗";
    }
    
    const attackerName = attacker.getName() || `实体 ${attackerId}`;
    const defenderName = defender.getName() || `实体 ${defenderId}`;
    
    if (isEvaded) {
      return `${defenderName} 闪避了 ${attackerName} 的攻击！`;
    }
    
    let description = `${attackerName} 对 ${defenderName} 造成了 `;
    
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