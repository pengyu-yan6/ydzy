const { logSecurityEvent } = require('../../security/middleware');
const crypto = require('crypto');

/**
 * 角色属性计算器 - 处理角色属性的计算和验证
 */
class AttributeCalculator {
  // 属性上限配置
  static ATTRIBUTE_CAPS = {
    level: 100,
    hp: 999999,
    mp: 999999,
    attack: 100000,
    defense: 100000,
    magicPower: 100000,
    speed: 10000,
    critRate: 100, // 百分比
    critDamage: 500, // 百分比
    dodgeRate: 80, // 百分比
    accuracy: 100 // 百分比
  };

  /**
   * 获取角色属性
   * @param {string} characterId - 角色ID
   * @returns {Object} 角色属性
   */
  static async getCharacterAttributes(characterId) {
    try {
      // 获取基础属性
      const baseAttributes = await this.getBaseAttributes(characterId);
      
      // 获取装备加成
      const equipmentBonus = await this.getEquipmentBonus(characterId);
      
      // 获取皮肤效果
      const skinEffects = await this.getSkinEffects(characterId);
      
      // 获取buff效果
      const buffEffects = await this.getBuffEffects(characterId);
      
      // 计算最终属性
      const finalAttributes = this.calculateFinalAttributes(
        baseAttributes,
        equipmentBonus,
        skinEffects,
        buffEffects
      );
      
      // 生成属性校验哈希
      const attributeHash = this.generateAttributeHash(characterId, finalAttributes);
      
      // 保存校验哈希到数据库
      await this.saveAttributeHash(characterId, attributeHash);
      
      return finalAttributes;
    } catch (error) {
      logSecurityEvent('ATTRIBUTE_CALCULATION_ERROR', { characterId, error: error.message });
      throw new Error('属性计算失败');
    }
  }

  /**
   * 获取角色基础属性
   * @param {string} characterId - 角色ID
   * @returns {Object} 基础属性
   */
  static async getBaseAttributes(characterId) {
    // 实际项目中应从数据库获取
    // 这里简化为模拟数据
    return {
      level: 30,
      hp: 1000,
      mp: 500,
      attack: 100,
      defense: 80,
      magicPower: 120,
      speed: 50,
      critRate: 5,
      critDamage: 150,
      dodgeRate: 3,
      accuracy: 95
    };
  }

  /**
   * 获取装备加成
   * @param {string} characterId - 角色ID
   * @returns {Object} 装备加成
   */
  static async getEquipmentBonus(characterId) {
    // 实际项目中应从装备引擎获取
    // 这里简化为模拟数据
    return {
      hp: 200,
      mp: 100,
      attack: 30,
      defense: 25,
      magicPower: 15,
      speed: 5,
      critRate: 2,
      critDamage: 20,
      dodgeRate: 1,
      accuracy: 2
    };
  }

  /**
   * 获取皮肤效果
   * @param {string} characterId - 角色ID
   * @returns {Object} 皮肤效果
   */
  static async getSkinEffects(characterId) {
    // 实际项目中应从皮肤系统获取
    // 这里简化为模拟数据
    return {
      attackMultiplier: 0.05, // 5%攻击加成
      defenseMultiplier: 0.03, // 3%防御加成
      hpMultiplier: 0.08, // 8%生命加成
      mpMultiplier: 0.04 // 4%魔法加成
    };
  }

  /**
   * 获取buff效果
   * @param {string} characterId - 角色ID
   * @returns {Object} buff效果
   */
  static async getBuffEffects(characterId) {
    // 实际项目中应从buff系统获取
    // 这里简化为模拟数据
    return {
      attack: 10,
      defense: 5,
      speed: 3,
      critRate: 1
    };
  }

