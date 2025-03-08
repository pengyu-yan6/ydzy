/**
 * GameStateSynchronizer.ts
 * 实现游戏状态同步器，负责在多端之间同步游戏状态
 */
import { AbstractSystem } from '../System';
import { EntityManager } from '../EntityManager';
import Taro from '@tarojs/taro';

// 游戏状态接口
export interface GameState {
  timestamp: number;         // 状态时间戳
  entities: GameEntityState[]; // 实体状态列表
  globalState: any;          // 全局游戏状态
  turnNumber: number;        // 当前回合数
  activePlayerId: string;    // 当前活动玩家ID
  phase: GamePhase;          // 当前游戏阶段
  seed: number;              // 随机种子
}

// 游戏实体状态接口
export interface GameEntityState {
  entityId: number;          // 实体ID
  components: Record<string, any>; // 组件状态
  position?: { x: number, y: number }; // 位置信息
  health?: number;           // 生命值
  mana?: number;             // 法力值
  buffs?: any[];             // 增益效果
  debuffs?: any[];           // 减益效果
}

// 游戏阶段枚举
export enum GamePhase {
  PREPARATION = 'preparation', // 准备阶段
  COMBAT = 'combat',          // 战斗阶段
  SHOPPING = 'shopping',      // 购物阶段
  RESULT = 'result'           // 结算阶段
}

/**
 * 游戏状态同步器 - 负责在多端之间同步游戏状态
 */
export class GameStateSynchronizer extends AbstractSystem {
  readonly type: string = 'GameStateSynchronizer';
  private lastSyncTime: number = 0;
  private syncInterval: number = 1000; // 同步间隔（毫秒）
  private gameState: GameState;
  private isHost: boolean = false;
  private roomId: string = '';
  private players: string[] = [];
  
  constructor(priority: number = 50, isHost: boolean = false, roomId: string = '') {
    super(priority);
    this.isHost = isHost;
    this.roomId = roomId;
    this.gameState = this.createInitialGameState();
  }
  
  /**
   * 创建初始游戏状态
   */
  private createInitialGameState(): GameState {
    return {
      timestamp: Date.now(),
      entities: [],
      globalState: {},
      turnNumber: 1,
      activePlayerId: '',
      phase: GamePhase.PREPARATION,
      seed: Math.floor(Math.random() * 1000000)
    };
  }
  
  /**
   * 设置房间ID
   * @param roomId 房间ID
   */
  setRoomId(roomId: string): void {
    this.roomId = roomId;
  }
  
  /**
   * 设置是否为主机
   * @param isHost 是否为主机
   */
  setIsHost(isHost: boolean): void {
    this.isHost = isHost;
  }
  
  /**
   * 添加玩家
   * @param playerId 玩家ID
   */
  addPlayer(playerId: string): void {
    if (!this.players.includes(playerId)) {
      this.players.push(playerId);
    }
  }
  
  /**
   * 移除玩家
   * @param playerId 玩家ID
   */
  removePlayer(playerId: string): void {
    const index = this.players.indexOf(playerId);
    if (index !== -1) {
      this.players.splice(index, 1);
    }
  }
  
  /**
   * 系统更新方法
   * @param deltaTime 时间增量
   * @param entityManager 实体管理器
   */
  update(deltaTime: number, entityManager: EntityManager): void {
    const currentTime = Date.now();
    
    // 检查是否需要同步
    if (currentTime - this.lastSyncTime >= this.syncInterval) {
      if (this.isHost) {
        // 主机负责生成游戏状态并发送
        this.generateGameState(entityManager);
        this.broadcastGameState();
      } else {
        // 客户端负责接收游戏状态
        this.requestGameState();
      }
      
      this.lastSyncTime = currentTime;
    }
  }
  
  /**
   * 生成当前游戏状态
   * @param entityManager 实体管理器
   */
  private generateGameState(entityManager: EntityManager): void {
    const entities = entityManager.getEntities();
    const entityStates: GameEntityState[] = [];
    
    // 收集所有实体的状态
    for (const entity of entities) {
      const entityState: GameEntityState = {
        entityId: entity.getId(),
        components: {}
      };
      
      // 收集实体的组件状态
      const componentTypes = entity.getComponentTypes();
      for (const componentType of componentTypes) {
        const component = entity.getComponent(componentType);
        if (component) {
          entityState.components[componentType] = this.serializeComponent(component);
        }
      }
      
      entityStates.push(entityState);
    }
    
    // 更新游戏状态
    this.gameState = {
      ...this.gameState,
      timestamp: Date.now(),
      entities: entityStates
    };
  }
  
