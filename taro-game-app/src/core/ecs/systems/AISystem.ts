/**
 * AISystem.ts
 * AI系统 - 控制非玩家角色的行为逻辑
 */
import { AbstractSystem } from '../System';
import { EntityManager } from '../EntityManager';
import { Entity } from '../Entity';
import { CombatStateComponent, TeamComponent } from '../components/CombatComponents';
import { StatsComponent } from '../components/StatsComponent';
import { PositionComponent } from '../Component';
import { AIComponent } from '../components/AIComponent';

/**
 * AI行为类型枚举
 */
export enum AIBehaviorType {
  IDLE = 'idle',           // 待机
  PATROL = 'patrol',       // 巡逻
  CHASE = 'chase',         // 追击
  ATTACK = 'attack',       // 攻击
  FLEE = 'flee',           // 逃跑
  SUPPORT = 'support',     // 支援
  GUARD = 'guard'          // 守卫
}

/**
 * AI系统 - 控制非玩家角色的行为逻辑
 */
export class AISystem extends AbstractSystem {
  readonly type: string = 'AI';
  
  constructor(priority: number = 20) {
    super(priority);
  }
  
  /**
   * 系统初始化
   * @param entityManager 实体管理器
   */
  init(_entityManager: EntityManager): void {
    console.log('AI系统初始化');
  }
  
  /**
   * 系统更新
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  update(deltaTime: number, entityManager: EntityManager): void {
    // 获取所有具有AI组件的实体
    const aiEntities = this.getEntitiesWithComponents(
      entityManager,
      ['AI', 'Position', 'Stats']
    );
    
    // 更新每个AI实体的行为
    for (const entity of aiEntities) {
      this.updateAIBehavior(entity, deltaTime, entityManager);
    }
  }
  
  /**
   * 更新AI实体的行为
   * @param entity AI实体
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private updateAIBehavior(entity: Entity, deltaTime: number, entityManager: EntityManager): void {
    const aiComponent = entity.getComponent<AIComponent>('AI');
    if (!aiComponent) return;
    
    // 更新AI决策计时器
    aiComponent.decisionTimer -= deltaTime;
    
    // 如果决策时间未到，继续当前行为
    if (aiComponent.decisionTimer > 0) {
      this.executeBehavior(entity, aiComponent.currentBehavior, deltaTime, entityManager);
      return;
    }
    
    // 重置决策计时器
    aiComponent.decisionTimer = aiComponent.decisionInterval;
    
    // 根据当前状态和环境做出决策
    const newBehavior = this.makeDecision(entity, entityManager);
    
    // 如果行为发生变化，记录并输出日志
    if (newBehavior !== aiComponent.currentBehavior) {
      console.log(`实体 ${entity.getId()} AI行为从 ${aiComponent.currentBehavior} 变为 ${newBehavior}`);
      aiComponent.currentBehavior = newBehavior;
    }
    
    // 执行决定的行为
    this.executeBehavior(entity, newBehavior, deltaTime, entityManager);
  }
  
  /**
   * 为AI实体做出决策
   * @param entity AI实体
   * @param entityManager 实体管理器
   * @returns 决定的行为类型
   */
  private makeDecision(entity: Entity, entityManager: EntityManager): AIBehaviorType {
    const aiComponent = entity.getComponent<AIComponent>('AI');
    const statsComponent = entity.getComponent<StatsComponent>('Stats');
    const combatState = entity.getComponent<CombatStateComponent>('CombatState');
    const position = entity.getComponent<PositionComponent>('Position');
    
    if (!aiComponent || !statsComponent || !position) {
      return AIBehaviorType.IDLE;
    }
    
    // 检查生命值，如果过低则考虑逃跑
    const healthPercentage = statsComponent.currentHealth / statsComponent.maxHealth * 100;
    if (healthPercentage < aiComponent.fleeHealthPercentage) {
      return AIBehaviorType.FLEE;
    }
    
    // 如果已经在战斗中，继续攻击
    if (combatState && combatState.isInCombat && combatState.currentTarget !== null) {
      return AIBehaviorType.ATTACK;
    }
    
    // 检查周围是否有敌人，如果有则追击
    const nearbyEnemy = this.findNearbyEnemy(entity, entityManager, aiComponent.detectionRange);
    if (nearbyEnemy) {
      return AIBehaviorType.CHASE;
    }
    
    // 如果是守卫类型，返回守卫行为
    if (aiComponent.defaultBehavior === AIBehaviorType.GUARD) {
      return AIBehaviorType.GUARD;
    }
    
    // 默认行为：巡逻或待机
    return aiComponent.defaultBehavior;
  }
  
