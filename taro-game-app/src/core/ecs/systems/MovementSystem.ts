/**
 * MovementSystem.ts
 * 实现基于网格的移动系统，处理角色在棋盘上的移动逻辑
 */
import { AbstractSystem } from '../System';
import { Entity } from '../Entity';
import { EntityManager } from '../EntityManager';
import { GridPositionComponent, MovementComponent } from '../components/MovementComponents';

/**
 * 网格移动系统 - 处理棋盘上角色的移动
 */
export class GridMovementSystem extends AbstractSystem {
  readonly type: string = 'GridMovement';
  
  constructor(priority: number = 10) {
    super(priority);
  }
  
  update(deltaTime: number, entityManager: EntityManager): void {
    // 获取同时拥有GridPosition和Movement组件的实体
    const entities = this.getEntitiesWithComponents(entityManager, ['GridPosition', 'Movement']);
    
    // 更新每个实体的位置
    for (const entity of entities) {
      this.updateEntityMovement(entity, deltaTime);
    }
  }
  
  /**
   * 更新实体的移动
   * @param entity 实体
   * @param deltaTime 时间增量
   */
  private updateEntityMovement(entity: Entity, deltaTime: number): void {
    const gridPosition = entity.getComponent<GridPositionComponent>('GridPosition');
    const movement = entity.getComponent<MovementComponent>('Movement');
    
    if (!gridPosition || !movement) return;
    
    // 如果实体正在移动
    if (movement.isMoving) {
      // 使用deltaTime更新移动进度
      movement.moveProgress += movement.moveSpeed * deltaTime;
      movement.moveProgress = Math.min(movement.moveProgress, 1);
      
      // 如果移动完成
      if (movement.moveProgress >= 1) {
        // 完成当前移动
        this.completeCurrentMove(gridPosition, movement);
      }
    }
  }
  
  /**
   * 完成当前移动
   * @param gridPosition 网格位置组件
   * @param movement 移动组件
   */
  private completeCurrentMove(gridPosition: GridPositionComponent, movement: MovementComponent): void {
    // 更新当前位置为目标位置
    if (gridPosition.targetGridX !== null && gridPosition.targetGridY !== null) {
      gridPosition.gridX = gridPosition.targetGridX;
      gridPosition.gridY = gridPosition.targetGridY;
      gridPosition.targetGridX = null;
      gridPosition.targetGridY = null;
    }
    
    // 重置移动状态
    movement.isMoving = false;
    movement.moveProgress = 0;
  }
  
  /**
   * 开始下一段移动
   * @param gridPosition 网格位置组件
   * @param movement 移动组件
   */
  private startNextMove(gridPosition: GridPositionComponent, movement: MovementComponent): void {
    if (movement.movePath.length === 0) return;
    
    // 获取下一个路径点
    const nextPoint = movement.movePath.shift();
    if (!nextPoint) return;
    
    // 设置目标位置
    gridPosition.targetGridX = nextPoint.x;
    gridPosition.targetGridY = nextPoint.y;
    
    // 开始移动
    movement.isMoving = true;
    movement.moveStartTime = Date.now();
    movement.moveProgress = 0;
  }
  
  /**
   * 设置实体的移动路径
   * @param entity 实体
   * @param path 路径点数组
   */
  public setMovePath(entity: Entity, path: {x: number, y: number}[]): void {
    const movement = entity.getComponent<MovementComponent>('Movement');
    if (!movement) return;
    
    // 设置新路径
    movement.movePath = [...path];
    
    // 如果实体当前没有在移动，则开始移动
    if (!movement.isMoving) {
      const gridPosition = entity.getComponent<GridPositionComponent>('GridPosition');
      if (gridPosition && movement.movePath.length > 0) {
        this.startNextMove(gridPosition, movement);
      }
    }
  }
  
  /**
   * 停止实体的移动
   * @param entity 实体
   */
  public stopMovement(entity: Entity): void {
    const movement = entity.getComponent<MovementComponent>('Movement');
    if (!movement) return;
    
    // 清空路径
    movement.movePath = [];
    
    // 如果实体正在移动，完成当前移动
    if (movement.isMoving) {
      const gridPosition = entity.getComponent<GridPositionComponent>('GridPosition');
      if (gridPosition) {
        this.completeCurrentMove(gridPosition, movement);
      }
    }
  }
  
