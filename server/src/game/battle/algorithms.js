const AttributeCalculator = require('../character/attributeCalculator');
const EquipmentEngine = require('../character/equipmentEngine');
const { logSecurityEvent } = require('../../security/middleware');

/**
 * 战斗算法模块 - 处理战斗逻辑和验证
 */
class BattleAlgorithms {
  /**
   * 验证战斗动作的合法性
   * @param {string} playerId - 玩家ID
   * @param {string} battleId - 战斗ID
   * @param {Object} action - 战斗动作
   * @returns {Object} 验证结果
   */
  static async validateBattleAction(playerId, battleId, action) {
    try {
      // 获取战斗状态
      const battleState = await this.getBattleState(battleId);
      if (!battleState) {
        return { valid: false, reason: 'BATTLE_NOT_FOUND' };
      }
      
      // 检查是否轮到该玩家行动
      if (battleState.currentTurn !== playerId) {
        return { valid: false, reason: 'NOT_YOUR_TURN' };
      }
      
      // 根据动作类型进行验证
      switch (action.type) {
        case 'ATTACK':
          return this.validateAttack(playerId, battleState, action);
        case 'USE_SKILL':
          return this.validateSkill(playerId, battleState, action);
        case 'USE_ITEM':
          return this.validateItem(playerId, battleState, action);
        case 'MOVE':
          return this.validateMove(playerId, battleState, action);
        default:
          return { valid: false, reason: 'UNKNOWN_ACTION_TYPE' };
      }
    } catch (error) {
      logSecurityEvent('BATTLE_VALIDATION_ERROR', { playerId, battleId, action, error: error.message });
      return { valid: false, reason: 'INTERNAL_ERROR' };
    }
  }

  /**
   * 获取战斗状态
   * @param {string} battleId - 战斗ID
   * @returns {Object} 战斗状态
   */
  static async getBattleState(battleId) {
    // 实际项目中应从数据库或缓存获取
    // 这里简化为模拟数据
    return {
      id: battleId,
      players: ['player1', 'player2'],
      currentTurn: 'player1',
      round: 1,
      entities: {
        'player1': {
          position: { x: 0, y: 0 },
          hp: 100,
          mp: 50,
          status: []
        },
        'player2': {
          position: { x: 5, y: 0 },
          hp: 100,
          mp: 50,
          status: []
        }
      }
    };
  }

  /**
   * 验证攻击动作
   */
  static validateAttack(playerId, battleState, action) {
    const { targetId } = action;
    
    // 检查目标是否存在
    if (!battleState.entities[targetId]) {
      return { valid: false, reason: 'TARGET_NOT_FOUND' };
    }
    
    // 检查目标是否在攻击范围内
    const attacker = battleState.entities[playerId];
    const target = battleState.entities[targetId];
    const distance = this.calculateDistance(attacker.position, target.position);
    
    // 假设攻击范围为2个单位
    if (distance > 2) {
      return { valid: false, reason: 'TARGET_OUT_OF_RANGE' };
    }
    
    // 计算伤害
    const damage = this.calculateDamage(playerId, targetId);
    
    return {
      valid: true,
      data: {
        type: 'ATTACK_RESULT',
        targetId,
        damage,
        critical: damage.isCritical
      }
    };
  }

  /**
   * 验证技能使用
   */
  static validateSkill(playerId, battleState, action) {
    const { skillId, targetId } = action;
    const player = battleState.entities[playerId];
    
    // 获取技能信息
    const skill = this.getSkillInfo(skillId);
    if (!skill) {
      return { valid: false, reason: 'SKILL_NOT_FOUND' };
    }
    
    // 检查MP是否足够
    if (player.mp < skill.mpCost) {
      return { valid: false, reason: 'NOT_ENOUGH_MP' };
    }
    
    // 检查冷却时间
    if (this.isSkillOnCooldown(playerId, skillId)) {
      return { valid: false, reason: 'SKILL_ON_COOLDOWN' };
    }
    
    // 检查目标是否合法
    if (skill.targetType === 'ENEMY' && !this.isEnemy(playerId, targetId)) {
      return { valid: false, reason: 'INVALID_TARGET' };
    }
    
    // 计算技能效果
    const effect = this.calculateSkillEffect(playerId, skillId, targetId);
    
    return {
      valid: true,
      data: {
        type: 'SKILL_RESULT',
        skillId,
        targetId,
        effect
      }
    };
  }

  /**
   * 验证道具使用
   */
  static validateItem(playerId, battleState, action) {
    const { itemId, targetId } = action;
    
    // 检查玩家是否拥有该道具
    if (!this.playerHasItem(playerId, itemId)) {
      return { valid: false, reason: 'ITEM_NOT_OWNED' };
    }
    
    // 获取道具信息
    const item = this.getItemInfo(itemId);
    if (!item) {
      return { valid: false, reason: 'ITEM_NOT_FOUND' };
    }
    
    // 检查目标是否合法
    if (item.targetType === 'ALLY' && !this.isAlly(playerId, targetId)) {
      return { valid: false, reason: 'INVALID_TARGET' };
    }
    
    // 计算道具效果
    const effect = this.calculateItemEffect(itemId, targetId);
    
    return {
      valid: true,
      data: {
        type: 'ITEM_RESULT',
        itemId,
        targetId,
        effect
      }
    };
  }

  /**
   * 验证移动动作
   */
  static validateMove(playerId, battleState, action) {
    const { position } = action;
    const player = battleState.entities[playerId];
    
    // 检查移动距离是否合法
    const distance = this.calculateDistance(player.position, position);
    const maxMoveDistance = 3; // 假设最大移动距离为3个单位
    
    if (distance > maxMoveDistance) {
      return { valid: false, reason: 'MOVE_TOO_FAR' };
    }
    
    // 检查目标位置是否被占用
    if (this.isPositionOccupied(battleState, position)) {
      return { valid: false, reason: 'POSITION_OCCUPIED' };
    }
    
    return {
      valid: true,
      data: {
        type: 'MOVE_RESULT',
        from: player.position,
        to: position
      }
    };
  }

