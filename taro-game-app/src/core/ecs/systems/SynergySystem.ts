/**
 * SynergySystem.ts
 * 实现羁绊系统，处理角色的职业和种族羁绊效果
 */
import { AbstractSystem } from '../System';
import { Entity } from '../Entity';
import { EntityManager } from '../EntityManager';
import { CharacterStatsComponent, SynergyComponent, TeamComponent } from '../components/MovementComponents';
import { CharacterClass, CharacterRace, SYNERGY_EFFECTS } from '../../../models/CharacterStats';

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
          }
        }
      }
    }

    // 更新每个实体的羁绊组件
    for (const entity of entities) {
      let synergy = entity.getComponent<SynergyComponent>('Synergy');
      if (!synergy) {
        synergy = new SynergyComponent();
        entity.addComponent(synergy);
      }
      
      // 更新羁绊状态并标记队伍ID
      synergy.activeClassSynergies = activeClassSynergies;
      synergy.activeRaceSynergies = activeRaceSynergies;
      synergy.appliedBonuses = false; // 重置应用状态，等待下一次更新
    }
  }
}