  /**
   * 计算两点间的曼哈顿距离
   * @param x1 起点X坐标
   * @param y1 起点Y坐标
   * @param x2 终点X坐标
   * @param y2 终点Y坐标
   */
  private calculateManhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x2 - x1) + Math.abs(y2 - y1);
  }
  
  /**
   * 简单的A*寻路算法
   * @param startX 起点X坐标
   * @param startY 起点Y坐标
   * @param endX 终点X坐标
   * @param endY 终点Y坐标
   * @param grid 网格数据，0表示可通行，1表示障碍物
   */
  public findPath(startX: number, startY: number, endX: number, endY: number, grid: number[][]): {x: number, y: number}[] {
    // 简化版A*算法实现
    // 在实际项目中，可能需要更复杂的寻路算法
    
    // 检查起点和终点是否有效
    if (startX < 0 || startY < 0 || endX < 0 || endY < 0 ||
        startX >= grid[0].length || startY >= grid.length ||
        endX >= grid[0].length || endY >= grid.length) {
      return [];
    }
    
    // 检查终点是否可达
    if (grid[endY][endX] === 1) {
      return [];
    }
    
    // 如果起点和终点相同，直接返回
    if (startX === endX && startY === endY) {
      return [];
    }
    
    // 定义方向：上、右、下、左
    const directions = [
      {x: 0, y: -1},
      {x: 1, y: 0},
      {x: 0, y: 1},
      {x: -1, y: 0}
    ];
    
    // 创建开放列表和关闭列表
    const openList: {x: number, y: number, g: number, h: number, f: number, parent: {x: number, y: number} | null}[] = [];
    const closedList: {[key: string]: boolean} = {};
    
    // 将起点加入开放列表
    openList.push({
      x: startX,
      y: startY,
      g: 0,
      h: this.calculateManhattanDistance(startX, startY, endX, endY),
      f: this.calculateManhattanDistance(startX, startY, endX, endY),
      parent: null
    });
    
    // 寻路主循环
    while (openList.length > 0) {
      // 找到F值最小的节点
      let currentIndex = 0;
      for (let i = 1; i < openList.length; i++) {
        if (openList[i].f < openList[currentIndex].f) {
          currentIndex = i;
        }
      }
      
      const current = openList[currentIndex];
      
      // 如果到达终点，构建路径并返回
      if (current.x === endX && current.y === endY) {
        const path: {x: number, y: number}[] = [];
        let temp: typeof current | null = current;
        
        while (temp && temp.parent) {
          path.unshift({x: temp.x, y: temp.y});
          const parentX = temp.parent.x;
          const parentY = temp.parent.y;
          temp = openList.find(node => node.x === parentX && node.y === parentY) || null;
        }
        
        return path;
      }
      
      // 将当前节点从开放列表移除，加入关闭列表
      openList.splice(currentIndex, 1);
      closedList[`${current.x},${current.y}`] = true;
      
      // 检查相邻节点
      for (const direction of directions) {
        const neighborX = current.x + direction.x;
        const neighborY = current.y + direction.y;
        
        // 检查边界
        if (neighborX < 0 || neighborY < 0 || neighborX >= grid[0].length || neighborY >= grid.length) {
          continue;
        }
        
        // 检查是否是障碍物
        if (grid[neighborY][neighborX] === 1) {
          continue;
        }
        
        // 检查是否在关闭列表中
        if (closedList[`${neighborX},${neighborY}`]) {
          continue;
        }
        
        // 计算G、H、F值
        const g = current.g + 1;
        const h = this.calculateManhattanDistance(neighborX, neighborY, endX, endY);
        const f = g + h;
        
        // 检查是否已在开放列表中
        const existingNode = openList.find(node => node.x === neighborX && node.y === neighborY);
        
        if (existingNode) {
          // 如果新路径更好，更新节点
          if (g < existingNode.g) {
            existingNode.g = g;
            existingNode.f = f;
            existingNode.parent = {x: current.x, y: current.y};
          }
        } else {
          // 将新节点加入开放列表
          openList.push({
            x: neighborX,
            y: neighborY,
            g,
            h,
            f,
            parent: {x: current.x, y: current.y}
          });
        }
      }
    }
    
    // 如果无法找到路径，返回空数组
    return [];
  }
}