  /**
   * 执行AI行为
   * @param entity AI实体
   * @param behavior 行为类型
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private executeBehavior(entity: Entity, behavior: AIBehaviorType, deltaTime: number, entityManager: EntityManager): void {
    switch (behavior) {
      case AIBehaviorType.IDLE:
        this.executeIdleBehavior(entity, deltaTime);
        break;
      case AIBehaviorType.PATROL:
        this.executePatrolBehavior(entity, deltaTime, entityManager);
        break;
      case AIBehaviorType.CHASE:
        this.executeChaseBehavior(entity, deltaTime, entityManager);
        break;
      case AIBehaviorType.ATTACK:
        this.executeAttackBehavior(entity, deltaTime, entityManager);
        break;
      case AIBehaviorType.FLEE:
        this.executeFleeingBehavior(entity, deltaTime, entityManager);
        break;
      case AIBehaviorType.SUPPORT:
        this.executeSupportBehavior(entity, deltaTime, entityManager);
        break;
      case AIBehaviorType.GUARD:
        this.executeGuardBehavior(entity, deltaTime, entityManager);
        break;
    }
  }
  
  /**
   * 执行攻击行为
   * @param entity AI实体
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private executeAttackBehavior(entity: Entity, _deltaTime: number, entityManager: EntityManager): void {
    const aiComponent = entity.getComponent<AIComponent>('AI');
    const position = entity.getComponent<PositionComponent>('Position');
    const combatState = entity.getComponent<CombatStateComponent>('CombatState');
    
    if (!aiComponent || !position || !combatState) return;
    
    // 如果没有目标，尝试寻找目标
    if (combatState.currentTarget === null) {
      const nearbyEnemy = this.findNearbyEnemy(entity, entityManager, aiComponent.detectionRange);
      if (nearbyEnemy) {
        combatState.currentTarget = nearbyEnemy.getId();
        combatState.isInCombat = true;
      } else {
        // 如果没有敌人，回到默认行为
        aiComponent.currentBehavior = aiComponent.defaultBehavior;
        return;
      }
    }
    
    // 获取目标实体
    const targetEntity = entityManager.getEntityById(combatState.currentTarget);
    if (!targetEntity) {
      combatState.currentTarget = null;
      return;
    }
    
    // 获取目标位置
    const targetPosition = targetEntity.getComponent<PositionComponent>('Position');
    if (!targetPosition) return;
    
    // 计算到目标的距离
    const distance = Math.sqrt(
      Math.pow(targetPosition.x - position.x, 2) + 
      Math.pow(targetPosition.y - position.y, 2)
    );
    
    // 定义攻击范围
    const attackRange = 2.0; // 默认攻击范围为2个单位
    
    // 如果超出攻击范围，切换到追击行为
    if (distance > attackRange) {
      aiComponent.currentBehavior = AIBehaviorType.CHASE;
      return;
    }
    
    // 在攻击范围内，面向目标
    const directionX = targetPosition.x - position.x;
    const directionY = targetPosition.y - position.y;
    aiComponent.facingDirection = Math.atan2(directionY, directionX) * (180 / Math.PI);
    
    // 攻击逻辑由战斗系统处理，这里只需确保目标设置正确
    // 战斗系统会在其update方法中处理攻击
  }
  
  /**
   * 执行待机行为
   * @param entity AI实体
   * @param deltaTime 时间增量
   */
  private executeIdleBehavior(entity: Entity, deltaTime: number): void {
    // 待机行为：不做任何移动，可能会随机旋转或播放待机动画
    const aiComponent = entity.getComponent<AIComponent>('AI');
    if (!aiComponent) return;
    
    // 随机决定是否改变朝向
    aiComponent.idleTimer -= deltaTime;
    if (aiComponent.idleTimer <= 0) {
      // 重置计时器
      aiComponent.idleTimer = Math.random() * 3 + 2; // 2-5秒
      
      // 随机改变朝向
      aiComponent.facingDirection = Math.random() * 360;
    }
  }
  