  /**
   * 序列化组件数据
   * @param component 组件实例
   */
  private serializeComponent(component: any): any {
    // 简单深拷贝，实际项目中可能需要更复杂的序列化逻辑
    return JSON.parse(JSON.stringify(component));
  }
  
  /**
   * 广播游戏状态到所有客户端
   */
  private broadcastGameState(): void {
    if (!this.roomId) return;
    
    // 使用Taro的云函数或WebSocket发送游戏状态
    // 这里仅为示例，实际实现取决于项目的网络架构
    console.log('Broadcasting game state:', this.gameState);
    
    // 示例：使用Taro.cloud调用云函数
    try {
      // @ts-ignore - 云开发环境下Taro.cloud会被注入
      Taro.cloud.callFunction({
        name: 'syncGameState',
        data: {
          roomId: this.roomId,
          gameState: this.gameState
        }
      });
    } catch (error) {
      console.error('Failed to broadcast game state:', error);
    }
  }
  
  /**
   * 请求最新的游戏状态
   */
  private requestGameState(): void {
    if (!this.roomId) return;
    
    // 使用Taro的云函数或WebSocket请求游戏状态
    // 这里仅为示例，实际实现取决于项目的网络架构
    console.log('Requesting game state for room:', this.roomId);
    
    // 示例：使用Taro.cloud调用云函数
    try {
      // @ts-ignore - 云开发环境下Taro.cloud会被注入
      Taro.cloud.callFunction({
        name: 'getGameState',
        data: {
          roomId: this.roomId
        },
        success: (res) => {
          if (res.result && res.result.gameState) {
            this.applyGameState(res.result.gameState);
          }
        },
        fail: (error) => {
          console.error('Failed to request game state:', error);
        }
      });
    } catch (error) {
      console.error('Failed to request game state:', error);
    }
  }
  
  /**
   * 应用接收到的游戏状态
   * @param newState 新的游戏状态
   */
  applyGameState(newState: GameState): void {
    // 检查状态时间戳，确保只应用最新的状态
    if (newState.timestamp <= this.gameState.timestamp) {
      console.log('Received outdated game state, ignoring');
      return;
    }
    
    console.log('Applying new game state:', newState);
    this.gameState = newState;
    
    // 触发游戏状态更新事件
    this.onGameStateUpdated();
  }
  
  /**
   * 游戏状态更新事件处理
   */
  private onGameStateUpdated(): void {
    // 通知其他系统游戏状态已更新
    // 这里可以实现观察者模式或事件系统
    console.log('Game state updated');
    
    // 示例：发送自定义事件
    const event = new CustomEvent('gameStateUpdated', { detail: this.gameState });
    document.dispatchEvent(event);
  }
  
  /**
   * 获取当前游戏状态
   */
  getGameState(): GameState {
    return this.gameState;
  }
  
  /**
   * 设置同步间隔
   * @param interval 同步间隔（毫秒）
   */
  setSyncInterval(interval: number): void {
    this.syncInterval = interval;
  }
  
  /**
   * 设置游戏阶段
   * @param phase 游戏阶段
   */
  setGamePhase(phase: GamePhase): void {
    this.gameState.phase = phase;
    
    // 如果是主机，立即同步状态
    if (this.isHost) {
      this.broadcastGameState();
    }
  }
  
  /**
   * 设置当前活动玩家
   * @param playerId 玩家ID
   */
  setActivePlayer(playerId: string): void {
    this.gameState.activePlayerId = playerId;
    
    // 如果是主机，立即同步状态
    if (this.isHost) {
      this.broadcastGameState();
    }
  }
  
  /**
   * 增加回合数
   */
  incrementTurn(): void {
    this.gameState.turnNumber++;
    
    // 如果是主机，立即同步状态
    if (this.isHost) {
      this.broadcastGameState();
    }
  }
  
  /**
   * 更新全局游戏状态
   * @param key 状态键
   * @param value 状态值
   */
  updateGlobalState(key: string, value: any): void {
    this.gameState.globalState[key] = value;
    
    // 如果是主机，立即同步状态
    if (this.isHost) {
      this.broadcastGameState();
    }
  }
}