/**
 * ElementalSystem.ts
 * 元素系统 - 处理实体的元素属性、元素反应和元素效果
 */
import { AbstractSystem } from '../System';
import { EntityManager } from '../EntityManager';
import { Entity } from '../Entity';
import { ElementalComponent } from '../components/ElementalComponent';
import { ElementType } from './AdvancedDamageCalculator';
import { EffectsComponent } from '../components/CombatComponents';
import { StatsComponent } from '../components/StatsComponent';
import { PositionComponent } from '../Component';
import { EffectType } from '../../../models/CharacterStats';

/**
 * 元素反应结果接口
 */
export interface ElementalReactionResult {
  reactionType: string;      // 反应类型
  intensity: number;         // 反应强度
  sourceEntityId: number;    // 来源实体ID
  targetEntityId: number;    // 目标实体ID
  elementA: ElementType;     // 元素A
  elementB: ElementType;     // 元素B
  affectedEntities: number[]; // 受影响的实体ID列表
}

/**
 * 元素系统 - 处理实体的元素属性、元素反应和元素效果
 */
export class ElementalSystem extends AbstractSystem {
  readonly type: string = 'Elemental';
  
  // 存储最近发生的元素反应
  private recentReactions: ElementalReactionResult[] = [];
  
  constructor(priority: number = 15) {
    super(priority);
  }
  
  /**
   * 系统初始化
   * @param entityManager 实体管理器
   */
  init(_entityManager: EntityManager): void {
    console.log('元素系统初始化');
  }
  
  /**
   * 系统更新
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  update(deltaTime: number, entityManager: EntityManager): void {
    // 获取所有具有元素组件的实体
    const elementalEntities = this.getEntitiesWithComponents(
      entityManager,
      ['Elemental']
    );
    
    // 更新元素效果持续时间
    for (const entity of elementalEntities) {
      this.updateElementalEffects(entity, deltaTime, entityManager);
    }
    
    // 处理元素反应
    this.processElementalReactions(elementalEntities, entityManager);
    
    // 清理过期的反应记录
    this.cleanupRecentReactions();
  }
  
  /**
   * 更新实体的元素效果
   * @param entity 实体
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private updateElementalEffects(entity: Entity, deltaTime: number, _entityManager: EntityManager): void {
    const elementalComponent = entity.getComponent<ElementalComponent>('Elemental');
    if (!elementalComponent) return;
    
    // 更新元素效果持续时间并获取过期效果
    const expiredEffects = elementalComponent.updateElementalEffects(deltaTime);
    
    // 处理过期效果
    for (const effectId of expiredEffects) {
      console.log(`实体 ${entity.getId()} 的元素效果 ${effectId} 已过期`);
      
      // 这里可以添加元素效果过期的特殊处理
      // 例如：某些元素效果过期时可能触发额外效果
    }
  }
  
  /**
   * 处理元素反应
   * @param entities 实体列表
   * @param entityManager 实体管理器
   */
  private processElementalReactions(entities: Entity[], _entityManager: EntityManager): void {
    // 检查实体之间可能的元素反应
    // 这里简化处理，只检查有元素效果的实体之间的反应
    for (let i = 0; i < entities.length; i++) {
      const entityA = entities[i];
      const elementalA = entityA.getComponent<ElementalComponent>('Elemental');
      if (!elementalA || elementalA.primaryElement === ElementType.NONE) continue;
      
      for (let j = i + 1; j < entities.length; j++) {
        const entityB = entities[j];
        const elementalB = entityB.getComponent<ElementalComponent>('Elemental');
        if (!elementalB || elementalB.primaryElement === ElementType.NONE) continue;
        
        // 检查两个实体是否足够近以触发反应
        if (this.areEntitiesClose(entityA, entityB, 3.0, _entityManager)) {
          // 尝试触发元素反应
          this.tryTriggerReaction(entityA, entityB, _entityManager);
        }
      }
    }
  }
  
  /**
   * 检查两个实体是否足够近
   * @param entityA 实体A
   * @param entityB 实体B
   * @param maxDistance 最大距离
   * @param entityManager 实体管理器
   */
  private areEntitiesClose(entityA: Entity, entityB: Entity, maxDistance: number, _entityManager: EntityManager): boolean {
    const positionA = entityA.getComponent<PositionComponent>('Position');
    const positionB = entityB.getComponent<PositionComponent>('Position');
    
    if (!positionA || !positionB) return false;
    
    const distance = Math.sqrt(
      Math.pow(positionA.x - positionB.x, 2) + 
      Math.pow(positionA.y - positionB.y, 2)
    );
    
    return distance <= maxDistance;
  }
  
