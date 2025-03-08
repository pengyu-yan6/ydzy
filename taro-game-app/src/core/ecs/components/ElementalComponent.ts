/**
 * ElementalComponent.ts
 * 元素属性组件 - 用于管理实体的元素属性和相关效果
 */
import { Component } from '../Component';
import { ElementType } from '../systems/AdvancedDamageCalculator';

/**
 * 元素属性组件 - 用于管理实体的元素属性和相关效果
 */
export class ElementalComponent implements Component {
  readonly type: string = 'Elemental';
  
  constructor(
    public primaryElement: ElementType = ElementType.NONE,  // 主要元素类型
    public secondaryElement: ElementType = ElementType.NONE, // 次要元素类型
    public elementalResistance: Map<ElementType, number> = new Map(), // 元素抗性映射 (百分比)
    public elementalPenetration: Map<ElementType, number> = new Map(), // 元素穿透映射 (百分比)
    public elementalDamageBonus: Map<ElementType, number> = new Map(), // 元素伤害加成映射 (百分比)
    public activeElementalEffects: Map<string, {
      element: ElementType,
      duration: number,
      intensity: number,
      sourceEntityId: number
    }> = new Map() // 激活的元素效果
  ) {
    // 初始化默认元素抗性
    if (elementalResistance.size === 0) {
      Object.values(ElementType).forEach(element => {
        if (element !== ElementType.NONE) {
          this.elementalResistance.set(element as ElementType, 0);
        }
      });
    }
  }
  
  /**
   * 获取对特定元素的抗性
   * @param element 元素类型
   * @returns 抗性值 (百分比)
   */
  getResistance(element: ElementType): number {
    return this.elementalResistance.get(element) || 0;
  }
  
  /**
   * 设置对特定元素的抗性
   * @param element 元素类型
   * @param value 抗性值 (百分比)
   */
  setResistance(element: ElementType, value: number): void {
    this.elementalResistance.set(element, value);
  }
  
  /**
   * 增加对特定元素的抗性
   * @param element 元素类型
   * @param value 增加的抗性值 (百分比)
   */
  addResistance(element: ElementType, value: number): void {
    const currentValue = this.getResistance(element);
    this.elementalResistance.set(element, currentValue + value);
  }
  
  /**
   * 获取特定元素的伤害加成
   * @param element 元素类型
   * @returns 伤害加成值 (百分比)
   */
  getDamageBonus(element: ElementType): number {
    return this.elementalDamageBonus.get(element) || 0;
  }
  
  /**
   * 设置特定元素的伤害加成
   * @param element 元素类型
   * @param value 伤害加成值 (百分比)
   */
  setDamageBonus(element: ElementType, value: number): void {
    this.elementalDamageBonus.set(element, value);
  }
  
  /**
   * 增加特定元素的伤害加成
   * @param element 元素类型
   * @param value 增加的伤害加成值 (百分比)
   */
  addDamageBonus(element: ElementType, value: number): void {
    const currentValue = this.getDamageBonus(element);
    this.elementalDamageBonus.set(element, currentValue + value);
  }
  
  /**
   * 应用元素效果
   * @param effectId 效果ID
   * @param element 元素类型
   * @param duration 持续时间
   * @param intensity 效果强度
   * @param sourceEntityId 效果来源实体ID
   */
  applyElementalEffect(effectId: string, element: ElementType, duration: number, intensity: number, sourceEntityId: number): void {
    this.activeElementalEffects.set(effectId, {
      element,
      duration,
      intensity,
      sourceEntityId
    });
  }
  
  /**
   * 移除元素效果
   * @param effectId 效果ID
   */
  removeElementalEffect(effectId: string): void {
    this.activeElementalEffects.delete(effectId);
  }
  
  /**
   * 更新元素效果持续时间
   * @param deltaTime 时间增量
   * @returns 已过期的效果ID列表
   */
  updateElementalEffects(deltaTime: number): string[] {
    const expiredEffects: string[] = [];
    
    for (const [effectId, effect] of this.activeElementalEffects.entries()) {
      effect.duration -= deltaTime;
      
      if (effect.duration <= 0) {
        expiredEffects.push(effectId);
      }
    }
    
    // 移除过期效果
    for (const effectId of expiredEffects) {
      this.activeElementalEffects.delete(effectId);
    }
    
    return expiredEffects;
  }
  
  /**
   * 检查元素反应
   * 当两种元素相遇时，可能会产生特殊效果
   * @param incomingElement 传入的元素
   * @returns 反应类型和强度
   */
  checkElementalReaction(incomingElement: ElementType): { reactionType: string, intensity: number } | null {
    if (this.primaryElement === ElementType.NONE || incomingElement === ElementType.NONE) {
      return null;
    }
    
    // 火 + 水 = 蒸发 (伤害倍增)
    if ((this.primaryElement === ElementType.FIRE && incomingElement === ElementType.WATER) ||
        (this.primaryElement === ElementType.WATER && incomingElement === ElementType.FIRE)) {
      return { reactionType: 'vaporize', intensity: 1.5 };
    }
    
    // 火 + 风 = 扩散 (范围伤害)
    if ((this.primaryElement === ElementType.FIRE && incomingElement === ElementType.AIR) ||
        (this.primaryElement === ElementType.AIR && incomingElement === ElementType.FIRE)) {
      return { reactionType: 'spread', intensity: 1.2 };
    }
    
    // 水 + 土 = 生长 (治疗效果)
    if ((this.primaryElement === ElementType.WATER && incomingElement === ElementType.EARTH) ||
        (this.primaryElement === ElementType.EARTH && incomingElement === ElementType.WATER)) {
      return { reactionType: 'growth', intensity: 1.3 };
    }
    
    // 光 + 暗 = 湮灭 (双倍伤害)
    if ((this.primaryElement === ElementType.LIGHT && incomingElement === ElementType.DARK) ||
        (this.primaryElement === ElementType.DARK && incomingElement === ElementType.LIGHT)) {
      return { reactionType: 'annihilation', intensity: 2.0 };
    }
    
    return null;
  }
}