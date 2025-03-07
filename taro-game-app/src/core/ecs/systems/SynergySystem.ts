/**
 * SynergySystem.ts
 * 实现羁绊系统，处理角色的职业和种族羁绊效果
 */
import { AbstractSystem } from '../System';
import { Entity } from '../Entity';
import { EntityManager } from '../EntityManager';
import { CharacterStatsComponent, SynergyComponent, TeamComponent } from '../components/MovementComponents';
import { CharacterClass, CharacterRace, SYNERGY_EFFECTS, SynergyEffect } from '../../../models/CharacterStats';

/**
 * 羁绊系统 - 处理角色的职业和种族羁绊效果
 */
export class SynergySystem extends AbstractSystem {
  readonly type: string = 'Synergy';
  
  constructor(priority: number = 20) {
    super(priority);
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
      this.processSynergiesForTeam(teamId, entities);
    }
  }
  
  /**
   * 处理队伍的羁绊效果
   * @param teamId 队伍ID
   * @param entities 队伍中的实体
   */
  private processSynergiesForTeam(teamId: number, entities: Entity[]): void {
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
      
      classCounts[stats.class]++;
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
          }
        }
      }
    }
    
    // 更新队伍中每个实体的羁绊组件
    for (const entity of entities) {
      // 获取或创建羁绊组件
      let synergy = entity.getComponent<SynergyComponent>('Synergy');
      
      if (!synergy) {
        synergy = new SynergyComponent();
        entity.addComponent('Synergy', synergy);
      }
      
      // 更新激活的羁绊
      synergy.activeClassSynergies = { ...activeClassSynergies };
      synergy.activeRaceSynergies = { ...activeRaceSynergies };
      
      // 应用羁绊效果
      if (!synergy.appliedBonuses) {
        this.applyBonuses(entity, synergy);
        synergy.appliedBonuses = true;
      } else {
        // 如果羁绊发生变化，重新应用效果
        this.applyBonuses(entity, synergy);
      }
    }
  }
  
  /**
   * 应用羁绊加成效果
   * @param entity 实体
   * @param synergy 羁绊组件
   */
  private applyBonuses(entity: Entity, synergy: SynergyComponent): void {
    const stats = entity.getComponent<CharacterStatsComponent>('CharacterStats');
    if (!stats) return;
    
    // 应用职业羁绊效果
    for (const [classType, level] of Object.entries(synergy.activeClassSynergies)) {
      const synergyEffect = SYNERGY_EFFECTS.find(effect => effect.type === classType);
      
      if (synergyEffect && level > 0 && level <= synergyEffect.effects.length) {
        const effect = synergyEffect.effects[level - 1];
        
        // 应用属性加成
        this.applyStatBonuses(stats, effect.statBonus);
      }
    }
    
    // 应用种族羁绊效果
    for (const [raceType, level] of Object.entries(synergy.activeRaceSynergies)) {
      const synergyEffect = SYNERGY_EFFECTS.find(effect => effect.type === raceType);
      
      if (synergyEffect && level > 0 && level <= synergyEffect.effects.length) {
        const effect = synergyEffect.effects[level - 1];
        
        // 应用属性加成
        this.applyStatBonuses(stats, effect.statBonus);
      }
    }
  }
  
  /**
   * 应用属性加成
   * @param stats 角色属性组件
   * @param bonuses 属性加成
   */
  private applyStatBonuses(stats: CharacterStatsComponent, bonuses: Partial<any>): void {
    // 应用各种属性加成
    if (bonuses.health) stats.maxHealth += bonuses.health;
    if (bonuses.attack) stats.attack += bonuses.attack;
    if (bonuses.defense) stats.defense += bonuses.defense;
    if (bonuses.magicPower) stats.magicPower += bonuses.magicPower;
    if (bonuses.magicResist) stats.magicResist += bonuses.magicResist;
    if (bonuses.critChance) stats.critChance += bonuses.critChance;
    if (bonuses.critDamage) stats.critDamage += bonuses.critDamage;
    if (bonuses.attackSpeed) stats.attackSpeed += bonuses.attackSpeed;
    if (bonuses.moveSpeed) stats.moveSpeed += bonuses.moveSpeed;
    if (bonuses.range) stats.range += bonuses.range;
    if (bonuses.manaRegen) stats.manaRegen += bonuses.manaRegen;
    
    // 确保当前生命值不超过最大生命值
    stats.health = Math.min(stats.health, stats.maxHealth);
  }
}