const { logSecurityEvent } = require('../../security/middleware');
const AntiCheatSystem = require('../../security/antiCheat');
const crypto = require('crypto');

/**
 * 经济系统服务 - 处理游戏币流转和交易
 */
class EconomyService {
  // 货币类型
  static CURRENCY_TYPES = {
    GOLD: 'gold',           // 金币，通用货币
    DIAMOND: 'diamond',     // 钻石，高级货币
    HONOR: 'honor',         // 荣誉点数，PVP货币
    GUILD_CONTRIBUTION: 'guild_contribution' // 公会贡献
  };

  // 交易类型
  static TRANSACTION_TYPES = {
    QUEST_REWARD: 'quest_reward',       // 任务奖励
    ITEM_PURCHASE: 'item_purchase',     // 购买物品
    ITEM_SELL: 'item_sell',             // 出售物品
    PLAYER_TRANSFER: 'player_transfer', // 玩家间转账
    SYSTEM_GRANT: 'system_grant',       // 系统发放
    SYSTEM_DEDUCT: 'system_deduct',     // 系统扣除
    BATTLE_REWARD: 'battle_reward',     // 战斗奖励
    GUILD_DONATION: 'guild_donation'    // 公会捐赠
  };

  /**
   * 获取玩家货币余额
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @returns {Object} 余额信息
   */
  static async getBalance(playerId, currencyType) {
    try {
      // 验证货币类型
      if (!this.CURRENCY_TYPES[currencyType]) {
        return { success: false, reason: 'INVALID_CURRENCY_TYPE' };
      }
      
      // 从数据库获取余额
      const balance = await this.fetchBalanceFromDB(playerId, currencyType);
      
      // 生成余额校验哈希
      const balanceHash = this.generateBalanceHash(playerId, currencyType, balance);
      
      // 保存校验哈希
      await this.saveBalanceHash(playerId, currencyType, balanceHash);
      
      return {
        success: true,
        balance,
        currencyType
      };
    } catch (error) {
      logSecurityEvent('GET_BALANCE_ERROR', { 
        playerId, 
        currencyType,
        error: error.message 
      });
      return { success: false, reason: 'INTERNAL_ERROR' };
    }
  }

  /**
   * 从数据库获取余额
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @returns {number} 余额
   */
  static async fetchBalanceFromDB(playerId, currencyType) {
    // 实际项目中应从数据库获取
    // 这里简化为模拟数据
    const mockBalances = {
      'gold': 10000,
      'diamond': 500,
      'honor': 1200,
      'guild_contribution': 300
    };
    
    return mockBalances[currencyType.toLowerCase()] || 0;
  }

