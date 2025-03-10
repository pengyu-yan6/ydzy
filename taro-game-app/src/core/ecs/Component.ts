/**
 * Component接口 - ECS架构中的组件基础接口
 * 组件包含数据但不包含行为
 */
export interface Component {
  // 组件类型标识，用于区分不同类型的组件
  readonly type: string;
}

/**
 * 位置组件 - 用于表示实体在游戏世界中的位置
 */
export class PositionComponent implements Component {
  readonly type: string = 'Position';
  
  constructor(
    public x: number = 0,
    public y: number = 0
  ) {}
}

/**
 * 速度组件 - 用于表示实体的移动速度
 */
export class VelocityComponent implements Component {
  readonly type: string = 'Velocity';
  
  constructor(
    public vx: number = 0,
    public vy: number = 0
  ) {}
}

/**
 * 渲染组件 - 用于表示实体的渲染属性
 */
export class RenderComponent implements Component {
  readonly type: string = 'Render';
  
  constructor(
    public width: number = 0,
    public height: number = 0,
    public color: string = '#000000',
    public sprite?: string // 精灵图片路径
  ) {}
}

/**
 * 碰撞组件 - 用于处理实体的碰撞检测
 */
export class CollisionComponent implements Component {
  readonly type: string = 'Collision';
  
  constructor(
    public width: number = 0,
    public height: number = 0,
    public isStatic: boolean = false, // 是否是静态物体（不会移动）
    public collisionGroup: string = 'default' // 碰撞组，用于过滤碰撞检测
  ) {}
}

/**
 * 输入组件 - 用于处理玩家输入
 */
export class InputComponent implements Component {
  readonly type: string = 'Input';
  
  // 当前按键状态
  public keys: Record<string, boolean> = {};
  // 当前触摸状态
  public touches: Array<{id: number, x: number, y: number}> = [];
  
  constructor() {}
}

/**
 * 生命周期组件 - 用于管理实体的生命周期
 */
export class LifecycleComponent implements Component {
  readonly type: string = 'Lifecycle';
  
  constructor(
    public isActive: boolean = true,
    public createdAt: number = Date.now(),
    public ttl: number = -1 // 生命周期，-1表示永久存在
  ) {}
}

/**
 * 动画组件 - 用于管理实体的动画
 */
export class AnimationComponent implements Component {
  readonly type: string = 'Animation';
  
  constructor(
    public frames: string[] = [], // 动画帧图片路径数组
    public currentFrame: number = 0,
    public frameRate: number = 10, // 每秒播放的帧数
    public lastFrameTime: number = 0,
    public loop: boolean = true,
    public isPlaying: boolean = true
  ) {}
}

/**
 * 得分组件 - 用于管理游戏得分
 */
export class ScoreComponent implements Component {
  readonly type: string = 'Score';
  
  constructor(
    public score: number = 0,
    public highScore: number = 0
  ) {}
}

/**
 * AI组件 - 用于管理NPC的AI行为
 */
export class AIComponent implements Component {
  readonly type: string = 'AI';
  
  constructor(
    public behavior: string = 'idle', // AI行为类型
    public targetId?: number, // 目标实体ID
    public params: Record<string, any> = {} // 行为参数
  ) {}
}