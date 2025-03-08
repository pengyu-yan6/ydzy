/**
 * SynergySystem.ts
 * 实现羁绊系统，处理角色的职业和种族羁绊效果
 */
import { AbstractSystem } from '../System';
import { Entity } from '../Entity';
import { EntityManager } from '../EntityManager';
import { CharacterStatsComponent, SynergyComponent, TeamComponent } from '../components/MovementComponents';
import { CharacterClass, CharacterRace, SYNERGY_EFFECTS, EffectType } from '../../../models/CharacterStats';
import { EffectsComponent } from '../components/CombatComponents';
import { StatsComponent } from '../components/StatsComponent';

/**
 * 羁绊系统 - 处理角色的职业和种族羁绊效果
 */
export class SynergySystem extends AbstractSystem {
  readonly type: string = 'Synergy';
  
  constructor(priority: number = 20) {
    super(priority);
  }
  
  /**
   * 系统初始化
   * @param entityManager 实体管理器
   */
  init(_entityManager: EntityManager): void {
    console.log('羁绊系统初始化');
  }
  
  update(_deltaTime: number, entityManager: EntityManager): void {
    // 获取所有队伍
    const teamEntities = this.getEntitiesWithComponents(entityManager, ['Team']);
    
    // 按队伍分组
    const teamGroups: Map<number, Entity[]> = new Map();
    
    for (const entity of teamEntities) {
      const team = entity.getComponent<TeamComponent>('Team');
      if (!team) continue;
      
      if (!teamGroups.has(team.teamId)) {
        teamGroups.set(team.teamId, []);
      }
      
      teamGroups.get(team.teamId)?.push(entity);
    }
    
    // 处理每个队伍的羁绊
    for (const [teamId, entities] of teamGroups.entries()) {
      this.processSynergiesForTeam(teamId, entities, entityManager);
    }
  }
  
  /**
   * 处理队伍的羁绊效果
   * @param teamId 队伍ID
   * @param entities 队伍中的实体
   * @param entityManager 实体管理器
   */
  private processSynergiesForTeam(_teamId: number, entities: Entity[], _entityManager: EntityManager): void {
    // 统计队伍中的职业和种族数量
    const classCounts: Record<CharacterClass, number> = {} as Record<CharacterClass, number>;
    const raceCounts: Record<CharacterRace, number> = {} as Record<CharacterRace, number>;
    
    // 初始化计数器
    Object.values(CharacterClass).forEach(cls => {
      classCounts[cls as CharacterClass] = 0;
    });
    
    Object.values(CharacterRace).forEach(race => {
      raceCounts[race as CharacterRace] = 0;
    });
    
    // 统计队伍中的职业和种族
    for (const entity of entities) {
      const stats = entity.getComponent<CharacterStatsComponent>('CharacterStats');
      if (!stats) continue;
      
      classCounts[stats.characterClass]++;
      raceCounts[stats.race]++;
    }
    
    // 计算激活的羁绊
    const activeClassSynergies: Record<CharacterClass, number> = {} as Record<CharacterClass, number>;
    const activeRaceSynergies: Record<CharacterRace, number> = {} as Record<CharacterRace, number>;
    
    // 检查职业羁绊
    for (const cls of Object.values(CharacterClass)) {
      const classType = cls as CharacterClass;
      const count = classCounts[classType];
      
      if (count > 0) {
        // 查找对应的羁绊效果
        const synergyEffect = SYNERGY_EFFECTS.find(effect => effect.type === classType);
        
        if (synergyEffect) {
          // 确定激活的羁绊等级
          let activeLevel = 0;
          for (let i = synergyEffect.requiredCount.length - 1; i >= 0; i--) {
            if (count >= synergyEffect.requiredCount[i]) {
              activeLevel = i + 1;
              break;
            }
          }
          
          if (activeLevel > 0) {
            activeClassSynergies[classType] = activeLevel;
            console.log(`激活职业羁绊: ${classType}, 等级: ${activeLevel}, 数量: ${count}`);
          }
        }
      }
    }
    
    // 检查种族羁绊
    for (const race of Object.values(CharacterRace)) {
      const raceType = race as CharacterRace;
      const count = raceCounts[raceType];
      
      if (count > 0) {
        // 查找对应的羁绊效果
        const synergyEffect = SYNERGY_EFFECTS.find(effect => effect.type === raceType);
        
        if (synergyEffect) {
          // 确定激活的羁绊等级
          let activeLevel = 0;
          for (let i = synergyEffect.requiredCount.length - 1; i >= 0; i--) {
            if (count >= synergyEffect.requiredCount[i]) {
              activeLevel = i + 1;
              break;
            }
          }
          
          if (activeLevel > 0) {
            activeRaceSynergies[raceType] = activeLevel;
            console.log(`激活种族羁绊: ${raceType}, 等级: ${activeLevel}, 数量: ${count}`);
          }
        }
      }
    }

    // 更新每个实体的羁绊组件并应用效果
    for (const entity of entities) {
      let synergy = entity.getComponent<SynergyComponent>('Synergy');
      if (!synergy) {
        synergy = new SynergyComponent();
        entity.addComponent('Synergy', synergy);
      }
      
      // 清除之前的羁绊效果
      if (synergy.appliedBonuses) {
        this.clearSynergyEffects(entity);
      }
      
      // 更新羁绊状态并标记队伍ID
      synergy.activeClassSynergies = activeClassSynergies;
      synergy.activeRaceSynergies = activeRaceSynergies;
      
      // 应用羁绊效果
      this.applySynergyEffects(entity, activeClassSynergies, activeRaceSynergies);
      
      // 标记为已应用
      synergy.appliedBonuses = true;
    }
  }
  