  /**
   * 生成余额校验哈希
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @param {number} balance - 余额
   * @returns {string} 校验哈希
   */
  static generateBalanceHash(playerId, currencyType, balance) {
    const data = JSON.stringify({
      playerId,
      currencyType,
      balance,
      timestamp: Date.now()
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 保存余额校验哈希
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @param {string} hash - 校验哈希
   */
  static async saveBalanceHash(playerId, currencyType, hash) {
    // 实际项目中应保存到数据库
    console.log(`保存玩家 ${playerId} 的 ${currencyType} 余额校验哈希: ${hash}`);
  }

  /**
   * 验证余额
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @param {number} balance - 待验证的余额
   * @returns {boolean} 验证结果
   */
  static async verifyBalance(playerId, currencyType, balance) {
    try {
      // 获取存储的校验哈希
      const storedHash = await this.getStoredBalanceHash(playerId, currencyType);
      if (!storedHash) return false;
      
      // 计算当前余额的哈希
      const currentHash = this.generateBalanceHash(playerId, currencyType, balance);
      
      // 比较哈希值
      const isValid = storedHash === currentHash;
      
      if (!isValid) {
        logSecurityEvent('BALANCE_VERIFICATION_FAILED', { 
          playerId, 
          currencyType,
          providedBalance: balance 
        });
        
        // 触发防作弊检测
        AntiCheatSystem.reportIncident(playerId, 'CURRENCY_TAMPERING', {
          currencyType,
          providedBalance: balance
        });
      }
      
      return isValid;
    } catch (error) {
      logSecurityEvent('BALANCE_VERIFICATION_ERROR', { 
        playerId, 
        currencyType,
        error: error.message 
      });
      return false;
    }
  }

  /**
   * 获取存储的余额校验哈希
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @returns {string} 校验哈希
   */
  static async getStoredBalanceHash(playerId, currencyType) {
    // 实际项目中应从数据库获取
    return null;
  }

  /**
   * 修改玩家货币余额
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @param {number} amount - 变动金额
   * @param {string} transactionType - 交易类型
   * @param {Object} metadata - 交易元数据
   * @returns {Object} 操作结果
   */
  static async modifyCurrency(playerId, currencyType, amount, transactionType, metadata = {}) {
    try {
      // 验证参数
      if (!this.CURRENCY_TYPES[currencyType]) {
        return { success: false, reason: 'INVALID_CURRENCY_TYPE' };
      }
      
      if (!this.TRANSACTION_TYPES[transactionType]) {
        return { success: false, reason: 'INVALID_TRANSACTION_TYPE' };
      }
      
      if (!Number.isInteger(amount)) {
        return { success: false, reason: 'INVALID_AMOUNT' };
      }
      
      // 获取当前余额
      const { success, balance } = await this.getBalance(playerId, currencyType);
      if (!success) {
        return { success: false, reason: 'FAILED_TO_GET_BALANCE' };
      }
      
      // 计算新余额
      const newBalance = balance + amount;
      
      // 检查余额是否足够（如果是扣款）
      if (amount < 0 && newBalance < 0) {
        return { success: false, reason: 'INSUFFICIENT_BALANCE' };
      }
      
      // 防作弊检测
      if (amount > 0 && !this.isLegitimateIncome(playerId, currencyType, amount, transactionType, metadata)) {
        logSecurityEvent('SUSPICIOUS_INCOME', {
          playerId,
          currencyType,
          amount,
          transactionType,
          metadata
        });
        
        // 触发防作弊检测
        AntiCheatSystem.reportIncident(playerId, 'SUSPICIOUS_INCOME', {
          currencyType,
          amount,
          transactionType
        });
        
        return { success: false, reason: 'SUSPICIOUS_TRANSACTION' };
      }
      
      // 生成交易ID
      const transactionId = crypto.randomUUID();
      
      // 更新数据库
      await this.updateBalanceInDB(playerId, currencyType, newBalance);
      
      // 记录交易日志
      await this.logTransaction(transactionId, playerId, currencyType, amount, transactionType, metadata);
      
      // 生成新的余额校验哈希
      const balanceHash = this.generateBalanceHash(playerId, currencyType, newBalance);
      
      // 保存校验哈希
      await this.saveBalanceHash(playerId, currencyType, balanceHash);
      
      return {
        success: true,
        transactionId,
        previousBalance: balance,
        newBalance,
        amount
      };
    } catch (error) {
      logSecurityEvent('MODIFY_CURRENCY_ERROR', { 
        playerId, 
        currencyType,
        amount,
        transactionType,
        error: error.message 
      });
      return { success: false, reason: 'INTERNAL_ERROR' };
    }
  }

  /**
   * 更新数据库中的余额
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @param {number} newBalance - 新余额
   */
  static async updateBalanceInDB(playerId, currencyType, newBalance) {
    // 实际项目中应更新数据库
    console.log(`更新玩家 ${playerId} 的 ${currencyType} 余额为 ${newBalance}`);
  }

  /**
   * 记录交易日志
   * @param {string} transactionId - 交易ID
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @param {number} amount - 变动金额
   * @param {string} transactionType - 交易类型
   * @param {Object} metadata - 交易元数据
   */
  static async logTransaction(transactionId, playerId, currencyType, amount, transactionType, metadata) {
    const transaction = {
      id: transactionId,
      playerId,
      currencyType,
      amount,
      transactionType,
      metadata,
      timestamp: Date.now(),
      ip: metadata.ip || 'unknown',
      deviceId: metadata.deviceId || 'unknown',
      serverVersion: process.env.SERVER_VERSION || 'unknown'
    };
    
    // 实际项目中应保存到数据库
    console.log(`记录交易: ${JSON.stringify(transaction)}`);
  }

  /**
   * 检查收入是否合法
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @param {number} amount - 变动金额
   * @param {string} transactionType - 交易类型
   * @param {Object} metadata - 交易元数据
   * @returns {boolean} 是否合法
   */
  static isLegitimateIncome(playerId, currencyType, amount, transactionType, metadata) {
    // 系统发放的货币总是合法的
    if (transactionType === this.TRANSACTION_TYPES.SYSTEM_GRANT) {
      return true;
    }
    
    // 检查任务奖励是否合法
    if (transactionType === this.TRANSACTION_TYPES.QUEST_REWARD) {
      return this.validateQuestReward(playerId, metadata.questId, amount, currencyType);
    }
    
    // 检查战斗奖励是否合法
    if (transactionType === this.TRANSACTION_TYPES.BATTLE_REWARD) {
      return this.validateBattleReward(playerId, metadata.battleId, amount, currencyType);
    }
    
    // 检查物品出售是否合法
    if (transactionType === this.TRANSACTION_TYPES.ITEM_SELL) {
      return this.validateItemSell(playerId, metadata.itemId, amount, currencyType);
    }
    
    // 检查玩家转账是否合法
    if (transactionType === this.TRANSACTION_TYPES.PLAYER_TRANSFER) {
      return this.validatePlayerTransfer(metadata.fromPlayerId, playerId, amount, currencyType);
    }
    
    // 默认情况下，检查收入是否超过合理范围
    return this.isWithinReasonableRange(playerId, currencyType, amount);
  }

  /**
   * 验证任务奖励是否合法
   * @param {string} playerId - 玩家ID
   * @param {string} questId - 任务ID
   * @param {number} amount - 奖励金额
   * @param {string} currencyType - 货币类型
   * @returns {boolean} 是否合法
   */
  static validateQuestReward(playerId, questId, amount, currencyType) {
    // 实际项目中应检查任务配置和完成状态
    return true;
  }

  /**
   * 验证战斗奖励是否合法
   * @param {string} playerId - 玩家ID
   * @param {string} battleId - 战斗ID
   * @param {number} amount - 奖励金额
   * @param {string} currencyType - 货币类型
   * @returns {boolean} 是否合法
   */
  static validateBattleReward(playerId, battleId, amount, currencyType) {
    // 实际项目中应检查战斗记录和结果
    return true;
  }

  /**
   * 验证物品出售是否合法
   * @param {string} playerId - 玩家ID
   * @param {string} itemId - 物品ID
   * @param {number} amount - 出售金额
   * @param {string} currencyType - 货币类型
   * @returns {boolean} 是否合法
   */
  static validateItemSell(playerId, itemId, amount, currencyType) {
    // 实际项目中应检查物品价值和所有权
    return true;
  }

  /**
   * 验证玩家转账是否合法
   * @param {string} fromPlayerId - 转出玩家ID
   * @param {string} toPlayerId - 转入玩家ID
   * @param {number} amount - 转账金额
   * @param {string} currencyType - 货币类型
   * @returns {boolean} 是否合法
   */
  static validatePlayerTransfer(fromPlayerId, toPlayerId, amount, currencyType) {
    // 实际项目中应检查转账记录和关系
    return true;
  }

  /**
   * 检查金额是否在合理范围内
   * @param {string} playerId - 玩家ID
   * @param {string} currencyType - 货币类型
   * @param {number} amount - 金额
   * @returns {boolean} 是否在合理范围内
   */
  static isWithinReasonableRange(playerId, currencyType, amount) {
    // 获取玩家等级
    const playerLevel = 30; // 实际项目中应从数据库获取
    
    // 根据货币类型和玩家等级设置合理范围
    const maxReasonableAmount = {
      [this.CURRENCY_TYPES.GOLD]: playerLevel * 1000,
      [this.CURRENCY_TYPES.DIAMOND]: playerLevel * 50,
      [this.CURRENCY_TYPES.HONOR]: playerLevel * 100,
      [this.CURRENCY_TYPES.GUILD_CONTRIBUTION]: playerLevel * 20
    };
    
    return amount <= maxReasonableAmount[currencyType];
  }

  /**
   * 玩家间转账
   * @param {string} fromPlayerId - 转出玩家ID
   * @param {string} toPlayerId - 转入玩家ID
   * @param {string} currencyType - 货币类型
   * @param {number} amount - 转账金额
   * @param {Object} metadata - 交易元数据
   * @returns {Object} 操作结果
   */
  static async transferBetweenPlayers(fromPlayerId, toPlayerId, currencyType, amount, metadata = {}) {
    try {
      // 验证参数
      if (fromPlayerId === toPlayerId) {
        return { success: false, reason: 'CANNOT_TRANSFER_TO_SELF' };
      }
      
      if (!this.CURRENCY_TYPES[currencyType]) {
        return { success: false, reason: 'INVALID_CURRENCY_TYPE' };
      }
      
      if (!Number.isInteger(amount) || amount <= 0) {
        return { success: false, reason: 'INVALID_AMOUNT' };
      }
      
      // 检查是否允许该货币类型的玩家间转账
      if (currencyType === this.CURRENCY_TYPES.HONOR || currencyType === this.CURRENCY_TYPES.GUILD_CONTRIBUTION) {
        return { success: false, reason: 'CURRENCY_NOT_TRANSFERABLE' };
      }
      
      // 生成交易ID
      const transactionId = crypto.randomUUID();
      
      // 使用数据库事务确保原子性
      // 实际项目中应使用数据库事务
      
      // 1. 从转出玩家扣除货币
      const deductResult = await this.modifyCurrency(
        fromPlayerId,
        currencyType,
        -amount,
        this.TRANSACTION_TYPES.PLAYER_TRANSFER,
        { ...metadata, toPlayerId, transactionId }
      );
      
      if (!deductResult.success) {
        return deductResult;
      }
      
      // 2. 向转入玩家添加货币
      const addResult = await this.modifyCurrency(
        toPlayerId,
        currencyType,
        amount,
        this.TRANSACTION_TYPES.PLAYER_TRANSFER,
        { ...metadata, fromPlayerId, transactionId }
      );
      
      if (!addResult.success) {
        // 回滚转出玩家的扣款
        await this.modifyCurrency(
          fromPlayerId,
          currencyType,
          amount,
          this.TRANSACTION_TYPES.SYSTEM_GRANT,
          { reason: 'TRANSFER_ROLLBACK', originalTransactionId: transactionId }
        );
        
        return addResult;
      }
      
      // 记录转账日志
      await this.logTransfer(transactionId, fromPlayerId, toPlayerId, currencyType, amount, metadata);
      
      return {
        success: true,
        transactionId,
        fromPlayer: {
          id: fromPlayerId,
          previousBalance: deductResult.previousBalance,
          newBalance: deductResult.newBalance
        },
        toPlayer: {
          id: toPlayerId,
          previousBalance: addResult.previousBalance,
          newBalance: addResult.newBalance
        },
        amount
      };
    } catch (error) {
      logSecurityEvent('TRANSFER_ERROR', { 
        fromPlayerId, 
        toPlayerId,
        currencyType,
        amount,
        error: error.message 
      });
      return { success: false, reason: 'INTERNAL_ERROR' };
    }
  }

  /**
   * 记录转账日志
   * @param {string} transactionId - 交易ID
   * @param {string} fromPlayerId - 转出玩家ID
   * @param {string} toPlayerId - 转入玩家ID
   * @param {string} currencyType - 货币类型
   * @param {number} amount - 转账金额
   * @param {Object} metadata - 交易元数据
   */
  static async logTransfer(transactionId, fromPlayerId, toPlayerId, currencyType, amount, metadata) {
    const transfer = {
      id: transactionId,
      fromPlayerId,
      toPlayerId,
      currencyType,
      amount,
      metadata,
      timestamp: Date.now(),
      ip: metadata.ip || 'unknown',
      deviceId: metadata.deviceId || 'unknown'
    };
    
    // 实际项目中应保存到数据库
    console.log(`记录转账: ${JSON.stringify(transfer)}`);
  }

  /**
   * 购买商店物品
   * @param {string} playerId - 玩家ID
   * @param {string} itemId - 物品ID
   * @param {number} quantity - 数量
   * @param {Object} metadata - 交易元数据
   * @returns {Object} 操作结果
   */
  static async purchaseItem(playerId, itemId, quantity = 1, metadata = {}) {
    try {
      // 验证参数
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return { success: false, reason: 'INVALID_QUANTITY' };
      }
      
      // 获取物品信息
      const item = await this.getItemInfo(itemId);
      if (!item) {
        return { success: false, reason: 'ITEM_NOT_FOUND' };
      }
      
      // 计算总价
      const totalPrice = item.price * quantity;
      const currencyType = item.currencyType || this.CURRENCY_TYPES.GOLD;
      
      // 检查玩家余额
      const { success, balance } = await this.getBalance(playerId, currencyType);
      if (!success) {
        return { success: false, reason: 'FAILED_TO_GET_BALANCE' };
      }
      
      if (balance < totalPrice) {
        return { success: false, reason: 'INSUFFICIENT_BALANCE' };
      }
      
      // 生成交易ID
      const transactionId = crypto.randomUUID();
      
      // 扣除货币
      const deductResult = await this.modifyCurrency(
        playerId,
        currencyType,
        -totalPrice,
        this.TRANSACTION_TYPES.ITEM_PURCHASE,
        { ...metadata, itemId, quantity, transactionId }
      );
      
      if (!deductResult.success) {
        return deductResult;
      }
      
      // 添加物品到玩家背包
      const addItemResult = await this.addItemToInventory(playerId, itemId, quantity);
      
      if (!addItemResult.success) {
        // 回滚货币扣除
        await this.modifyCurrency(
          playerId,
          currencyType,
          totalPrice,
          this.TRANSACTION_TYPES.SYSTEM_GRANT,
          { reason: 'PURCHASE_ROLLBACK', originalTransactionId: transactionId }
        );
        
        return addItemResult;
      }
      
      // 记录购买日志
      await this.logPurchase(transactionId, playerId, itemId, quantity, totalPrice, currencyType, metadata);
      
      return {
        success: true,
        transactionId,
        item: {
          id: itemId,
          name: item.name,
          quantity
        },
        cost: {
          amount: totalPrice,
          currencyType,
          previousBalance: deductResult.previousBalance,
          newBalance: deductResult.newBalance
        }
      };
    } catch (error) {
      logSecurityEvent('PURCHASE_ERROR', { 
        playerId, 
        itemId,
        quantity,
        error: error.message 
      });
      return { success: false, reason: 'INTERNAL_ERROR' };
    }
  }

  /**
   * 获取物品信息
   * @param {string} itemId - 物品ID
   * @returns {Object} 物品信息
   */
  static async getItemInfo(itemId) {
    // 实际项目中应从数据库或配置获取
    // 这里简化为模拟数据
    const items = {
      'item1': {
        id: 'item1',
        name: '治疗药水',
        price: 50,
        currencyType: 'GOLD'
      },
      'item2': {
        id: 'item2',
        name: '高级装备箱',
        price: 100,
        currencyType: 'DIAMOND'
      }
    };
    
    return items[itemId];
  }

  /**
   * 添加物品到玩家背包
   * @param {string} playerId - 玩家ID
   * @param {string} itemId - 物品ID
   * @param {number} quantity - 数量
   * @returns {Object} 操作结果
   */
  static async addItemToInventory(playerId, itemId, quantity) {
    // 实际项目中应更新数据库
    return { success: true };
  }

  /**
   * 记录购买日志
   * @param {string} transactionId - 交易ID
   * @param {string} playerId - 玩家ID
   * @param {string} itemId - 物品ID
   * @param {number} quantity - 数量
   * @param {number} totalPrice - 总价
   * @param {string} currencyType - 货币类型
   * @param {Object} metadata - 交易元数据
   */
  static async logPurchase(transactionId, playerId, itemId, quantity, totalPrice, currencyType, metadata) {
    const purchase = {
      id: transactionId,
      playerId,
      itemId,
      quantity,
      totalPrice,
      currencyType,
      metadata,
      timestamp: Date.now(),
      ip: metadata.ip || 'unknown',
      deviceId: metadata.deviceId || 'unknown'
    };
    
    // 实际项目中应保存到数据库
    console.log(`记录购买: ${JSON.stringify(purchase)}`);
  }
}

module.exports = EconomyService; 