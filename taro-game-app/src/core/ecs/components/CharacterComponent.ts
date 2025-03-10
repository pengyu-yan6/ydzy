/**
 * CharacterComponent.ts
 * 角色组件 - 存储角色的基本信息
 */
import { Component } from '../Component';
import { CharacterClass, CharacterRace } from '../../../models/CharacterStats';

/**
 * 角色组件 - 用于存储角色的基本信息
 */
export class CharacterComponent implements Component {
  readonly type: string = 'Character';
  
  // 角色名称
  public name: string = '';
  
  // 角色职业
  public class: CharacterClass;
  
  // 角色种族
  public race: CharacterRace;
  
  // 角色等级
  public level: number = 1;
  
  // 角色经验值
  public experience: number = 0;
  
  // 角色星级（用于云顶之弈类游戏）
  public stars: number = 1;
  
  // 角色头像
  public avatar: string = '';
  
  // 角色模型
  public model: string = '';
  
  // 角色描述
  public description: string = '';
  
  // 角色技能ID列表
  public skillIds: string[] = [];
  
  // 角色装备槽位
  public equipmentSlots: {
    weapon: string | null;
    armor: string | null;
    accessory: string | null;
  } = {
    weapon: null,
    armor: null,
    accessory: null
  };
  
  constructor(params: Partial<CharacterComponent> = {}) {
    Object.assign(this, params);
  }
}