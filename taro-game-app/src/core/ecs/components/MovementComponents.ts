/**
 * MovementComponents.ts
 * 定义与角色移动相关的组件
 */
import { Component } from '../Component';
import { CharacterClass, CharacterRace } from '../../../models/CharacterStats';

/**
 * 网格位置组件 - 用于棋盘游戏中的网格位置
 */
export class GridPositionComponent implements Component {
  readonly type: string = 'GridPosition';
  
  constructor(
    public gridX: number = 0, // 网格X坐标
    public gridY: number = 0, // 网格Y坐标
    public targetGridX: number | null = null, // 目标网格X坐标
    public targetGridY: number | null = null  // 目标网格Y坐标
  ) {}
}

/**
 * 移动组件 - 用于处理棋盘上的移动逻辑
 */
export class MovementComponent implements Component {
  readonly type: string = 'Movement';
  
  constructor(
    public moveSpeed: number = 1, // 移动速度（每秒移动的格子数）
    public isMoving: boolean = false, // 是否正在移动
    public movePath: {x: number, y: number}[] = [], // 移动路径
    public moveProgress: number = 0, // 当前移动进度（0-1之间）
    public moveStartTime: number = 0 // 开始移动的时间戳
  ) {}
}

/**
 * 角色属性组件 - 存储角色的基本属性和战斗属性
 */
export class CharacterStatsComponent implements Component {
  readonly type: string = 'CharacterStats';
  
  public id: string;
  public name: string;
  public level: number;
  public star: number;
  public characterClass: CharacterClass; // 改名，避免使用保留字
  public race: CharacterRace;
  public health: number;
  public maxHealth: number;
  public attack: number;
  public defense: number;
  public magicPower: number;
  public magicResist: number;
  public critChance: number;
  public critDamage: number;
  public attackSpeed: number;
  public moveSpeed: number;
  public range: number;
  public mana: number;
  public maxMana: number;
  public manaRegen: number;
  public items: string[];
  public buffs: Array<{id: string, duration: number, effect: any}>;
  
  constructor(
    id: string = '', // 角色ID
    name: string = '', // 角色名称
    level: number = 1, // 等级
    star: number = 1, // 星级
    characterClass: CharacterClass = CharacterClass.WARRIOR, // 职业
    race: CharacterRace = CharacterRace.HUMAN, // 种族
    health: number = 100, // 当前生命值
    maxHealth: number = 100, // 最大生命值
    attack: number = 10, // 攻击力
    defense: number = 5, // 防御力
    magicPower: number = 0, // 法术强度
    magicResist: number = 0, // 魔法抗性
    critChance: number = 0.05, // 暴击几率
    critDamage: number = 1.5, // 暴击伤害
    attackSpeed: number = 1.0, // 攻击速度
    moveSpeed: number = 1.0, // 移动速度
    range: number = 1, // 攻击范围
    mana: number = 0, // 当前法力值
    maxMana: number = 100, // 最大法力值
    manaRegen: number = 10, // 法力回复
    items: string[] = [], // 装备物品ID列表
    buffs: Array<{id: string, duration: number, effect: any}> = [] // 增益/减益效果
  ) {
    this.id = id;
    this.name = name;
    this.level = level;
    this.star = star;
    this.characterClass = characterClass;
    this.race = race;
    this.health = health;
    this.maxHealth = maxHealth;
    this.attack = attack;
    this.defense = defense;
    this.magicPower = magicPower;
    this.magicResist = magicResist;
    this.critChance = critChance;
    this.critDamage = critDamage;
    this.attackSpeed = attackSpeed;
    this.moveSpeed = moveSpeed;
    this.range = range;
    this.mana = mana;
    this.maxMana = maxMana;
    this.manaRegen = manaRegen;
    this.items = items;
    this.buffs = buffs;
  }
}

/**
 * 战斗状态组件 - 用于处理战斗中的状态
 */
export class CombatStateComponent implements Component {
  readonly type: string = 'CombatState';
  
  constructor(
    public isInCombat: boolean = false, // 是否在战斗中
    public targetId: number | null = null, // 当前目标ID
    public attackCooldown: number = 0, // 攻击冷却时间
    public lastAttackTime: number = 0, // 上次攻击时间
    public skillCooldowns: Record<string, number> = {}, // 技能冷却状态
    public state: 'idle' | 'moving' | 'attacking' | 'casting' | 'stunned' = 'idle' // 当前战斗状态
  ) {}
}

/**
 * 队伍组件 - 用于标识角色所属队伍
 */
export class TeamComponent implements Component {
  readonly type: string = 'Team';
  
  constructor(
    public teamId: number = 0, // 队伍ID
    public isPlayer: boolean = false // 是否是玩家控制的角色
  ) {}
}

/**
 * 羁绊组件 - 用于处理角色羁绊效果
 */
export class SynergyComponent implements Component {
  readonly type: string = 'Synergy';
  
  constructor(
    public activeClassSynergies: Record<CharacterClass, number> = {} as Record<CharacterClass, number>, // 激活的职业羁绊
    public activeRaceSynergies: Record<CharacterRace, number> = {} as Record<CharacterRace, number>, // 激活的种族羁绊
    public appliedBonuses: boolean = false // 是否已应用羁绊加成
  ) {}
}