  /**
   * 尝试触发元素反应
   * @param entityA 实体A
   * @param entityB 实体B
   * @param entityManager 实体管理器
   */
  private tryTriggerReaction(entityA: Entity, entityB: Entity, _entityManager: EntityManager): void {
    const elementalA = entityA.getComponent<ElementalComponent>('Elemental');
    const elementalB = entityB.getComponent<ElementalComponent>('Elemental');
    
    if (!elementalA || !elementalB) return;
    
    // 检查A对B的反应
    const reactionAB = elementalA.checkElementalReaction(elementalB.primaryElement);
    if (reactionAB) {
      this.applyElementalReaction(
        entityA,
        entityB,
        elementalA.primaryElement,
        elementalB.primaryElement,
        reactionAB.reactionType,
        reactionAB.intensity,
        _entityManager  // 修复点1：使用正确的参数名
      );
    }
    
    // 检查B对A的反应
    const reactionBA = elementalB.checkElementalReaction(elementalA.primaryElement);
    if (reactionBA) {
      this.applyElementalReaction(
        entityB,
        entityA,
        elementalB.primaryElement,
        elementalA.primaryElement,
        reactionBA.reactionType,
        reactionBA.intensity,
        _entityManager  // 修复点2：使用正确的参数名
      );
    }
  }
  
  /**
   * 应用元素反应
   * @param source 源实体
   * @param target 目标实体
   * @param elementA 元素A
   * @param elementB 元素B
   * @param reactionType 反应类型
   * @param intensity 反应强度
   * @param entityManager 实体管理器
   */
  private applyElementalReaction(
    source: Entity,
    target: Entity,
    elementA: ElementType,
    elementB: ElementType,
    reactionType: string,
    intensity: number,
    _entityManager: EntityManager
  ): void {
    const sourceId = source.getId();
    const targetId = target.getId();
    
    console.log(`元素反应: ${reactionType} 在实体 ${sourceId} 和 ${targetId} 之间触发，强度: ${intensity}`);
    
    // 记录反应
    const reaction: ElementalReactionResult = {
      reactionType,
      intensity,
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      elementA,
      elementB,
      affectedEntities: [sourceId, targetId]
    };
    
    this.recentReactions.push(reaction);
    
    // 根据反应类型应用不同效果
    switch (reactionType) {
      case 'vaporize': // 蒸发 - 伤害倍增
        this.applyVaporizeEffect(source, target, intensity, _entityManager);
        break;
      case 'spread': // 扩散 - 范围伤害
        this.applySpreadEffect(source, target, intensity, _entityManager);
        break;
      case 'growth': // 生长 - 治疗效果
        this.applyGrowthEffect(source, target, intensity, _entityManager);
        break;
      case 'annihilation': // 湮灭 - 双倍伤害
        this.applyAnnihilationEffect(source, target, intensity, _entityManager);
        break;
    }
  }
  
  /**
   * 应用蒸发效果 (伤害倍增)
   * @param source 源实体
   * @param target 目标实体
   * @param intensity 强度
   * @param entityManager 实体管理器
   */
  private applyVaporizeEffect(source: Entity, target: Entity, intensity: number, _entityManager: EntityManager): void {
    // 为源实体添加伤害增益效果
    const effectsComponent = source.getComponent<EffectsComponent>('Effects');
    if (effectsComponent) {
      effectsComponent.addEffect({
        id: `vaporize_${Date.now()}`,
        name: '蒸发',
        type: EffectType.DAMAGE,
        value: (intensity - 1) * 100, // 转换为百分比增益
        duration: 5, // 持续5秒
        sourceEntityId: source.getId()
      });
    }
    
    // 可以添加视觉效果或其他反馈
    console.log(`蒸发效果: 实体 ${source.getId()} 对 ${target.getId()} 的伤害增加 ${(intensity - 1) * 100}%`);
  }
  
  /**
   * 应用扩散效果 (范围伤害)
   * @param source 源实体
   * @param target 目标实体
   * @param intensity 强度
   * @param _entityManager 实体管理器
   */
  private applySpreadEffect(source: Entity, target: Entity, intensity: number, _entityManager: EntityManager): void {
    // 获取目标位置
    const targetPosition = target.getComponent<PositionComponent>('Position');
    if (!targetPosition) return;
    
    // 获取源实体属性
    const sourceStats = source.getComponent<StatsComponent>('Stats');
    if (!sourceStats) return;
    
    // 寻找范围内的其他实体
    const nearbyEntities = this.getEntitiesNearPosition(
      targetPosition.x,
      targetPosition.y,
      5.0, // 扩散范围
      _entityManager  // 修复点3：使用统一参数命名
    );
    
    // 计算扩散伤害
    const spreadDamage = sourceStats.magicPower * 0.3 * intensity;
    
    // 对范围内实体造成伤害
    for (const entity of nearbyEntities) {
      if (entity.getId() === source.getId() || entity.getId() === target.getId()) {
        continue; // 跳过源实体和目标实体
      }
      
      const entityStats = entity.getComponent<StatsComponent>('Stats');
      if (entityStats) {
        entityStats.currentHealth -= Math.round(spreadDamage);
        console.log(`扩散效果: 对实体 ${entity.getId()} 造成 ${Math.round(spreadDamage)} 点伤害`);
      }
    }
  }
  
