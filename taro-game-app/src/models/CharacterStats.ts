/**
 * CharacterStats.ts - 角色属性表
 * 定义游戏中角色的基本属性、技能和羁绊效果
 */

// 角色职业枚举
export enum CharacterClass {
  WARRIOR = 'warrior',   // 战士
  MAGE = 'mage',         // 法师
  ASSASSIN = 'assassin', // 刺客
  TANK = 'tank',         // 坦克
  SUPPORT = 'support'    // 辅助
}

// 角色种族枚举
export enum CharacterRace {
  HUMAN = 'human',       // 人类
  MACHINE = 'machine',   // 机械
  ELF = 'elf',           // 精灵
  BEAST = 'beast',       // 兽人
  UNDEAD = 'undead'      // 亡灵
}

// 技能类型枚举
export enum SkillType {
  ACTIVE = 'active',     // 主动技能
  PASSIVE = 'passive',   // 被动技能
  ULTIMATE = 'ultimate'  // 终极技能
}

// 技能目标类型
export enum TargetType {
  SINGLE = 'single',     // 单体目标
  AREA = 'area',         // 区域目标
  SELF = 'self',         // 自身
  ALLIES = 'allies',     // 友方
  ALL = 'all'            // 所有单位
}

// 技能效果类型
export enum EffectType {
  DAMAGE = 'damage',           // 伤害
  HEAL = 'heal',               // 治疗
  BUFF = 'buff',               // 增益
  DEBUFF = 'debuff',           // 减益
  SUMMON = 'summon',           // 召唤
  CONTROL = 'control',         // 控制
  TRANSFORM = 'transform'      // 变形
}

// 技能接口
export interface Skill {
  id: string;              // 技能ID
  name: string;            // 技能名称
  description: string;     // 技能描述
  type: SkillType;         // 技能类型
  cooldown: number;        // 冷却时间(回合)
  targetType: TargetType;  // 目标类型
  effectType: EffectType;  // 效果类型
  effectValue: number;     // 效果数值
  range: number;           // 技能范围
  energyCost: number;      // 能量消耗
  baseValue: number;       // 基础效果值
  scalingFactor: number;   // 属性加成系数
  duration: number;        // 效果持续时间
}

// 羁绊效果接口
export interface SynergyEffect {
  id: string;                // 羁绊ID
  name: string;              // 羁绊名称
  description: string;       // 羁绊描述
  type: CharacterClass | CharacterRace; // 羁绊类型(职业或种族)
  requiredCount: number[];   // 激活所需角色数量[2, 4, 6]
  effects: {
    level: number;           // 羁绊等级
    description: string;     // 效果描述
    statBonus: Partial<CharacterBaseStats>; // 属性加成
  }[];
}

// 角色基础属性接口
export interface CharacterBaseStats {
  health: number;          // 生命值
  attack: number;          // 攻击力
  defense: number;         // 防御力
  magicPower: number;      // 法术强度
  magicResist: number;     // 魔法抗性
  critChance: number;      // 暴击几率
  critDamage: number;      // 暴击伤害
  attackSpeed: number;     // 攻击速度
  moveSpeed: number;       // 移动速度
  range: number;           // 攻击范围
  mana: number;            // 法力值
  manaRegen: number;       // 法力回复
}

// 角色完整属性接口(包含基础属性和计算属性)
export interface CharacterStats extends CharacterBaseStats {
  level: number;           // 等级
  star: number;            // 星级(1-3)
  experience: number;      // 经验值
  items: string[];         // 装备物品ID列表
}

// 角色接口
export interface Character {
  id: string;              // 角色ID
  name: string;            // 角色名称
  description: string;     // 角色描述
  class: CharacterClass;   // 职业
  race: CharacterRace;     // 种族
  baseStats: CharacterBaseStats; // 基础属性
  skills: Skill[];         // 技能列表
  cost: number;            // 棋子费用(金币)
  sprite: string;          // 角色精灵图路径
}