  /**
   * 执行巡逻行为
   * @param entity AI实体
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private executePatrolBehavior(entity: Entity, deltaTime: number, _entityManager: EntityManager): void {
    const aiComponent = entity.getComponent<AIComponent>('AI');
    const position = entity.getComponent<PositionComponent>('Position');
    
    if (!aiComponent || !position) return;
    
    // 如果没有巡逻点，创建随机巡逻路径
    if (aiComponent.patrolPoints.length === 0) {
      this.generateRandomPatrolPath(entity, 5); // 生成5个巡逻点
      return;
    }
    
    // 如果当前没有目标巡逻点，设置下一个巡逻点
    if (aiComponent.currentPatrolIndex === -1) {
      aiComponent.currentPatrolIndex = 0;
    }
    
    // 获取当前目标巡逻点
    const targetPoint = aiComponent.patrolPoints[aiComponent.currentPatrolIndex];
    
    // 计算到目标点的距离
    const distance = Math.sqrt(
      Math.pow(targetPoint.x - position.x, 2) + 
      Math.pow(targetPoint.y - position.y, 2)
    );
    
    // 如果已经到达目标点附近，前往下一个巡逻点
    if (distance < 0.5) {
      aiComponent.currentPatrolIndex = (aiComponent.currentPatrolIndex + 1) % aiComponent.patrolPoints.length;
      return;
    }
    
    // 向目标点移动
    const moveSpeed = 1.0 * deltaTime; // 移动速度
    const directionX = (targetPoint.x - position.x) / distance;
    const directionY = (targetPoint.y - position.y) / distance;
    
    position.x += directionX * moveSpeed;
    position.y += directionY * moveSpeed;
    
    // 更新朝向
    aiComponent.facingDirection = Math.atan2(directionY, directionX) * (180 / Math.PI);
  }
  
  /**
   * 执行追击行为
   * @param entity AI实体
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private executeChaseBehavior(entity: Entity, _deltaTime: number, entityManager: EntityManager): void {
    const aiComponent = entity.getComponent<AIComponent>('AI');
    const position = entity.getComponent<PositionComponent>('Position');
    const combatState = entity.getComponent<CombatStateComponent>('CombatState');
    
    if (!aiComponent || !position || !combatState) return;
    
    // 寻找最近的敌人
    const nearbyEnemy = this.findNearbyEnemy(entity, entityManager, aiComponent.detectionRange);
    if (!nearbyEnemy) {
      // 如果没有敌人，回到默认行为
      aiComponent.currentBehavior = aiComponent.defaultBehavior;
      return;
    }
    
    // 设置战斗目标
    combatState.currentTarget = nearbyEnemy.getId();
    combatState.isInCombat = true;
    
    // 获取目标位置
    const targetPosition = nearbyEnemy.getComponent<PositionComponent>('Position');
    if (!targetPosition) return;
    
    // 计算到目标的距离
    const distance = Math.sqrt(
      Math.pow(targetPosition.x - position.x, 2) + 
      Math.pow(targetPosition.y - position.y, 2)
    );
    
    // 定义攻击范围
    const attackRange = 2.0; // 默认攻击范围为2个单位
    
    // 如果距离超出攻击范围，切换到追击行为
    if (distance > attackRange) {
      aiComponent.currentBehavior = AIBehaviorType.CHASE;
      return;
    }
    
    // 在攻击范围内，面向目标
    const directionX = targetPosition.x - position.x;
    const directionY = targetPosition.y - position.y;
    aiComponent.facingDirection = Math.atan2(directionY, directionX) * (180 / Math.PI);
    
    // 攻击冷却已结束，可以攻击
    if (combatState.attackCooldown <= 0) {
      // 攻击逻辑由战斗系统处理，这里只需确保目标设置正确
      // 战斗系统会在其update方法中处理攻击
    }
  }
  
  /**
   * 执行逃跑行为
   * @param entity AI实体
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private executeFleeingBehavior(entity: Entity, deltaTime: number, entityManager: EntityManager): void {
    const aiComponent = entity.getComponent<AIComponent>('AI');
    const position = entity.getComponent<PositionComponent>('Position');
    const combatState = entity.getComponent<CombatStateComponent>('CombatState');
    const statsComponent = entity.getComponent<StatsComponent>('Stats');
    
    if (!aiComponent || !position || !combatState || !statsComponent) return;
    
    // 如果生命值恢复到安全水平，停止逃跑
    const healthPercentage = statsComponent.currentHealth / statsComponent.maxHealth * 100;
    if (healthPercentage > aiComponent.safeHealthPercentage) {
      aiComponent.currentBehavior = aiComponent.defaultBehavior;
      return;
    }
    
    // 寻找最近的敌人，以便逃离
    const nearbyEnemy = this.findNearbyEnemy(entity, entityManager, aiComponent.detectionRange * 1.5);
    if (!nearbyEnemy) {
      // 如果没有敌人，回到默认行为
      aiComponent.currentBehavior = aiComponent.defaultBehavior;
      return;
    }
    
    // 获取敌人位置
    const enemyPosition = nearbyEnemy.getComponent<PositionComponent>('Position');
    if (!enemyPosition) return;
    
    // 计算逃跑方向（远离敌人）
    const directionX = position.x - enemyPosition.x;
    const directionY = position.y - enemyPosition.y;
    const distance = Math.sqrt(directionX * directionX + directionY * directionY);
    
    // 如果已经足够远，停止逃跑
    if (distance > aiComponent.detectionRange * 2) {
      aiComponent.currentBehavior = aiComponent.defaultBehavior;
      return;
    }
    
    // 向远离敌人的方向移动
    const moveSpeed = 2.5 * deltaTime; // 逃跑速度比追击还快
    const normalizedDirX = directionX / distance;
    const normalizedDirY = directionY / distance;
    
    position.x += normalizedDirX * moveSpeed;
    position.y += normalizedDirY * moveSpeed;
    
    // 更新朝向（面向逃跑方向）
    aiComponent.facingDirection = Math.atan2(normalizedDirY, normalizedDirX) * (180 / Math.PI);
  }
  
  /**
   * 执行支援行为
   * @param entity AI实体
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private executeSupportBehavior(entity: Entity, deltaTime: number, entityManager: EntityManager): void {
    const aiComponent = entity.getComponent<AIComponent>('AI');
    const position = entity.getComponent<PositionComponent>('Position');
    const team = entity.getComponent<TeamComponent>('Team');
    
    if (!aiComponent || !position || !team) return;
    
    // 寻找需要支援的友方单位（生命值低的队友）
    let allyToSupport: Entity | null = null;
    let lowestHealthPercentage = 50; // 只支援生命值低于50%的队友
    
    const entities = entityManager.getEntities();
    for (const potentialAlly of entities) {
      // 跳过自己
      if (potentialAlly.getId() === entity.getId()) continue;
      
      const allyTeam = potentialAlly.getComponent<TeamComponent>('Team');
      const allyStats = potentialAlly.getComponent<StatsComponent>('Stats');
      const allyPosition = potentialAlly.getComponent<PositionComponent>('Position');
      
      if (allyTeam && allyStats && allyPosition && allyTeam.teamId === team.teamId) {
        const healthPercentage = allyStats.currentHealth / allyStats.maxHealth * 100;
        
        // 检查是否是生命值最低的队友
        if (healthPercentage < lowestHealthPercentage) {
          // 计算距离
          const distance = Math.sqrt(
            Math.pow(allyPosition.x - position.x, 2) + 
            Math.pow(allyPosition.y - position.y, 2)
          );
          
          // 只考虑一定范围内的队友
          if (distance < aiComponent.supportRange) {
            allyToSupport = potentialAlly;
            lowestHealthPercentage = healthPercentage;
          }
        }
      }
    }
    
    // 如果没有需要支援的队友，回到默认行为
    if (!allyToSupport) {
      aiComponent.currentBehavior = aiComponent.defaultBehavior;
      return;
    }
    
    // 获取队友位置
    const allyPosition = allyToSupport.getComponent<PositionComponent>('Position');
    if (!allyPosition) return;
    
    // 计算到队友的距离
    const distance = Math.sqrt(
      Math.pow(allyPosition.x - position.x, 2) + 
      Math.pow(allyPosition.y - position.y, 2)
    );
    
    // 如果距离足够近，提供支援（例如治疗）
    if (distance < 1.0) {
      // 在这里可以实现治疗或增益效果
      console.log(`实体 ${entity.getId()} 正在支援实体 ${allyToSupport.getId()}`);
      
      // 支援逻辑可以调用战斗系统的相关方法
      // 例如使用治疗技能
    } else {
      // 向队友移动
      const moveSpeed = 1.5 * deltaTime;
      const directionX = (allyPosition.x - position.x) / distance;
      const directionY = (allyPosition.y - position.y) / distance;
      
      position.x += directionX * moveSpeed;
      position.y += directionY * moveSpeed;
      
      // 更新朝向
      aiComponent.facingDirection = Math.atan2(directionY, directionX) * (180 / Math.PI);
    }
  }
  
  /**
   * 执行守卫行为
   * @param entity AI实体
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  private executeGuardBehavior(entity: Entity, deltaTime: number, entityManager: EntityManager): void {
    const aiComponent = entity.getComponent<AIComponent>('AI');
    const position = entity.getComponent<PositionComponent>('Position');
    
    if (!aiComponent || !position) return;
    
    // 如果没有守卫点，使用当前位置作为守卫点
    if (!aiComponent.guardPosition) {
      aiComponent.guardPosition = { x: position.x, y: position.y };
    }
    
    // 检查是否有敌人接近
    const nearbyEnemy = this.findNearbyEnemy(entity, entityManager, aiComponent.detectionRange);
    if (nearbyEnemy) {
      // 如果有敌人接近，切换到追击行为
      aiComponent.currentBehavior = AIBehaviorType.CHASE;
      return;
    }
    
    // 计算到守卫点的距离
    const distance = Math.sqrt(
      Math.pow(aiComponent.guardPosition.x - position.x, 2) + 
      Math.pow(aiComponent.guardPosition.y - position.y, 2)
    );
    
    // 如果离守卫点太远，返回守卫点
    if (distance > 2.0) {
      // 向守卫点移动
      const moveSpeed = 1.0 * deltaTime;
      const directionX = (aiComponent.guardPosition.x - position.x) / distance;
      const directionY = (aiComponent.guardPosition.y - position.y) / distance;
      
      position.x += directionX * moveSpeed;
      position.y += directionY * moveSpeed;
      
      // 更新朝向
      aiComponent.facingDirection = Math.atan2(directionY, directionX) * (180 / Math.PI);
    } else {
      // 在守卫点附近，随机旋转以模拟警戒
      aiComponent.idleTimer -= deltaTime;
      if (aiComponent.idleTimer <= 0) {
        aiComponent.idleTimer = Math.random() * 2 + 1; // 1-3秒
        aiComponent.facingDirection = Math.random() * 360;
      }
    }
  }
  
  /**
   * 寻找附近的敌人
   * @param entity 实体
   * @param entityManager 实体管理器
   * @param range 检测范围
   * @returns 最近的敌人实体或null
   */
  private findNearbyEnemy(entity: Entity, entityManager: EntityManager, range: number): Entity | null {
    const position = entity.getComponent<PositionComponent>('Position');
    const team = entity.getComponent<TeamComponent>('Team');
    
    if (!position || !team) return null;
    
    let closestEnemy: Entity | null = null;
    let closestDistance = range;
    
    const entities = entityManager.getEntities();
    for (const potentialEnemy of entities) {
      // 跳过自己
      if (potentialEnemy.getId() === entity.getId()) continue;
      
      const enemyTeam = potentialEnemy.getComponent<TeamComponent>('Team');
      const enemyCombatState = potentialEnemy.getComponent<CombatStateComponent>('CombatState');
      const enemyPosition = potentialEnemy.getComponent<PositionComponent>('Position');
      
      if (enemyTeam && enemyCombatState && enemyPosition && 
          enemyTeam.teamId !== team.teamId && 
          enemyCombatState.isAlive) {
        
        const distance = Math.sqrt(
          Math.pow(enemyPosition.x - position.x, 2) + 
          Math.pow(enemyPosition.y - position.y, 2)
        );
        
        if (distance < closestDistance) {
          closestEnemy = potentialEnemy;
          closestDistance = distance;
        }
      }
    }
    
    return closestEnemy;
  }
  
  /**
   * 生成随机巡逻路径
   * @param entity 实体
   * @param pointCount 巡逻点数量
   */
  private generateRandomPatrolPath(entity: Entity, pointCount: number): void {
    const aiComponent = entity.getComponent<AIComponent>('AI');
    const position = entity.getComponent<PositionComponent>('Position');
    
    if (!aiComponent || !position) return;
    
    // 清空现有巡逻点
    aiComponent.patrolPoints = [];
    
    // 以当前位置为中心，生成随机巡逻点
    const patrolRadius = aiComponent.patrolRadius || 5;
    
    for (let i = 0; i < pointCount; i++) {
      // 生成随机角度和距离
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * patrolRadius;
      
      // 计算巡逻点坐标
      const x = position.x + Math.cos(angle) * distance;
      const y = position.y + Math.sin(angle) * distance;
      
      // 添加巡逻点
      aiComponent.patrolPoints.push({ x, y });
    }
    
    // 重置当前巡逻点索引
    aiComponent.currentPatrolIndex = 0;
  }
}