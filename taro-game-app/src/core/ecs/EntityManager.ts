/**
 * EntityManager类 - 负责管理所有实体
 */
import { Entity } from './Entity';
import { System } from './System';

export class EntityManager {
  private entities: Map<number, Entity>;
  private systems: System[];
  private entitiesToAdd: Entity[];
  private entitiesToRemove: Set<number>;
  private systemsDirty: boolean;

  constructor() {
    this.entities = new Map();
    this.systems = [];
    this.entitiesToAdd = [];
    this.entitiesToRemove = new Set();
    this.systemsDirty = false;
  }

  /**
   * 创建一个新实体
   */
  createEntity(): Entity {
    const entity = new Entity();
    this.entitiesToAdd.push(entity);
    return entity;
  }

  /**
   * 移除实体
   * @param entityId 实体ID
   */
  removeEntity(entityId: number): void {
    this.entitiesToRemove.add(entityId);
  }

  /**
   * 获取所有实体
   */
  getEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /**
   * 根据ID获取实体
   * @param entityId 实体ID
   */
  getEntityById(entityId: number): Entity | undefined {
    return this.entities.get(entityId);
  }

  /**
   * 根据标签获取实体
   * @param tag 标签名称
   */
  getEntitiesByTag(tag: string): Entity[] {
    return this.getEntities().filter(entity => entity.hasTag(tag));
  }

  /**
   * 根据组件类型获取实体
   * @param componentType 组件类型名称
   */
  getEntitiesByComponent(componentType: string): Entity[] {
    return this.getEntities().filter(entity => entity.hasComponent(componentType));
  }

  /**
   * 添加系统
   * @param system 系统实例
   */
  addSystem(system: System): void {
    this.systems.push(system);
    this.systemsDirty = true;
    system.init?.(this);
  }

  /**
   * 移除系统
   * @param systemType 系统类型名称
   */
  removeSystem(systemType: string): void {
    const index = this.systems.findIndex(system => system.type === systemType);
    if (index !== -1) {
      const system = this.systems[index];
      system.destroy?.();
      this.systems.splice(index, 1);
    }
  }

  /**
   * 获取系统
   * @param systemType 系统类型名称
   */
  getSystem<T extends System>(systemType: string): T | undefined {
    return this.systems.find(system => system.type === systemType) as T | undefined;
  }

  /**
   * 更新所有系统
   * @param deltaTime 时间增量（秒）
   */
  update(deltaTime: number): void {
    // 处理待添加的实体
    if (this.entitiesToAdd.length > 0) {
      for (const entity of this.entitiesToAdd) {
        this.entities.set(entity.getId(), entity);
      }
      this.entitiesToAdd = [];
    }

    // 处理待移除的实体
    if (this.entitiesToRemove.size > 0) {
      for (const entityId of this.entitiesToRemove) {
        this.entities.delete(entityId);
      }
      this.entitiesToRemove.clear();
    }

    // 如果系统列表有变化，按优先级排序
    if (this.systemsDirty) {
      this.systems.sort((a, b) => a.priority - b.priority);
      this.systemsDirty = false;
    }

    // 更新所有启用的系统
    for (const system of this.systems) {
      if (system.enabled) {
        system.update(deltaTime, this);
      }
    }
  }

  /**
   * 清空所有实体和系统
   */
  clear(): void {
    // 销毁所有系统
    for (const system of this.systems) {
      system.destroy?.();
    }

    // 清空所有集合
    this.entities.clear();
    this.systems = [];
    this.entitiesToAdd = [];
    this.entitiesToRemove.clear();
  }
}