// 角色数据库 - 包含所有可用角色
export const CHARACTERS: Character[] = [
  // 人类战士
  {
    id: 'human_warrior',
    name: '钢铁卫士',
    description: '身着厚重铠甲的人类战士，擅长近身搏斗和防御。',
    class: CharacterClass.WARRIOR,
    race: CharacterRace.HUMAN,
    baseStats: {
      health: 800,
      attack: 75,
      defense: 50,
      magicPower: 0,
      magicResist: 20,
      critChance: 0.05,
      critDamage: 1.5,
      attackSpeed: 0.8,
      moveSpeed: 3,
      range: 1,
      mana: 100,
      manaRegen: 10
    },
    skills: [
      {
        id: 'whirlwind_strike',
        name: '旋风斩',
        description: '对周围敌人造成物理伤害，并减少他们的防御。',
        type: SkillType.ACTIVE,
        cooldown: 4,
        targetType: TargetType.AREA,
        effectType: EffectType.DAMAGE,
        effectValue: 120,
        range: 2,
        energyCost: 60,
        baseValue: 120,
        scalingFactor: 0.5,
        duration: 0
      },
      {
        id: 'iron_will',
        name: '钢铁意志',
        description: '受到致命伤害时，获得短暂的无敌状态并恢复部分生命值。',
        type: SkillType.PASSIVE,
        cooldown: 0,
        targetType: TargetType.SELF,
        effectType: EffectType.BUFF,
        effectValue: 200,
        range: 0,
        energyCost: 0,
        baseValue: 200,
        scalingFactor: 0.3,
        duration: 3
      }
    ],
    cost: 3,
    sprite: '/assets/characters/human_warrior.png'
  },
  
  // 机械法师
  {
    id: 'machine_mage',
    name: '能源巫师',
    description: '由齿轮和能量核心构成的机械法师，擅长远程魔法攻击。',
    class: CharacterClass.MAGE,
    race: CharacterRace.MACHINE,
    baseStats: {
      health: 550,
      attack: 20,
      defense: 15,
      magicPower: 85,
      magicResist: 40,
      critChance: 0.1,
      critDamage: 1.8,
      attackSpeed: 0.6,
      moveSpeed: 2.5,
      range: 4,
      mana: 120,
      manaRegen: 15
    },
    skills: [
      {
        id: 'energy_burst',
        name: '能量爆发',
        description: '向目标区域释放强大的能量冲击，造成魔法伤害。',
        type: SkillType.ACTIVE,
        cooldown: 3,
        targetType: TargetType.AREA,
        effectType: EffectType.DAMAGE,
        effectValue: 150,
        range: 3,
        energyCost: 70,
        baseValue: 150,
        scalingFactor: 0.7,
        duration: 0
      },
      {
        id: 'overcharge',
        name: '过载',
        description: '临时提升自身魔法强度，但会消耗部分生命值。',
        type: SkillType.ULTIMATE,
        cooldown: 6,
        targetType: TargetType.SELF,
        effectType: EffectType.BUFF,
        effectValue: 50,
        range: 0,
        energyCost: 100,
        baseValue: 50,
        scalingFactor: 0.8,
        duration: 5
      }
    ],
    cost: 4,
    sprite: '/assets/characters/machine_mage.png'
  },
  
  // 精灵刺客
  {
    id: 'elf_assassin',
    name: '暗影行者',
    description: '身着半透明披风的精灵刺客，擅长隐身和快速突袭。',
    class: CharacterClass.ASSASSIN,
    race: CharacterRace.ELF,
    baseStats: {
      health: 600,
      attack: 90,
      defense: 20,
      magicPower: 30,
      magicResist: 25,
      critChance: 0.25,
      critDamage: 2.0,
      attackSpeed: 1.2,
      moveSpeed: 4,
      range: 1,
      mana: 90,
      manaRegen: 8
    },
    skills: [
      {
        id: 'shadow_strike',
        name: '暗影突袭',
        description: '瞬间移动到敌人背后并造成高额物理伤害。',
        type: SkillType.ACTIVE,
        cooldown: 4,
        targetType: TargetType.SINGLE,
        effectType: EffectType.DAMAGE,
        effectValue: 200,
        range: 3,
        energyCost: 60,
        baseValue: 200,
        scalingFactor: 0.6,
        duration: 0
      },
      {
        id: 'vanish',
        name: '消失',
        description: '短暂隐身并增加移动速度，下次攻击必定暴击。',
        type: SkillType.PASSIVE,
        cooldown: 8,
        targetType: TargetType.SELF,
        effectType: EffectType.BUFF,
        effectValue: 0,
        range: 0,
        energyCost: 40,
        baseValue: 0,
        scalingFactor: 0.2,
        duration: 4
      }
    ],
    cost: 3,
    sprite: '/assets/characters/elf_assassin.png'
  }
];

