/**
 * System接口 - ECS架构中的系统基础接口
 * 系统包含行为但不包含数据，处理拥有特定组件的实体
 */
import { Entity } from './Entity';
import { EntityManager } from './EntityManager';

export interface System {
  // 系统类型标识
  readonly type: string;
  
  // 系统优先级，数值越小优先级越高
  readonly priority: number;
  
  // 系统是否启用
  enabled: boolean;
  
  // 系统初始化方法
  init?(entityManager: EntityManager): void;
  
  // 系统更新方法，处理游戏逻辑
  update(deltaTime: number, entityManager: EntityManager): void;
  
  // 系统销毁方法
  destroy?(): void;
}

/**
 * 抽象系统类 - 提供基础系统实现
 */
export abstract class AbstractSystem implements System {
  abstract readonly type: string;
  readonly priority: number = 0;
  enabled: boolean = true;
  
  constructor(priority: number = 0) {
    this.priority = priority;
  }
  
  init?(entityManager: EntityManager): void;
  
  abstract update(deltaTime: number, entityManager: EntityManager): void;
  
  destroy?(): void;
  
  /**
   * 获取满足条件的实体
   * @param entityManager 实体管理器
   * @param componentTypes 需要包含的组件类型
   */
  protected getEntitiesWithComponents(entityManager: EntityManager, componentTypes: string[]): Entity[] {
    return entityManager.getEntities().filter(entity => {
      return componentTypes.every(type => entity.hasComponent(type));
    });
  }
}

/**
 * 移动系统 - 处理实体的移动逻辑
 */
export class MovementSystem extends AbstractSystem {
  readonly type: string = 'Movement';
  
  constructor(priority: number = 0) {
    super(priority);
  }
  
  update(deltaTime: number, entityManager: EntityManager): void {
    // 获取同时拥有Position和Velocity组件的实体
    const entities = this.getEntitiesWithComponents(entityManager, ['Position', 'Velocity']);
    
    // 更新每个实体的位置
    for (const entity of entities) {
      const position = entity.getComponent<{x: number, y: number}>('Position');
      const velocity = entity.getComponent<{vx: number, vy: number}>('Velocity');
      
      if (position && velocity) {
        position.x += velocity.vx * deltaTime;
        position.y += velocity.vy * deltaTime;
      }
    }
  }
}

/**
 * 渲染系统 - 处理实体的渲染逻辑
 */
export class RenderSystem extends AbstractSystem {
  readonly type: string = 'Render';
  private context: CanvasRenderingContext2D | null = null;
  
  constructor(context: CanvasRenderingContext2D | null = null, priority: number = 100) {
    super(priority);
    this.context = context;
  }
  
  setContext(context: CanvasRenderingContext2D): void {
    this.context = context;
  }
  
  update(_deltaTime: number, entityManager: EntityManager): void {
    // 使用下划线前缀标记有意未使用的变量
    // const frameTime = deltaTime;
    
    if (!this.context) return;
    
    // 清空画布
    this.context.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);
    
    // 获取同时拥有Position和Render组件的实体
    const entities = this.getEntitiesWithComponents(entityManager, ['Position', 'Render']);
    
    // 渲染每个实体
    for (const entity of entities) {
      const position = entity.getComponent<{x: number, y: number}>('Position');
      const render = entity.getComponent<{width: number, height: number, color: string, sprite?: string}>('Render');
      
      if (position && render) {
        this.context.fillStyle = render.color;
        this.context.fillRect(position.x, position.y, render.width, render.height);
        
        // 如果有精灵图片，则绘制图片
        if (render.sprite) {
          // 这里可以实现精灵图片的绘制逻辑
          // 需要先加载图片资源，然后使用drawImage方法绘制
        }
      }
    }
  }
}

/**
 * 碰撞系统 - 处理实体间的碰撞检测
 */
export class CollisionSystem extends AbstractSystem {
  readonly type: string = 'Collision';
  
  constructor(priority: number = 50) {
    super(priority);
  }
  
  update(_deltaTime: number, entityManager: EntityManager): void {
    // 使用下划线前缀标记有意未使用的变量
    // const physicsTimeStep = deltaTime;
    
    // 获取同时拥有Position和Collision组件的实体
    const entities = this.getEntitiesWithComponents(entityManager, ['Position', 'Collision']);
    
    // 检测实体间的碰撞
    for (let i = 0; i < entities.length; i++) {
      const entityA = entities[i];
      const posA = entityA.getComponent<{x: number, y: number}>('Position');
      const collA = entityA.getComponent<{width: number, height: number, isStatic: boolean, collisionGroup: string}>('Collision');
      
      if (!posA || !collA) continue;
      
      for (let j = i + 1; j < entities.length; j++) {
        const entityB = entities[j];
        const posB = entityB.getComponent<{x: number, y: number}>('Position');
        const collB = entityB.getComponent<{width: number, height: number, isStatic: boolean, collisionGroup: string}>('Collision');
        
        if (!posB || !collB) continue;
        
        // 如果两个实体都是静态的，则跳过碰撞检测
        if (collA.isStatic && collB.isStatic) continue;
        
        // 如果两个实体属于不同的碰撞组，且需要忽略碰撞，则跳过
        if (collA.collisionGroup !== collB.collisionGroup && this.shouldIgnoreCollision(collA.collisionGroup, collB.collisionGroup)) {
          continue;
        }
        
        // 检测碰撞
        if (this.checkCollision(posA, collA, posB, collB)) {
          // 处理碰撞响应
          this.handleCollision(entityA, entityB, posA, collA, posB, collB);
        }
      }
    }
  }
  
