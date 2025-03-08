/**
 * Entity类 - ECS架构中的实体
 * 实体仅作为组件的容器，没有自己的行为
 */
export class Entity {
  private static nextId: number = 0;
  private id: number;
  private components: Map<string, any>;
  private tags: Set<string>;

  constructor() {
    this.id = Entity.nextId++;
    this.components = new Map();
    this.tags = new Set();
  }

  /**
   * 获取实体ID
   */
  getId(): number {
    return this.id;
  }

  /**
   * 添加组件
   * @param componentType 组件类型名称
   * @param component 组件实例
   */
  addComponent<T>(componentType: string, component: T): Entity {
    this.components.set(componentType, component);
    return this;
  }

  /**
   * 移除组件
   * @param componentType 组件类型名称
   */
  removeComponent(componentType: string): Entity {
    this.components.delete(componentType);
    return this;
  }

  /**
   * 获取组件
   * @param componentType 组件类型名称
   */
  getComponent<T>(componentType: string): T | undefined {
    return this.components.get(componentType) as T;
  }

  /**
   * 检查是否拥有指定组件
   * @param componentType 组件类型名称
   */
  hasComponent(componentType: string): boolean {
    return this.components.has(componentType);
  }

  /**
   * 添加标签
   * @param tag 标签名称
   */
  addTag(tag: string): Entity {
    this.tags.add(tag);
    return this;
  }

  /**
   * 移除标签
   * @param tag 标签名称
   */
  removeTag(tag: string): Entity {
    this.tags.delete(tag);
    return this;
  }

  /**
   * 检查是否拥有指定标签
   * @param tag 标签名称
   */
  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }

  /**
   * 获取所有标签
   */
  getTags(): string[] {
    return Array.from(this.tags);
  }

  /**
   * 获取所有组件类型
   */
  getComponentTypes(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * 获取实体名称
   * 如果实体有Name组件，则返回其名称，否则返回实体ID
   */
  getName(): string {
    const nameComponent = this.getComponent<{name: string}>('Name');
    return nameComponent ? nameComponent.name : `实体 ${this.id}`;
  }
}