// 羁绊效果数据库
export const SYNERGY_EFFECTS: SynergyEffect[] = [
  // 职业羁绊 - 战士
  {
    id: 'warrior_synergy',
    name: '战士之魂',
    description: '增加所有战士的防御和生命值。',
    type: CharacterClass.WARRIOR,
    requiredCount: [2, 4, 6],
    effects: [
      {
        level: 1,
        description: '所有战士防御+20,生命值+10%',
        statBonus: { defense: 20 }
      },
      {
        level: 2,
        description: '所有战士防御+40,生命值+20%',
        statBonus: { defense: 40 }
      },
      {
        level: 3,
        description: '所有战士防御+60,生命值+30%',
        statBonus: { defense: 60 }
      }
    ]
  },
  
  // 职业羁绊 - 法师
  {
    id: 'mage_synergy',
    name: '奥术共鸣',
    description: '增加所有法师的魔法强度和法力回复。',
    type: CharacterClass.MAGE,
    requiredCount: [2, 4, 6],
    effects: [
      {
        level: 1,
        description: '所有法师魔法强度+15%，法力回复+5',
        statBonus: { manaRegen: 5 }
      },
      {
        level: 2,
        description: '所有法师魔法强度+30%，法力回复+10',
        statBonus: { manaRegen: 10 }
      },
      {
        level: 3,
        description: '所有法师魔法强度+45%，法力回复+15',
        statBonus: { manaRegen: 15 }
      }
    ]
  },
  
  // 职业羁绊 - 刺客
  {
    id: 'assassin_synergy',
    name: '致命精准',
    description: '增加所有刺客的暴击几率和暴击伤害。',
    type: CharacterClass.ASSASSIN,
    requiredCount: [2, 4, 6],
    effects: [
      {
        level: 1,
        description: '所有刺客暴击几率+10%，暴击伤害+20%',
        statBonus: { critChance: 0.1, critDamage: 0.2 }
      },
      {
        level: 2,
        description: '所有刺客暴击几率+20%，暴击伤害+40%',
        statBonus: { critChance: 0.2, critDamage: 0.4 }
      },
      {
        level: 3,
        description: '所有刺客暴击几率+30%，暴击伤害+60%',
        statBonus: { critChance: 0.3, critDamage: 0.6 }
      }
    ]
  },
  
  // 种族羁绊 - 人类
  {
    id: 'human_synergy',
    name: '人类智慧',
    description: '人类单位获得额外经验值和技能冷却缩减。',
    type: CharacterRace.HUMAN,
    requiredCount: [2, 4, 6],
    effects: [
      {
        level: 1,
        description: '人类单位获得10%冷却缩减',
        statBonus: {}
      },
      {
        level: 2,
        description: '人类单位获得20%冷却缩减和10%额外经验',
        statBonus: {}
      },
      {
        level: 3,
        description: '人类单位获得30%冷却缩减和20%额外经验',
        statBonus: {}
      }
    ]
  },
  
  // 种族羁绊 - 机械
  {
    id: 'machine_synergy',
    name: '机械效率',
    description: '机械单位获得能量回复加成和伤害减免。',
    type: CharacterRace.MACHINE,
    requiredCount: [2, 4],
    effects: [
      {
        level: 1,
        description: '机械单位每回合回复10点能量',
        statBonus: { manaRegen: 10 }
      },
      {
        level: 2,
        description: '机械单位每回合回复20点能量,受到的伤害减少15%',
        statBonus: { manaRegen: 20 }
      }
    ]
  },
  
  // 种族羁绊 - 精灵
  {
    id: 'elf_synergy',
    name: '自然之力',
    description: '精灵单位获得闪避和移动速度加成。',
    type: CharacterRace.ELF,
    requiredCount: [2, 3, 5],
    effects: [
      {
        level: 1,
        description: '精灵单位获得15%闪避率',
        statBonus: { moveSpeed: 0.5 }
      },
      {
        level: 2,
        description: '精灵单位获得25%闪避率和额外移动速度',
        statBonus: { moveSpeed: 1 }
      },
      {
        level: 3,
        description: '精灵单位获得35%闪避率和大幅移动速度加成',
        statBonus: { moveSpeed: 1.5 }
      }
    ]
  }
];