  /**
   * 检测两个实体是否碰撞
   */
  private checkCollision(
    posA: {x: number, y: number},
    collA: {width: number, height: number},
    posB: {x: number, y: number},
    collB: {width: number, height: number}
  ): boolean {
    return (
      posA.x < posB.x + collB.width &&
      posA.x + collA.width > posB.x &&
      posA.y < posB.y + collB.height &&
      posA.y + collA.height > posB.y
    );
  }
  
  /**
   * 处理碰撞响应
   */
  private handleCollision(
    _entityA: Entity,
    _entityB: Entity,
    posA: {x: number, y: number},
    collA: {width: number, height: number, isStatic: boolean},
    posB: {x: number, y: number},
    collB: {width: number, height: number, isStatic: boolean}
  ): void {
    // 使用下划线前缀标记有意未使用的变量
    // const entityAId = entityA.getId();
    // const entityBId = entityB.getId();
    // 这里可以实现碰撞响应逻辑
    // 例如：弹开、销毁、触发事件等
    
    // 简单的弹开逻辑示例
    if (!collA.isStatic && !collB.isStatic) {
      // 两个实体都不是静态的，均匀分配弹开距离
      const overlapX = Math.min(posA.x + collA.width - posB.x, posB.x + collB.width - posA.x);
      const overlapY = Math.min(posA.y + collA.height - posB.y, posB.y + collB.height - posA.y);
      
      if (overlapX < overlapY) {
        // X轴方向弹开
        if (posA.x < posB.x) {
          posA.x -= overlapX / 2;
          posB.x += overlapX / 2;
        } else {
          posA.x += overlapX / 2;
          posB.x -= overlapX / 2;
        }
      } else {
        // Y轴方向弹开
        if (posA.y < posB.y) {
          posA.y -= overlapY / 2;
          posB.y += overlapY / 2;
        } else {
          posA.y += overlapY / 2;
          posB.y -= overlapY / 2;
        }
      }
    } else if (!collA.isStatic && collB.isStatic) {
      // 只有实体A不是静态的，A弹开
      const overlapX = Math.min(posA.x + collA.width - posB.x, posB.x + collB.width - posA.x);
      const overlapY = Math.min(posA.y + collA.height - posB.y, posB.y + collB.height - posA.y);
      
      if (overlapX < overlapY) {
        // X轴方向弹开
        if (posA.x < posB.x) {
          posA.x -= overlapX;
        } else {
          posA.x += overlapX;
        }
      } else {
        // Y轴方向弹开
        if (posA.y < posB.y) {
          posA.y -= overlapY;
        } else {
          posA.y += overlapY;
        }
      }
    } else if (collA.isStatic && !collB.isStatic) {
      // 只有实体B不是静态的，B弹开
      const overlapX = Math.min(posA.x + collA.width - posB.x, posB.x + collB.width - posA.x);
      const overlapY = Math.min(posA.y + collA.height - posB.y, posB.y + collB.height - posA.y);
      
      if (overlapX < overlapY) {
        // X轴方向弹开
        if (posB.x < posA.x) {
          posB.x -= overlapX;
        } else {
          posB.x += overlapX;
        }
      } else {
        // Y轴方向弹开
        if (posB.y < posA.y) {
          posB.y -= overlapY;
        } else {
          posB.y += overlapY;
        }
      }
    }
    
    // 触发碰撞事件
    // 这里可以实现事件系统，触发碰撞事件
  }
  
  /**
   * 判断两个碰撞组是否需要忽略碰撞
   */
  private shouldIgnoreCollision(groupA: string, groupB: string): boolean {
    // 这里可以实现碰撞组的过滤逻辑
    // 例如：玩家子弹不与玩家碰撞，敌人子弹不与敌人碰撞等
    
    // 使用groupA和groupB变量避免未使用警告
    if (groupA === 'player' && groupB === 'playerBullet') return true;
    if (groupA === 'playerBullet' && groupB === 'player') return true;
    if (groupA === 'enemy' && groupB === 'enemyBullet') return true;
    if (groupA === 'enemyBullet' && groupB === 'enemy') return true;
    
    return false;
  }
}

