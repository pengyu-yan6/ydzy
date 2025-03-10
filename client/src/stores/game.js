/**
 * 游戏状态管理
 */
import { defineStore } from 'pinia';
import { ref, reactive, computed } from 'vue';
import api from '@/services/api';
import { handleError } from '@/utils/errorHandler';
import { useNotificationStore } from './notification';

export const useGameStore = defineStore('game', () => {
  // 获取通知存储
  const notificationStore = useNotificationStore();
  
  // 游戏状态
  const gameActive = ref(false);
  const gameLoading = ref(false);
  const gameInitialized = ref(false);
  
  // 用户资源
  const resources = reactive({
    gold: 0,
    diamond: 0,
    energy: 0,
    maxEnergy: 100,
    lastEnergyUpdate: 0
  });
  
  // 角色状态
  const characters = ref([]);
  const currentCharacterId = ref(null);
  const characterLoading = ref(false);
  
  // 装备状态
  const equipments = ref([]);
  const equipmentLoading = ref(false);
  
  // 战斗状态
  const battleActive = ref(false);
  const currentBattleId = ref(null);
  const battleData = reactive({
    type: '',
    opponents: [],
    turns: [],
    rewards: {},
    startTime: 0,
    endTime: 0,
    result: ''
  });
  
  // 计算属性
  // 当前角色
  const currentCharacter = computed(() => {
    if (!currentCharacterId.value) return null;
    return characters.value.find(char => char.id === currentCharacterId.value) || null;
  });
  
  // 能量恢复时间（分钟）
  const energyRecoveryTime = computed(() => {
    if (resources.energy >= resources.maxEnergy) return 0;
    
    const energyNeeded = resources.maxEnergy - resources.energy;
    // 假设每5分钟恢复1点能量
    return energyNeeded * 5;
  });
  
  // 战斗是否结束
  const isBattleEnded = computed(() => {
    return battleData.endTime > 0;
  });
  
  // 方法
  // 设置游戏活动状态
  function setGameActive(active) {
    gameActive.value = active;
    
    // 如果游戏变为活动状态，开始能量恢复计时器
    if (active) {
      startEnergyRecovery();
    }
  }
  
  // 加载用户资源
  async function loadResources() {
    gameLoading.value = true;
    try {
      const response = await api.game.getResources();
      updateResources(response.data);
      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      gameLoading.value = false;
    }
  }
  
  // 更新资源
  function updateResources(newResources) {
    Object.assign(resources, newResources);
    resources.lastEnergyUpdate = Date.now();
  }
  
  // 开始能量恢复计时器
  function startEnergyRecovery() {
    // 每分钟检查一次能量恢复
    const intervalId = setInterval(() => {
      if (!gameActive.value) {
        clearInterval(intervalId);
        return;
      }
      
      // 如果能量已满，不需要恢复
      if (resources.energy >= resources.maxEnergy) return;
      
      // 计算自上次更新以来经过的分钟数
      const now = Date.now();
      const minutesPassed = Math.floor((now - resources.lastEnergyUpdate) / (60 * 1000));
      
      // 如果至少过了1分钟
      if (minutesPassed > 0) {
        // 假设每5分钟恢复1点能量
        const energyRecovered = Math.floor(minutesPassed / 5);
        
        if (energyRecovered > 0) {
          // 更新能量，不超过最大值
          resources.energy = Math.min(resources.maxEnergy, resources.energy + energyRecovered);
          resources.lastEnergyUpdate = now;
        }
      }
    }, 60 * 1000); // 每分钟检查一次
    
    // 返回清理函数
    return () => clearInterval(intervalId);
  }
  
  // 加载角色列表
  async function loadCharacters() {
    characterLoading.value = true;
    try {
      const response = await api.game.getCharacters();
      characters.value = response.data;
      
      // 如果没有选择当前角色，默认选择第一个
      if (!currentCharacterId.value && characters.value.length > 0) {
        currentCharacterId.value = characters.value[0].id;
      }
      
      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      characterLoading.value = false;
    }
  }
  
  // 选择角色
  function selectCharacter(characterId) {
    const character = characters.value.find(char => char.id === characterId);
    if (character) {
      currentCharacterId.value = characterId;
      return true;
    }
    return false;
  }
  
  // 加载装备列表
  async function loadEquipments() {
    equipmentLoading.value = true;
    try {
      const response = await api.game.getEquipments();
      equipments.value = response.data;
      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      equipmentLoading.value = false;
    }
  }
  
  // 装备物品
  async function equipItem(characterId, equipmentId, slot) {
    try {
      const response = await api.game.equipItem({
        characterId,
        equipmentId,
        slot
      });
      
      // 更新角色装备
      const character = characters.value.find(char => char.id === characterId);
      if (character) {
        character.equipments = response.data.equipments;
      }
      
      // 显示成功通知
      notificationStore.addNotification({
        type: 'success',
        message: '装备成功'
      });
      
      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    }
  }
  
  // 卸下装备
  async function unequipItem(characterId, slot) {
    try {
      const response = await api.game.unequipItem({
        characterId,
        slot
      });
      
      // 更新角色装备
      const character = characters.value.find(char => char.id === characterId);
      if (character) {
        character.equipments = response.data.equipments;
      }
      
      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    }
  }
  
  // 开始战斗
  async function startBattle(battleType, opponentIds) {
    try {
      // 检查是否有足够的能量
      if (resources.energy < 10) {
        notificationStore.addNotification({
          type: 'error',
          message: '能量不足，无法开始战斗'
        });
        return null;
      }
      
      const response = await api.game.startBattle({
        type: battleType,
        characterId: currentCharacterId.value,
        opponentIds
      });
      
      // 设置战斗状态
      battleActive.value = true;
      currentBattleId.value = response.data.battleId;
      
      // 更新战斗数据
      Object.assign(battleData, response.data);
      
      // 消耗能量
      resources.energy -= 10;
      resources.lastEnergyUpdate = Date.now();
      
      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    }
  }
  
  // 设置战斗状态
  function setBattleActive(active) {
    battleActive.value = active;
    
    // 如果战斗结束，清理战斗数据
    if (!active) {
      currentBattleId.value = null;
    }
  }
  
  // 结束战斗
  function endBattle(result) {
    battleData.result = result;
    battleData.endTime = Date.now();
    battleActive.value = false;
    
    // 处理战斗奖励
    if (result === 'win' && battleData.rewards) {
      updatePlayerResources(battleData.rewards);
    }
  }
  
  // 更新玩家资源（战斗奖励等）
  function updatePlayerResources(rewards) {
    if (rewards.gold) {
      resources.gold += rewards.gold;
    }
    
    if (rewards.diamond) {
      resources.diamond += rewards.diamond;
    }
    
    if (rewards.exp && currentCharacter.value) {
      // 更新角色经验
      const character = characters.value.find(char => char.id === currentCharacterId.value);
      if (character) {
        character.exp += rewards.exp;
        
        // 检查是否升级
        if (character.exp >= character.nextLevelExp) {
          character.level += 1;
          character.exp -= character.nextLevelExp;
          character.nextLevelExp = Math.floor(100 * Math.pow(1.5, character.level - 1));
          
          // 显示升级通知
          notificationStore.addNotification({
            type: 'success',
            message: `恭喜！${character.name}升级到${character.level}级`
          });
        }
      }
    }
    
    // 显示奖励通知
    let rewardMessage = '获得奖励：';
    if (rewards.gold) rewardMessage += `${rewards.gold}金币 `;
    if (rewards.diamond) rewardMessage += `${rewards.diamond}钻石 `;
    if (rewards.exp) rewardMessage += `${rewards.exp}经验 `;
    
    notificationStore.addNotification({
      type: 'success',
      message: rewardMessage
    });
  }
  
  // 创建支付订单
  async function createPaymentOrder(orderData) {
    try {
      const response = await api.payment.createOrder(orderData);
      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    }
  }
  
  // 兑换CDK
  async function redeemCDK(code) {
    try {
      const response = await api.game.redeemCDK({ code });
      
      // 更新资源
      if (response.data.rewards) {
        updatePlayerResources(response.data.rewards);
      }
      
      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    }
  }
  
  // 初始化游戏状态
  async function initialize() {
    if (gameInitialized.value) return;
    
    gameLoading.value = true;
    try {
      // 并行加载资源和角色
      await Promise.all([
        loadResources(),
        loadCharacters()
      ]);
      
      gameInitialized.value = true;
    } catch (error) {
      console.error('初始化游戏状态失败', error);
    } finally {
      gameLoading.value = false;
    }
  }

  return {
    // 状态
    gameActive,
    gameLoading,
    gameInitialized,
    resources,
    characters,
    currentCharacterId,
    characterLoading,
    equipments,
    equipmentLoading,
    battleActive,
    currentBattleId,
    battleData,
    
    // 计算属性
    currentCharacter,
    energyRecoveryTime,
    isBattleEnded,
    
    // 方法
    setGameActive,
    loadResources,
    updateResources,
    loadCharacters,
    selectCharacter,
    loadEquipments,
    equipItem,
    unequipItem,
    startBattle,
    setBattleActive,
    endBattle,
    updatePlayerResources,
    createPaymentOrder,
    redeemCDK,
    initialize
  };
}); 