  /**
   * 应用生长效果 (治疗效果)
   * @param source 源实体
   * @param target 目标实体
   * @param intensity 强度
   * @param _entityManager 实体管理器
   */
  private applyGrowthEffect(source: Entity, target: Entity, intensity: number, _entityManager: EntityManager): void {
    // 获取源实体属性
    const sourceStats = source.getComponent<StatsComponent>('Stats');
    if (!sourceStats) return;
    
    // 计算治疗量
    const healAmount = sourceStats.magicPower * 0.5 * intensity;
    
    // 为目标实体添加治疗效果
    const targetStats = target.getComponent<StatsComponent>('Stats');
    if (targetStats) {
      targetStats.currentHealth = Math.min(
        targetStats.maxHealth,
        targetStats.currentHealth + Math.round(healAmount)
      );
      console.log(`生长效果: 治疗实体 ${target.getId()} ${Math.round(healAmount)} 点生命值`);
    }
    
    // 添加持续治疗效果
    const effectsComponent = target.getComponent<EffectsComponent>('Effects');
    if (effectsComponent) {
      effectsComponent.addEffect({
        id: `growth_${Date.now()}`,
        name: '生长',
        type: EffectType.HEAL,
        value: healAmount * 0.2, // 每秒恢复原始治疗量的20%
        duration: 5, // 持续5秒
        sourceEntityId: source.getId()
      });
    }
  }
  
  /**
   * 应用湮灭效果 (双倍伤害)
   * @param source 源实体
   * @param target 目标实体
   * @param intensity 强度
   * @param _entityManager 实体管理器
   */
  private applyAnnihilationEffect(source: Entity, target: Entity, intensity: number, _entityManager: EntityManager): void {
    // 获取源实体属性
    const sourceStats = source.getComponent<StatsComponent>('Stats');
    if (!sourceStats) return;
    
    // 计算湮灭伤害
    const annihilationDamage = sourceStats.attackDamage * intensity;
    
    // 对目标造成伤害
    const targetStats = target.getComponent<StatsComponent>('Stats');
    if (targetStats) {
      targetStats.currentHealth -= Math.round(annihilationDamage);
      console.log(`湮灭效果: 对实体 ${target.getId()} 造成 ${Math.round(annihilationDamage)} 点伤害`);
    }
    
    // 添加视觉效果或其他反馈
    // 这里可以添加特殊的视觉效果或音效
    
    // 添加短暂的眩晕效果
    const effectsComponent = target.getComponent<EffectsComponent>('Effects');
    if (effectsComponent) {
      effectsComponent.addEffect({
        id: `annihilation_stun_${Date.now()}`,
        name: '湮灭眩晕',
        type: EffectType.CONTROL,
        value: 1, // 眩晕强度
        duration: 2, // 持续2秒
        sourceEntityId: source.getId()
      });
    }
  }
  
  /**
   * 获取位置附近的实体
   * @param x X坐标
   * @param y Y坐标
   * @param radius 半径
   * @param entityManager 实体管理器
   * @returns 附近的实体列表
   */
  private getEntitiesNearPosition(x: number, y: number, radius: number, entityManager: EntityManager): Entity[] {
    const entities = entityManager.getEntities();
    const nearbyEntities: Entity[] = [];
    
    for (const entity of entities) {
      const position = entity.getComponent<PositionComponent>('Position');
      if (!position) continue;
      
      const distance = Math.sqrt(
        Math.pow(position.x - x, 2) + 
        Math.pow(position.y - y, 2)
      );
      
      if (distance <= radius) {
        nearbyEntities.push(entity);
      }
    }
    
    return nearbyEntities;
  }
  
  /**
   * 清理过期的反应记录
   * 只保留最近30秒内的反应
   */
  private cleanupRecentReactions(): void {
    if (this.recentReactions.length > 100) {
      this.recentReactions = this.recentReactions.slice(-100);
    }
  }
}