/**
 * 输入系统 - 处理用户输入
 */
export class InputSystem extends AbstractSystem {
  readonly type: string = 'Input';
  
  constructor(priority: number = 0) {
    super(priority);
  }
  
  init(entityManager: EntityManager): void {
    // 实际使用entityManager变量
    console.log(`初始化输入系统，实体数量: ${entityManager.getEntities().length}`);
    
    // 初始化输入事件监听
    this.setupKeyboardEvents();
    this.setupTouchEvents();
  }
  
  update(_deltaTime: number, entityManager: EntityManager): void {
    // 使用下划线前缀标记有意未使用的变量
    // const inputDeltaTime = deltaTime;
    
    // 获取拥有Input组件的实体
    const entities = this.getEntitiesWithComponents(entityManager, ['Input']);
    
    // 实际使用entities变量
    if (entities.length > 0) {
      // 处理输入实体
      for (const entity of entities) {
        const inputComponent = entity.getComponent<{keys: Record<string, boolean>, touches: Array<{id: number, x: number, y: number}>}>('Input');
        
        // 确保inputComponent变量被使用，避免未使用变量警告
        if (inputComponent) {
          // 处理键盘输入
          if (Object.keys(inputComponent.keys).length > 0) {
            // 获取实体的速度组件（如果有）
            const velocity = entity.getComponent<{vx: number, vy: number}>('Velocity');
            if (velocity) {
              // 根据按键状态更新速度
              // 例如：WASD或方向键控制移动
              if (inputComponent.keys['ArrowUp'] || inputComponent.keys['w'] || inputComponent.keys['W']) {
                velocity.vy = -100; // 向上移动
              } else if (inputComponent.keys['ArrowDown'] || inputComponent.keys['s'] || inputComponent.keys['S']) {
                velocity.vy = 100; // 向下移动
              } else {
                velocity.vy = 0; // 停止垂直移动
              }
              
              if (inputComponent.keys['ArrowLeft'] || inputComponent.keys['a'] || inputComponent.keys['A']) {
                velocity.vx = -100; // 向左移动
              } else if (inputComponent.keys['ArrowRight'] || inputComponent.keys['d'] || inputComponent.keys['D']) {
                velocity.vx = 100; // 向右移动
              } else {
                velocity.vx = 0; // 停止水平移动
              }
            }
          }
          
          // 处理触摸输入
          if (inputComponent.touches.length > 0) {
            // 获取第一个触摸点
            const touch = inputComponent.touches[0];
            // 这里可以根据触摸位置实现相应的逻辑
            // 例如：移动到触摸位置、射击等
            console.log(`处理触摸输入：ID=${touch.id}, 位置=(${touch.x}, ${touch.y})`);
          }
        }
      }
    }
    
    // 这里可以实现输入处理逻辑
    // 例如：根据按键状态更新实体的速度等
  }
  
  destroy(): void {
    // 移除事件监听
    this.removeKeyboardEvents();
    this.removeTouchEvents();
  }
  
  private setupKeyboardEvents(): void {
    // 这里可以实现键盘事件监听
    // 例如：监听keydown和keyup事件，更新Input组件的keys属性
  }
  
  private removeKeyboardEvents(): void {
    // 移除键盘事件监听
  }
  
  private setupTouchEvents(): void {
    // 这里可以实现触摸事件监听
    // 例如：监听touchstart、touchmove和touchend事件，更新Input组件的touches属性
  }
  
  private removeTouchEvents(): void {
    // 移除触摸事件监听
  }
}

/**
 * 生命周期系统 - 管理实体的生命周期
 */
export class LifecycleSystem extends AbstractSystem {
  readonly type: string = 'Lifecycle';
  
  constructor(priority: number = 0) {
    super(priority);
  }
  
  update(_deltaTime: number, entityManager: EntityManager): void {
    // 使用下划线前缀标记有意未使用的变量
    // const timeScale = deltaTime > 0 ? 1 : 1;
    
    // 获取拥有Lifecycle组件的实体
    const entities = this.getEntitiesWithComponents(entityManager, ['Lifecycle']);
    
    // 处理实体的生命周期
    for (const entity of entities) {
      const lifecycle = entity.getComponent<{isActive: boolean, createdAt: number, ttl: number}>('Lifecycle');
      
      if (lifecycle) {
        // 如果实体有生命周期限制且已经到期，则移除实体
        if (lifecycle.ttl > 0) {
          const age = Date.now() - lifecycle.createdAt;
          if (age >= lifecycle.ttl) {
            entityManager.removeEntity(entity.getId());
          }
        }
        
        // 如果实体被标记为非活跃，也移除实体
        if (!lifecycle.isActive) {
          entityManager.removeEntity(entity.getId());
        }
      }
    }
  }
}