  /**
   * 应用羁绊效果到实体
   * @param entity 目标实体
   * @param activeClassSynergies 激活的职业羁绊
   * @param activeRaceSynergies 激活的种族羁绊
   */
  private applySynergyEffects(
    entity: Entity,
    activeClassSynergies: Record<CharacterClass, number>,
    activeRaceSynergies: Record<CharacterRace, number>
  ): void {
    const stats = entity.getComponent<CharacterStatsComponent>('CharacterStats');
    if (!stats) return;
    
    const effectsComponent = this.getOrCreateEffectsComponent(entity);
    
    // 应用职业羁绊效果
    for (const [classType, level] of Object.entries(activeClassSynergies)) {
      const synergyEffect = SYNERGY_EFFECTS.find(effect => effect.type === classType);
      if (!synergyEffect) continue;
      
      // 只对匹配职业的实体应用效果
      if (stats.characterClass === classType as CharacterClass) {
        // 添加羁绊效果
        effectsComponent.addEffect({
          id: `synergy_class_${classType}_${level}`,
          name: `${classType}羁绊 Lv.${level}`,
          type: EffectType.BUFF,
          value: this.getSynergyBonusValue(synergyEffect, level),
          duration: 9999, // 持续到羁绊被移除
          sourceEntityId: entity.getId()
        });
        
        // 应用属性加成
        this.applyStatBonus(entity, synergyEffect, level);
      }
    }
    
    // 应用种族羁绊效果
    for (const [raceType, level] of Object.entries(activeRaceSynergies)) {
      const synergyEffect = SYNERGY_EFFECTS.find(effect => effect.type === raceType);
      if (!synergyEffect) continue;
      
      // 只对匹配种族的实体应用效果
      if (stats.race === raceType as CharacterRace) {
        // 添加羁绊效果
        effectsComponent.addEffect({
          id: `synergy_race_${raceType}_${level}`,
          name: `${raceType}羁绊 Lv.${level}`,
          type: EffectType.BUFF,
          value: this.getSynergyBonusValue(synergyEffect, level),
          duration: 9999, // 持续到羁绊被移除
          sourceEntityId: entity.getId()
        });
        
        // 应用属性加成
        this.applyStatBonus(entity, synergyEffect, level);
      }
    }
  }
  
  /**
   * 清除实体上的羁绊效果
   * @param entity 目标实体
   */
  private clearSynergyEffects(entity: Entity): void {
    const effectsComponent = entity.getComponent<EffectsComponent>('Effects');
    if (!effectsComponent) return;
    
    // 移除所有羁绊相关的效果
    const synergyEffectIds = effectsComponent.effects
      .filter(effect => effect.id.startsWith('synergy_'))
      .map(effect => effect.id);
    
    for (const effectId of synergyEffectIds) {
      effectsComponent.removeEffect(effectId);
    }
    
    // 重置实体的属性加成
    const statsComponent = entity.getComponent<StatsComponent>('Stats');
    if (statsComponent) {
      // 这里可以重置因羁绊而修改的属性
      // 注意：如果属性修改是通过效果系统实现的，那么移除效果后属性会自动恢复
      console.log(`清除实体 ${entity.getId()} 的羁绊效果`);
    }
  }
  
  /**
   * 获取或创建效果组件
   * @param entity 目标实体
   * @returns 效果组件
   */
  private getOrCreateEffectsComponent(entity: Entity): EffectsComponent {
    let effectsComponent = entity.getComponent<EffectsComponent>('Effects');
    if (!effectsComponent) {
      effectsComponent = new EffectsComponent();
      entity.addComponent('Effects', effectsComponent);
    }
    return effectsComponent;
  }
  
  /**
   * 获取羁绊加成值
   * @param synergyEffect 羁绊效果
   * @param level 羁绊等级
   * @returns 加成值
   */
  private getSynergyBonusValue(synergyEffect: any, level: number): number {
    // 根据等级获取对应的加成值
    // 这里简化处理，实际应该根据具体羁绊效果和等级计算
    return synergyEffect.bonusValue ? synergyEffect.bonusValue[level - 1] || 0 : 0;
  }
  
  /**
   * 应用属性加成
   * @param entity 目标实体
   * @param synergyEffect 羁绊效果
   * @param level 羁绊等级
   */
  private applyStatBonus(entity: Entity, synergyEffect: any, level: number): void {
    const statsComponent = entity.getComponent<StatsComponent>('Stats');
    if (!statsComponent) return;
    
    // 根据羁绊效果和等级应用属性加成
    // 这里需要根据具体的羁绊效果设计来实现
    if (synergyEffect.statBonus) {
      const bonusLevel = level - 1;
      const statBonus = synergyEffect.statBonus[bonusLevel];
      
      if (statBonus) {
        // 应用各种属性加成
        if (statBonus.attackDamage) statsComponent.attackDamage += statBonus.attackDamage;
        if (statBonus.magicPower) statsComponent.magicPower += statBonus.magicPower;
        if (statBonus.armor) statsComponent.armor += statBonus.armor;
        if (statBonus.magicResist) statsComponent.magicResist += statBonus.magicResist;
        if (statBonus.maxHealth) {
          const healthIncrease = statBonus.maxHealth;
          statsComponent.maxHealth += healthIncrease;
          statsComponent.currentHealth += healthIncrease; // 同时增加当前生命值
        }
        if (statBonus.attackSpeed) statsComponent.attackSpeed += statBonus.attackSpeed;
        if (statBonus.critChance) statsComponent.critChance += statBonus.critChance;
        if (statBonus.critDamage) statsComponent.critDamage += statBonus.critDamage;
      }
    }
  }
}