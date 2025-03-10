<template>
    <div class="equipment-container">
      <div class="equipment-header">
        <h1 class="page-title">装备管理</h1>
        <div class="character-selector">
          <span class="selector-label">选择角色:</span>
          <el-select v-model="selectedCharacterId" placeholder="选择角色" @change="handleCharacterChange">
            <el-option
              v-for="char in characters"
              :key="char.id"
              :label="char.name"
              :value="char.id"
            >
              <div class="character-option">
                <el-avatar :size="30" :src="char.avatar"></el-avatar>
                <span>{{ char.name }} (Lv.{{ char.level }})</span>
              </div>
            </el-option>
          </el-select>
        </div>
      </div>
      
      <el-row :gutter="20" class="equipment-content">
        <!-- 左侧：装备槽位 -->
        <el-col :xs="24" :sm="24" :md="10" :lg="8">
          <div class="equipment-slots">
            <h2 class="section-title">已装备</h2>
            <div class="character-preview">
              <div class="character-model" :style="{ backgroundImage: `url(${selectedCharacter?.model || '/assets/character/default-model.png'})` }">
                <!-- 装备槽位 -->
                <div 
                  v-for="slot in equipmentSlots" 
                  :key="slot.id"
                  class="equipment-slot"
                  :class="[slot.id, { 'has-item': hasEquipment(slot.id) }]"
                  @click="selectSlot(slot.id)"
                >
                  <el-tooltip :content="getSlotTooltip(slot.id)" placement="top" :disabled="!hasEquipment(slot.id)">
                    <div class="slot-content">
                      <img 
                        v-if="hasEquipment(slot.id)" 
                        :src="getEquipmentImage(slot.id)" 
                        :alt="getEquipmentName(slot.id)"
                        class="equipment-image"
                      />
                      <div v-else class="slot-placeholder">
                        <el-icon><Plus /></el-icon>
                      </div>
                    </div>
                  </el-tooltip>
                </div>
              </div>
            </div>
            
            <!-- 装备属性总览 -->
            <div class="equipment-stats">
              <h3>装备属性加成</h3>
              <el-divider></el-divider>
              <div class="stats-list">
                <div class="stat-item" v-for="(value, key) in equipmentStats" :key="key">
                  <span class="stat-name">{{ getStatName(key) }}:</span>
                  <span class="stat-value" :class="{ 'positive': value > 0, 'negative': value < 0 }">
                    {{ value > 0 ? '+' : '' }}{{ value }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </el-col>
        
        <!-- 右侧：背包装备列表 -->
        <el-col :xs="24" :sm="24" :md="14" :lg="16">
          <div class="equipment-inventory">
            <div class="inventory-header">
              <h2 class="section-title">背包装备</h2>
              <div class="inventory-filters">
                <el-select v-model="filterType" placeholder="装备类型" clearable>
                  <el-option
                    v-for="type in equipmentTypes"
                    :key="type.value"
                    :label="type.label"
                    :value="type.value"
                  ></el-option>
                </el-select>
                
                <el-select v-model="sortBy" placeholder="排序方式">
                  <el-option label="等级 (高到低)" value="level-desc"></el-option>
                  <el-option label="等级 (低到高)" value="level-asc"></el-option>
                  <el-option label="品质 (高到低)" value="quality-desc"></el-option>
                  <el-option label="品质 (低到高)" value="quality-asc"></el-option>
                  <el-option label="获得时间 (新到旧)" value="time-desc"></el-option>
                  <el-option label="获得时间 (旧到新)" value="time-asc"></el-option>
                </el-select>
                
                <el-input
                  v-model="searchQuery"
                  placeholder="搜索装备"
                  clearable
                  prefix-icon="Search"
                ></el-input>
              </div>
            </div>
            
            <div class="inventory-content">
              <el-empty v-if="filteredInventory.length === 0" description="没有找到符合条件的装备"></el-empty>
              
              <div v-else class="inventory-grid">
                <div 
                  v-for="item in filteredInventory" 
                  :key="item.id"
                  class="inventory-item"
                  :class="[`quality-${item.quality}`, { 'selected': selectedItem?.id === item.id }]"
                  @click="selectItem(item)"
                >
                  <div class="item-image-container">
                    <img :src="item.image" :alt="item.name" class="item-image" />
                    <div class="item-level">Lv.{{ item.level }}</div>
                  </div>
                  <div class="item-info">
                    <div class="item-name">{{ item.name }}</div>
                    <div class="item-type">{{ getTypeName(item.type) }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>
      
      <!-- 底部：装备详情和操作 -->
      <div class="equipment-details" v-if="selectedItem">
        <div class="details-header">
          <h3 class="item-name" :class="`quality-${selectedItem.quality}`">{{ selectedItem.name }}</h3>
          <div class="item-basic-info">
            <span class="item-level">等级要求: {{ selectedItem.levelReq }}</span>
            <span class="item-type">{{ getTypeName(selectedItem.type) }}</span>
            <span class="item-quality">{{ getQualityName(selectedItem.quality) }}</span>
          </div>
        </div>
        
        <el-divider></el-divider>
        
        <div class="details-content">
          <div class="item-stats">
            <div class="stat-item" v-for="(value, key) in selectedItem.stats" :key="key">
              <span class="stat-name">{{ getStatName(key) }}:</span>
              <span class="stat-value" :class="{ 'positive': value > 0, 'negative': value < 0 }">
                {{ value > 0 ? '+' : '' }}{{ value }}
              </span>
            </div>
          </div>
          
          <div class="item-description" v-if="selectedItem.description">
            <p>{{ selectedItem.description }}</p>
          </div>
          
          <div class="item-special" v-if="selectedItem.special">
            <div class="special-title">特殊效果</div>
            <p>{{ selectedItem.special }}</p>
          </div>
        </div>
        
        <div class="details-actions">
          <el-button 
            type="primary" 
            @click="equipItem" 
            :disabled="!canEquip"
          >
            装备
          </el-button>
          
          <el-button 
            type="danger" 
            @click="unequipItem" 
            :disabled="!isEquipped"
          >
            卸下
          </el-button>
          
          <el-button 
            @click="enhanceItem" 
            :disabled="!canEnhance"
          >
            强化
          </el-button>
          
          <el-button 
            @click="sellItem" 
            :disabled="isEquipped"
          >
            出售 ({{ selectedItem.sellPrice }}金币)
          </el-button>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted, watch } from 'vue';
  import { useGameStore } from '@/stores/game';
  import { useNotificationStore } from '@/stores/notification';
  import { Plus, Search } from '@element-plus/icons-vue';
  
  // 状态管理
  const gameStore = useGameStore();
  const notificationStore = useNotificationStore();
  
  // 角色数据
  const characters = computed(() => gameStore.characters);
  const selectedCharacterId = ref(null);
  const selectedCharacter = computed(() => {
    if (!selectedCharacterId.value) return null;
    return characters.value.find(char => char.id === selectedCharacterId.value);
  });
  
  // 装备槽位
  const equipmentSlots = [
    { id: 'head', name: '头部' },
    { id: 'neck', name: '项链' },
    { id: 'shoulder', name: '肩部' },
    { id: 'chest', name: '胸甲' },
    { id: 'back', name: '背部' },
    { id: 'wrist', name: '护腕' },
    { id: 'hands', name: '手套' },
    { id: 'waist', name: '腰带' },
    { id: 'legs', name: '腿甲' },
    { id: 'feet', name: '靴子' },
    { id: 'ring1', name: '戒指1' },
    { id: 'ring2', name: '戒指2' },
    { id: 'trinket', name: '饰品' },
    { id: 'mainHand', name: '主手' },
    { id: 'offHand', name: '副手' }
  ];
  
  // 装备类型
  const equipmentTypes = [
    { value: 'head', label: '头盔' },
    { value: 'neck', label: '项链' },
    { value: 'shoulder', label: '肩甲' },
    { value: 'chest', label: '胸甲' },
    { value: 'back', label: '披风' },
    { value: 'wrist', label: '护腕' },
    { value: 'hands', label: '手套' },
    { value: 'waist', label: '腰带' },
    { value: 'legs', label: '腿甲' },
    { value: 'feet', label: '靴子' },
    { value: 'ring', label: '戒指' },
    { value: 'trinket', label: '饰品' },
    { value: 'weapon', label: '武器' },
    { value: 'shield', label: '盾牌' },
    { value: 'offhand', label: '副手物品' }
  ];
  
  // 背包过滤和排序
  const filterType = ref('');
  const sortBy = ref('level-desc');
  const searchQuery = ref('');
  
  // 模拟背包装备数据
  const inventory = ref([
    {
      id: 'e001',
      name: '龙鳞头盔',
      type: 'head',
      level: 10,
      levelReq: 8,
      quality: 4,
      image: '/assets/equipment/dragon-helm.png',
      stats: {
        armor: 25,
        strength: 5,
        vitality: 8
      },
      description: '由远古龙鳞打造的头盔，能够提供极佳的防护。',
      special: '受到火焰伤害减少10%',
      sellPrice: 120
    },
    {
      id: 'e002',
      name: '精钢胸甲',
      type: 'chest',
      level: 12,
      levelReq: 10,
      quality: 3,
      image: '/assets/equipment/steel-chest.png',
      stats: {
        armor: 40,
        strength: 3,
        vitality: 12
      },
      sellPrice: 150
    },
    {
      id: 'e003',
      name: '迅捷靴',
      type: 'feet',
      level: 8,
      levelReq: 5,
      quality: 2,
      image: '/assets/equipment/swift-boots.png',
      stats: {
        armor: 10,
        agility: 8,
        speed: 5
      },
      special: '移动速度提高5%',
      sellPrice: 80
    },
    {
      id: 'e004',
      name: '火焰法杖',
      type: 'weapon',
      level: 15,
      levelReq: 12,
      quality: 4,
      image: '/assets/equipment/fire-staff.png',
      stats: {
        damage: 25,
        intelligence: 12,
        critChance: 5
      },
      special: '火焰技能伤害提高15%',
      sellPrice: 200
    },
    {
      id: 'e005',
      name: '守护者盾牌',
      type: 'shield',
      level: 14,
      levelReq: 10,
      quality: 3,
      image: '/assets/equipment/guardian-shield.png',
      stats: {
        armor: 30,
        blockChance: 15,
        vitality: 6
      },
      sellPrice: 180
    }
  ]);
  
  // 过滤后的背包
  const filteredInventory = computed(() => {
    let result = [...inventory.value];
    
    // 按类型过滤
    if (filterType.value) {
      result = result.filter(item => item.type === filterType.value);
    }
    
    // 按名称搜索
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      result = result.filter(item => 
        item.name.toLowerCase().includes(query) || 
        (item.description && item.description.toLowerCase().includes(query))
      );
    }
    
    // 排序
    result.sort((a, b) => {
      switch (sortBy.value) {
        case 'level-desc':
          return b.level - a.level;
        case 'level-asc':
          return a.level - b.level;
        case 'quality-desc':
          return b.quality - a.quality;
        case 'quality-asc':
          return a.quality - b.quality;
        case 'time-desc':
          return b.id.localeCompare(a.id);
        case 'time-asc':
          return a.id.localeCompare(b.id);
        default:
          return 0;
      }
    });
    
    return result;
  });
  
  // 选中的装备槽和物品
  const selectedSlotId = ref(null);
  const selectedItem = ref(null);
  
  // 装备属性总览
  const equipmentStats = computed(() => {
    // 实际项目中应该从角色的已装备装备中计算
    return {
      armor: 105,
      strength: 8,
      agility: 5,
      intelligence: 3,
      vitality: 15,
      critChance: 2,
      blockChance: 10
    };
  });
  
  // 是否已装备
  const isEquipped = computed(() => {
    if (!selectedItem.value || !selectedCharacter.value) return false;
    
    // 实际项目中应该检查角色的已装备装备
    return false;
  });
  
  // 是否可以装备
  const canEquip = computed(() => {
    if (!selectedItem.value || !selectedCharacter.value) return false;
    
    // 检查等级要求
    if (selectedCharacter.value.level < selectedItem.value.levelReq) return false;
    
    // 检查职业要求（如果有）
    // ...
    
    return true;
  });
  
  // 是否可以强化
  const canEnhance = computed(() => {
    if (!selectedItem.value) return false;
    
    // 实际项目中应该检查强化条件
    return true;
  });
  
  // 方法
  // 选择角色
  const handleCharacterChange = (characterId) => {
    selectedCharacterId.value = characterId;
    // 加载角色装备数据
    // ...
  };
  
  // 选择装备槽
  const selectSlot = (slotId) => {
    selectedSlotId.value = slotId;
    
    // 如果槽位有装备，选中该装备
    const equippedItem = getEquippedItem(slotId);
    if (equippedItem) {
      selectedItem.value = equippedItem;
    } else {
      // 过滤显示可装备在该槽位的物品
      filterType.value = slotId;
    }
  };
  
  // 选择物品
  const selectItem = (item) => {
    selectedItem.value = item;
    
    // 如果物品类型与当前选中的槽位匹配，保持槽位选中
    if (item.type === selectedSlotId.value) {
      // 保持当前槽位选中
    } else {
      // 根据物品类型选择对应的槽位
      selectedSlotId.value = item.type;
    }
  };
  
  // 装备物品
  const equipItem = () => {
    if (!selectedItem.value || !selectedCharacter.value) return;
    
    // 调用API装备物品
    // 模拟API调用
    setTimeout(() => {
      notificationStore.addSuccessNotification(`成功装备 ${selectedItem.value.name}`);
      
      // 更新装备状态
      // ...
    }, 500);
  };
  
  // 卸下物品
  const unequipItem = () => {
    if (!selectedItem.value || !selectedCharacter.value) return;
    
    // 调用API卸下物品
    // 模拟API调用
    setTimeout(() => {
      notificationStore.addSuccessNotification(`成功卸下 ${selectedItem.value.name}`);
      
      // 更新装备状态
      // ...
    }, 500);
  };
  
  // 强化物品
  const enhanceItem = () => {
    if (!selectedItem.value) return;
    
    // 调用API强化物品
    // 模拟API调用
    setTimeout(() => {
      notificationStore.addSuccessNotification(`成功强化 ${selectedItem.value.name}`);
      
      // 更新物品属性
      // ...
    }, 500);
  };
  
  // 出售物品
  const sellItem = () => {
    if (!selectedItem.value || isEquipped.value) return;
    
    // 调用API出售物品
    // 模拟API调用
    setTimeout(() => {
      notificationStore.addSuccessNotification(`成功出售 ${selectedItem.value.name}，获得 ${selectedItem.value.sellPrice} 金币`);
      
      // 更新金币和背包
      gameStore.updateResources({
        gold: gameStore.resources.gold + selectedItem.value.sellPrice
      });
      
      // 从背包中移除物品
      inventory.value = inventory.value.filter(item => item.id !== selectedItem.value.id);
      selectedItem.value = null;
    }, 500);
  };
  
  // 辅助方法
  // 检查槽位是否有装备
  const hasEquipment = (slotId) => {
    // 实际项目中应该检查角色的已装备装备
    return ['head', 'chest', 'feet', 'mainHand'].includes(slotId);
  };
  
  // 获取装备图片
  const getEquipmentImage = (slotId) => {
    // 实际项目中应该返回角色在该槽位的装备图片
    const images = {
      head: '/assets/equipment/dragon-helm.png',
      chest: '/assets/equipment/steel-chest.png',
      feet: '/assets/equipment/swift-boots.png',
      mainHand: '/assets/equipment/fire-staff.png'
    };
    
    return images[slotId] || '';
  };
  
  // 获取装备名称
  const getEquipmentName = (slotId) => {
    // 实际项目中应该返回角色在该槽位的装备名称
    const names = {
      head: '龙鳞头盔',
      chest: '精钢胸甲',
      feet: '迅捷靴',
      mainHand: '火焰法杖'
    };
    
    return names[slotId] || '';
  };
  
  // 获取槽位提示
  const getSlotTooltip = (slotId) => {
    if (hasEquipment(slotId)) {
      return getEquipmentName(slotId);
    } else {
      const slot = equipmentSlots.find(s => s.id === slotId);
      return `${slot?.name || slotId} (空)`;
    }
  };
  
  // 获取已装备物品
  const getEquippedItem = (slotId) => {
    // 实际项目中应该返回角色在该槽位的装备
    const equippedItems = {
      head: inventory.value.find(item => item.id === 'e001'),
      chest: inventory.value.find(item => item.id === 'e002'),
      feet: inventory.value.find(item => item.id === 'e003'),
      mainHand: inventory.value.find(item => item.id === 'e004')
    };
    
    return equippedItems[slotId] || null;
  };
  
  // 获取属性名称
  const getStatName = (key) => {
    const statNames = {
      armor: '护甲',
      strength: '力量',
      agility: '敏捷',
      intelligence: '智力',
      vitality: '体力',
      critChance: '暴击率',
      blockChance: '格挡率',
      damage: '伤害',
      speed: '速度'
    };
    
    return statNames[key] || key;
  };
  
  // 获取类型名称
  const getTypeName = (type) => {
    const typeObj = equipmentTypes.find(t => t.value === type);
    return typeObj ? typeObj.label : type;
  };
  
  // 获取品质名称
  const getQualityName = (quality) => {
    const qualityNames = {
      1: '普通',
      2: '优秀',
      3: '精良',
      4: '史诗',
      5: '传说'
    };
    
    return qualityNames[quality] || '未知';
  };
  
  // 生命周期钩子
  onMounted(async () => {
    // 加载角色数据
    if (characters.value.length === 0) {
      await gameStore.loadCharacters();
    }
    
    // 默认选择第一个角色
    if (characters.value.length > 0 && !selectedCharacterId.value) {
      selectedCharacterId.value = characters.value[0].id;
    }
    
    // 加载装备数据
    // ...
  });
  
  // 监听角色变化
  watch(selectedCharacterId, (newId) => {
    if (newId) {
      // 加载角色装备数据
      // ...
    }
  });
  </script>
  
  <style scoped>
  .equipment-container {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .equipment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .page-title {
    font-size: 24px;
    margin: 0;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  
  .character-selector {
    display: flex;
    align-items: center;
  }
  
  .selector-label {
    margin-right: 10px;
    color: #fff;
  }
  
  .character-option {
    display: flex;
    align-items: center;
  }
  
  .character-option span {
    margin-left: 10px;
  }
  
  .equipment-content {
    margin-bottom: 20px;
  }
  
  .section-title {
    font-size: 18px;
    margin: 0 0 15px;
    color: #333;
  }
  
  /* 装备槽位样式 */
  .equipment-slots {
    background-color: rgba(255, 255, 255, 0.9);
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  }
  
  .character-preview {
    position: relative;
    margin-bottom: 20px;
  }
  
  .character-model {
    width: 100%;
    height: 400px;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    position: relative;
  }
  
  .equipment-slot {
    position: absolute;
    width: 50px;
    height: 50px;
    border-radius: 4px;
    background-color: rgba(0, 0, 0, 0.2);
    border: 2px solid rgba(255, 255, 255, 0.5);
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: all 0.3s;
  }
  
  .equipment-slot:hover {
    transform: scale(1.1);
    z-index: 10;
    box-shadow: 0 0 10px rgba(64, 158, 255, 0.5);
  }
  
  .equipment-slot.has-item {
    background-color: rgba(0, 0, 0, 0.5);
    border-color: gold;
  }
  
  .slot-content {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  
  .equipment-image {
    max-width: 100%;
    max-height: 100%;
  }
  
  .slot-placeholder {
    color: rgba(255, 255, 255, 0.7);
    font-size: 20px;
  }
  
  /* 装备槽位位置 */
  .head {
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
  }
  
  .neck {
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
  }
  
  .shoulder {
    top: 70px;
    left: calc(50% - 60px);
  }
  
  .chest {
    top: 120px;
    left: 50%;
    transform: translateX(-50%);
  }
  
  .back {
    top: 120px;
    left: calc(50% + 60px);
  }
  
  .wrist {
    top: 170px;
    left: calc(50% - 60px);
  }
  
  .hands {
    top: 220px;
    left: calc(50% - 60px);
  }
  
  .waist {
    top: 170px;
    left: 50%;
    transform: translateX(-50%);
  }
  
  .legs {
    top: 220px;
    left: 50%;
    transform: translateX(-50%);
  }
  
  .feet {
    top: 270px;
    left: 50%;
    transform: translateX(-50%);
  }
  
  .ring1 {
    top: 170px;
    left: calc(50% + 60px);
  }
  
  .ring2 {
    top: 220px;
    left: calc(50% + 60px);
  }
  
  .trinket {
    top: 270px;
    left: calc(50% + 60px);
  }
  
  .mainHand {
    top: 170px;
    left: calc(50% - 120px);
  }
  
  .offHand {
    top: 170px;
    left: calc(50% + 120px);
  }
  
  /* 装备属性样式 */
  .equipment-stats {
    background-color: #f5f7fa;
    border-radius: 6px;
    padding: 15px;
  }
  
  .equipment-stats h3 {
    margin: 0;
    font-size: 16px;
    color: #333;
  }
  
  .stats-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 10px;
  }
  
  .stat-item {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
  }
  
  .stat-name {
    color: #606266;
  }
  
  .stat-value {
    font-weight: bold;
  }
  
  .stat-value.positive {
    color: #67c23a;
  }
  
  .stat-value.negative {
    color: #f56c6c;
  }
  
  /* 背包装备列表样式 */
  .equipment-inventory {
    background-color: rgba(255, 255, 255, 0.9);
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  
  .inventory-header {
    margin-bottom: 15px;
  }
  
  .inventory-filters {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }
  
  .inventory-filters .el-select,
  .inventory-filters .el-input {
    width: 33%;
  }
  
  .inventory-content {
    flex: 1;
    overflow-y: auto;
  }
  
  .inventory-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 15px;
  }
  
  .inventory-item {
    background-color: #f5f7fa;
    border-radius: 6px;
    padding: 10px;
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
  }
  
  .inventory-item:hover {
    transform: translateY(-3px);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1);
  }
  
  .inventory-item.selected {
    border-color: #409eff;
    background-color: #ecf5ff;
  }
  
  .item-image-container {
    position: relative;
    width: 100%;
    height: 80px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 10px;
  }
  
  .item-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  
  .item-level {
    position: absolute;
    bottom: -5px;
    right: -5px;
    background-color: #409eff;
    color: white;
    border-radius: 10px;
    padding: 2px 6px;
    font-size: 12px;
  }
  
  .item-info {
    text-align: center;
  }
  
  .item-name {
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .item-type {
    font-size: 12px;
    color: #909399;
  }
  
  /* 装备品质颜色 */
  .quality-1 {
    color: #7f7f7f;
  }
  
  .quality-2 {
    color: #2db7f5;
  }
  
  .quality-3 {
    color: #722ed1;
  }
  
  .quality-4 {
    color: #f5a623;
  }
  
  .quality-5 {
    color: #ed4014;
  }
  
  .inventory-item.quality-1 {
    background-color: #f5f5f5;
  }
  
  .inventory-item.quality-2 {
    background-color: #e6f7ff;
  }
  
  .inventory-item.quality-3 {
    background-color: #f9f0ff;
  }
  
  .inventory-item.quality-4 {
    background-color: #fff7e6;
  }
  
  .inventory-item.quality-5 {
    background-color: #fff1f0;
  }
  
  /* 装备详情样式 */
  .equipment-details {
    background-color: rgba(255, 255, 255, 0.9);
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
    margin-top: 20px;
  }
  
  .details-header {
    display: flex;
    flex-direction: column;
  }
  
  .details-header .item-name {
    font-size: 20px;
    margin: 0 0 10px;
    text-align: left;
  }
  
  .item-basic-info {
    display: flex;
    gap: 15px;
    font-size: 14px;
    color: #606266;
  }
  
  .details-content {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin: 15px 0;
  }
  
  .item-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  
  .item-description {
    font-size: 14px;
    color: #606266;
    line-height: 1.5;
    padding: 10px;
    background-color: #f5f7fa;
    border-radius: 4px;
    border-left: 3px solid #409eff;
  }
  
  .item-special {
    padding: 10px;
    background-color: #fff7e6;
    border-radius: 4px;
    border-left: 3px solid #f5a623;
  }
  
  .special-title {
    font-weight: bold;
    margin-bottom: 5px;
    color: #f5a623;
  }
  
  .details-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 15px;
  }
  
  /* 响应式样式 */
  @media (max-width: 768px) {
    .equipment-header {
      flex-direction: column;
      align-items: flex-start;
    }
    
    .character-selector {
      margin-top: 10px;
      width: 100%;
    }
    
    .inventory-filters {
      flex-direction: column;
    }
    
    .inventory-filters .el-select,
    .inventory-filters .el-input {
      width: 100%;
    }
    
    .item-stats {
      grid-template-columns: repeat(2, 1fr);
    }
    
    .details-actions {
      flex-wrap: wrap;
    }
  }
  </style>
  