  /**
   * 计算两点之间的距离
   */
  static calculateDistance(pos1, pos2) {
    return Math.sqrt(Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.y - pos1.y, 2));
  }

  /**
   * 计算攻击伤害
   */
  static calculateDamage(attackerId, defenderId) {
    // 获取攻击者和防御者的属性
    const attackerAttributes = AttributeCalculator.getCharacterAttributes(attackerId);
    const defenderAttributes = AttributeCalculator.getCharacterAttributes(defenderId);
    
    // 获取装备加成
    const attackerEquipment = EquipmentEngine.getEquipmentBonus(attackerId);
    
    // 基础伤害计算
    let damage = attackerAttributes.attack * (1 + attackerEquipment.attackBonus / 100);
    
    // 考虑防御减伤
    damage = Math.max(1, damage - defenderAttributes.defense * 0.7);
    
    // 暴击判定
    const criticalChance = attackerAttributes.critRate / 100;
    const isCritical = Math.random() < criticalChance;
    
    if (isCritical) {
      const critDamage = attackerAttributes.critDamage / 100 || 1.5;
      damage *= critDamage;
    }
    
    // 随机波动 (±10%)
    const randomFactor = 0.9 + Math.random() * 0.2;
    damage = Math.floor(damage * randomFactor);
    
    return {
      value: damage,
      isCritical
    };
  }

  /**
   * 获取技能信息
   */
  static getSkillInfo(skillId) {
    // 实际项目中应从数据库或配置获取
    const skills = {
      'skill1': {
        id: 'skill1',
        name: '火球术',
        mpCost: 10,
        cooldown: 2,
        targetType: 'ENEMY',
        damageType: 'MAGICAL',
        power: 150
      },
      'skill2': {
        id: 'skill2',
        name: '治疗术',
        mpCost: 15,
        cooldown: 3,
        targetType: 'ALLY',
        healPower: 100
      }
    };
    
    return skills[skillId];
  }

  /**
   * 检查技能是否在冷却中
   */
  static isSkillOnCooldown(playerId, skillId) {
    // 实际项目中应检查冷却状态
    return false;
  }

  /**
   * 检查目标是否为敌人
   */
  static isEnemy(playerId, targetId) {
    // 实际项目中应根据阵营判断
    return playerId !== targetId;
  }

  /**
   * 检查目标是否为盟友
   */
  static isAlly(playerId, targetId) {
    // 实际项目中应根据阵营判断
    return playerId === targetId || this.isInSameGuild(playerId, targetId);
  }

  /**
   * 检查两个玩家是否在同一公会
   */
  static isInSameGuild(player1Id, player2Id) {
    // 实际项目中应查询公会信息
    return false;
  }

  /**
   * 检查玩家是否拥有道具
   */
  static playerHasItem(playerId, itemId) {
    // 实际项目中应查询玩家背包
    return true;
  }

  /**
   * 获取道具信息
   */
  static getItemInfo(itemId) {
    // 实际项目中应从数据库或配置获取
    const items = {
      'item1': {
        id: 'item1',
        name: '治疗药水',
        targetType: 'ALLY',
        effect: 'HEAL',
        power: 50
      },
      'item2': {
        id: 'item2',
        name: '毒药',
        targetType: 'ENEMY',
        effect: 'POISON',
        duration: 3,
        power: 10
      }
    };
    
    return items[itemId];
  }

  /**
   * 计算技能效果
   */
  static calculateSkillEffect(casterId, skillId, targetId) {
    const skill = this.getSkillInfo(skillId);
    const casterAttributes = AttributeCalculator.getCharacterAttributes(casterId);
    
    if (skill.damageType === 'MAGICAL') {
      // 魔法伤害计算
      const magicPower = casterAttributes.magicPower || casterAttributes.intelligence;
      let damage = skill.power * (magicPower / 100);
      
      // 随机波动 (±10%)
      const randomFactor = 0.9 + Math.random() * 0.2;
      damage = Math.floor(damage * randomFactor);
      
      return {
        type: 'DAMAGE',
        value: damage
      };
    } else if (skill.healPower) {
      // 治疗效果计算
      const healPower = casterAttributes.healPower || casterAttributes.intelligence;
      let heal = skill.healPower * (healPower / 100);
      
      // 随机波动 (±10%)
      const randomFactor = 0.9 + Math.random() * 0.2;
      heal = Math.floor(heal * randomFactor);
      
      return {
        type: 'HEAL',
        value: heal
      };
    }
    
    return null;
  }

  /**
   * 计算道具效果
   */
  static calculateItemEffect(itemId, targetId) {
    const item = this.getItemInfo(itemId);
    
    if (item.effect === 'HEAL') {
      return {
        type: 'HEAL',
        value: item.power
      };
    } else if (item.effect === 'POISON') {
      return {
        type: 'STATUS',
        status: 'POISON',
        duration: item.duration,
        power: item.power
      };
    }
    
    return null;
  }

  /**
   * 检查位置是否被占用
   */
  static isPositionOccupied(battleState, position) {
    for (const entityId in battleState.entities) {
      const entity = battleState.entities[entityId];
      if (entity.position.x === position.x && entity.position.y === position.y) {
        return true;
      }
    }
    
    return false;
  }
}

module.exports = {
  validateBattleAction: BattleAlgorithms.validateBattleAction.bind(BattleAlgorithms)
}; 