  /**
   * 计算最终属性
   * @param {Object} baseAttributes - 基础属性
   * @param {Object} equipmentBonus - 装备加成
   * @param {Object} skinEffects - 皮肤效果
   * @param {Object} buffEffects - buff效果
   * @returns {Object} 最终属性
   */
  static calculateFinalAttributes(baseAttributes, equipmentBonus, skinEffects, buffEffects) {
    const finalAttributes = {};
    
    // 计算HP
    finalAttributes.hp = Math.floor(
      (baseAttributes.hp + equipmentBonus.hp) * 
      (1 + (skinEffects.hpMultiplier || 0))
    );
    
    // 计算MP
    finalAttributes.mp = Math.floor(
      (baseAttributes.mp + equipmentBonus.mp) * 
      (1 + (skinEffects.mpMultiplier || 0))
    );
    
    // 计算攻击力
    finalAttributes.attack = Math.floor(
      (baseAttributes.attack + equipmentBonus.attack + (buffEffects.attack || 0)) * 
      (1 + (skinEffects.attackMultiplier || 0))
    );
    
    // 计算防御力
    finalAttributes.defense = Math.floor(
      (baseAttributes.defense + equipmentBonus.defense + (buffEffects.defense || 0)) * 
      (1 + (skinEffects.defenseMultiplier || 0))
    );
    
    // 计算魔法攻击
    finalAttributes.magicPower = Math.floor(
      baseAttributes.magicPower + equipmentBonus.magicPower
    );
    
    // 计算速度
    finalAttributes.speed = Math.floor(
      baseAttributes.speed + equipmentBonus.speed + (buffEffects.speed || 0)
    );
    
    // 计算暴击率
    finalAttributes.critRate = Math.min(
      this.ATTRIBUTE_CAPS.critRate,
      baseAttributes.critRate + equipmentBonus.critRate + (buffEffects.critRate || 0)
    );
    
    // 计算暴击伤害
    finalAttributes.critDamage = Math.min(
      this.ATTRIBUTE_CAPS.critDamage,
      baseAttributes.critDamage + equipmentBonus.critDamage
    );
    
    // 计算闪避率
    finalAttributes.dodgeRate = Math.min(
      this.ATTRIBUTE_CAPS.dodgeRate,
      baseAttributes.dodgeRate + equipmentBonus.dodgeRate
    );
    
    // 计算命中率
    finalAttributes.accuracy = Math.min(
      this.ATTRIBUTE_CAPS.accuracy,
      baseAttributes.accuracy + equipmentBonus.accuracy
    );
    
    // 应用属性上限
    for (const attr in finalAttributes) {
      if (this.ATTRIBUTE_CAPS[attr]) {
        finalAttributes[attr] = Math.min(finalAttributes[attr], this.ATTRIBUTE_CAPS[attr]);
      }
    }
    
    return finalAttributes;
  }

  /**
   * 生成属性校验哈希
   * @param {string} characterId - 角色ID
   * @param {Object} attributes - 角色属性
   * @returns {string} 校验哈希
   */
  static generateAttributeHash(characterId, attributes) {
    const data = JSON.stringify({
      characterId,
      attributes,
      timestamp: Date.now()
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 保存属性校验哈希
   * @param {string} characterId - 角色ID
   * @param {string} hash - 校验哈希
   */
  static async saveAttributeHash(characterId, hash) {
    // 实际项目中应保存到数据库
    console.log(`保存角色 ${characterId} 的属性校验哈希: ${hash}`);
  }

  /**
   * 验证角色属性
   * @param {string} characterId - 角色ID
   * @param {Object} attributes - 待验证的属性
   * @returns {boolean} 验证结果
   */
  static async verifyAttributes(characterId, attributes) {
    try {
      // 获取存储的校验哈希
      const storedHash = await this.getStoredAttributeHash(characterId);
      if (!storedHash) return false;
      
      // 计算当前属性的哈希
      const currentHash = this.generateAttributeHash(characterId, attributes);
      
      // 比较哈希值
      const isValid = storedHash === currentHash;
      
      if (!isValid) {
        logSecurityEvent('ATTRIBUTE_VERIFICATION_FAILED', { 
          characterId, 
          providedAttributes: attributes 
        });
      }
      
      return isValid;
    } catch (error) {
      logSecurityEvent('ATTRIBUTE_VERIFICATION_ERROR', { 
        characterId, 
        error: error.message 
      });
      return false;
    }
  }

  /**
   * 获取存储的属性校验哈希
   * @param {string} characterId - 角色ID
   * @returns {string} 校验哈希
   */
  static async getStoredAttributeHash(characterId) {
    // 实际项目中应从数据库获取
    return null;
  }
}

module.exports = AttributeCalculator; 