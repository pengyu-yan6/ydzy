<template>
  <div class="pve-battle-container">
    <!-- 战前准备界面 -->
    <div v-if="!battleStarted" class="battle-preparation">
      <div class="preparation-header">
        <h1 class="page-title">战斗准备</h1>
        <div class="energy-info">
          <img src="@/assets/icons/energy.png" class="energy-icon" />
          <span>能量: {{ resources.energy }}/{{ resources.maxEnergy }}</span>
          <el-tooltip content="每次战斗消耗10点能量" placement="top">
            <el-icon><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
      </div>
      
      <el-row :gutter="20">
        <!-- 左侧: 选择关卡 -->
        <el-col :xs="24" :sm="24" :md="10" :lg="8">
          <div class="stage-selection">
            <h2 class="section-title">选择关卡</h2>
            
            <div class="stage-tabs">
              <el-tabs v-model="selectedChapter">
                <el-tab-pane 
                  v-for="chapter in availableChapters" 
                  :key="chapter.id" 
                  :label="chapter.name" 
                  :name="chapter.id"
                >
                  <div class="stage-list">
                    <div 
                      v-for="stage in chapter.stages" 
                      :key="stage.id"
                      class="stage-item"
                      :class="{ 
                        'selected': selectedStage?.id === stage.id,
                        'locked': stage.locked,
                        'completed': stage.completed
                      }"
                      @click="selectStage(stage)"
                    >
                      <div class="stage-info">
                        <div class="stage-name">{{ stage.name }}</div>
                        <div class="stage-difficulty">
                          <el-rate 
                            v-model="stage.difficulty" 
                            disabled 
                            show-score 
                            text-color="#ff9900"
                            score-template=""
                          />
                        </div>
                      </div>
                      
                      <div class="stage-status">
                        <el-tag v-if="stage.locked" type="info" size="small">未解锁</el-tag>
                        <el-tag v-else-if="stage.completed" type="success" size="small">已完成</el-tag>
                        <el-icon v-else><ArrowRight /></el-icon>
                      </div>
                    </div>
                  </div>
                </el-tab-pane>
              </el-tabs>
            </div>
            
            <!-- 关卡详情 -->
            <div v-if="selectedStage" class="stage-details">
              <h3>{{ selectedStage.name }}</h3>
              <p>{{ selectedStage.description }}</p>
              
              <div class="stage-requirements" v-if="selectedStage.requirements">
                <div class="requirement-title">挑战要求:</div>
                <div class="requirement-item" v-if="selectedStage.requirements.level">
                  <span>等级要求: {{ selectedStage.requirements.level }}</span>
                  <el-tag 
                    size="small" 
                    :type="characterLevel >= selectedStage.requirements.level ? 'success' : 'danger'"
                  >
                    {{ characterLevel >= selectedStage.requirements.level ? '满足' : '不满足' }}
                  </el-tag>
                </div>
                <div class="requirement-item" v-if="selectedStage.requirements.power">
                  <span>战力要求: {{ selectedStage.requirements.power }}</span>
                  <el-tag 
                    size="small" 
                    :type="characterPower >= selectedStage.requirements.power ? 'success' : 'danger'"
                  >
                    {{ characterPower >= selectedStage.requirements.power ? '满足' : '不满足' }}
                  </el-tag>
                </div>
              </div>
              
              <div class="stage-rewards">
                <div class="rewards-title">通关奖励:</div>
                <div class="rewards-list">
                  <div class="reward-item" v-if="selectedStage.rewards.exp">
                    <img src="@/assets/icons/exp.png" class="reward-icon" />
                    <span>经验: {{ selectedStage.rewards.exp }}</span>
                  </div>
                  <div class="reward-item" v-if="selectedStage.rewards.gold">
                    <img src="@/assets/icons/gold.png" class="reward-icon" />
                    <span>金币: {{ selectedStage.rewards.gold }}</span>
                  </div>
                  <div class="reward-item" v-if="selectedStage.rewards.items">
                    <img src="@/assets/icons/chest.png" class="reward-icon" />
                    <span>物品: {{ selectedStage.rewards.items }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-col>
        
        <!-- 右侧: 选择阵容 -->
        <el-col :xs="24" :sm="24" :md="14" :lg="16">
          <div class="team-selection">
            <h2 class="section-title">选择阵容</h2>
            
            <div class="character-grid">
              <div 
                v-for="(position, index) in battlePositions" 
                :key="index"
                class="position-cell"
                :class="{ 'occupied': position.character }"
                @click="selectPosition(index)"
              >
                <div v-if="position.character" class="character-preview">
                  <el-avatar 
                    :size="60" 
                    :src="position.character.avatar"
                    class="character-avatar"
                  />
                  <div class="character-info">
                    <div class="character-name">{{ position.character.name }}</div>
                    <div class="character-level">Lv.{{ position.character.level }}</div>
                  </div>
                  <div class="remove-character" @click.stop="removeCharacter(index)">
                    <el-icon><Close /></el-icon>
                  </div>
                </div>
                <div v-else class="empty-position">
                  <el-icon><Plus /></el-icon>
                  <span>添加英雄</span>
                </div>
              </div>
            </div>
            
            <!-- 可选角色列表 -->
            <div class="available-characters">
              <h3>可用英雄</h3>
              <div class="character-list">
                <div 
                  v-for="char in availableCharacters" 
                  :key="char.id"
                  class="character-card"
                  :class="{ 'selected': selectedCharacter?.id === char.id }"
                  @click="selectCharacter(char)"
                >
                  <el-avatar :size="50" :src="char.avatar" />
                  <div class="character-card-info">
                    <div class="character-card-name">{{ char.name }}</div>
                    <div class="character-card-details">
                      <span>Lv.{{ char.level }}</span>
                      <span>{{ char.class }}</span>
                    </div>
                  </div>
                  <div class="character-power">{{ char.power }}</div>
                </div>
              </div>
            </div>
            
            <!-- 团队信息 -->
            <div class="team-info">
              <div class="team-power">
                <span>团队战力:</span>
                <span class="power-value">{{ totalTeamPower }}</span>
              </div>
              
              <div class="team-composition">
                <span>阵容搭配:</span>
                <div class="composition-tags">
                  <el-tag 
                    v-for="(count, classType) in teamComposition" 
                    :key="classType"
                    :type="getCompositionTagType(classType, count)"
                    size="small"
                  >
                    {{ classType }} x{{ count }}
                  </el-tag>
                </div>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>
      
      <!-- 底部操作按钮 -->
      <div class="battle-actions">
        <el-button @click="goBack">返回</el-button>
        <el-button 
          type="primary" 
          @click="startBattle"
          :disabled="!canStartBattle"
        >
          开始战斗
        </el-button>
      </div>
      
      <!-- 角色选择对话框 -->
      <el-dialog 
        v-model="characterSelectionVisible" 
        title="选择英雄"
        width="500px"
      >
        <div class="character-selection-list">
          <div 
            v-for="char in characters" 
            :key="char.id"
            class="character-selection-item"
            :class="{ 'disabled': isCharacterInBattle(char.id) }"
            @click="addCharacterToPosition(char)"
          >
            <el-avatar :size="40" :src="char.avatar" />
            <div class="character-selection-info">
              <div class="character-selection-name">{{ char.name }}</div>
              <div class="character-selection-details">
                <span>Lv.{{ char.level }}</span>
                <span>{{ char.class }}</span>
                <span>战力: {{ char.power }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-dialog>
    </div>
    
    <!-- 战斗界面 -->
    <div v-else class="battle-gameplay">
      <div class="battle-header">
        <h2 class="battle-title">{{ selectedStage?.name }}</h2>
        <div class="battle-round">回合: {{ currentRound }}/{{ maxRounds }}</div>
      </div>
      
      <!-- 战场界面 -->
      <div class="battle-field">
        <!-- 战斗动画区域 (这里实际项目中可以用Phaser等游戏引擎渲染) -->
        <div class="battle-animation" ref="battleAnimation">
          <canvas id="battleCanvas" width="800" height="400"></canvas>
        </div>
        
        <!-- 战斗日志 -->
        <div class="battle-log">
          <div class="log-header">
            <h3>战斗日志</h3>
            <el-button size="small" @click="clearLog">清空</el-button>
          </div>
          <div class="log-content" ref="logContent">
            <div 
              v-for="(log, index) in battleLogs" 
              :key="index"
              class="log-item"
              :class="log.type"
            >
              {{ log.message }}
            </div>
          </div>
        </div>
      </div>
      
      <!-- 战斗控制 -->
      <div class="battle-controls">
        <el-button 
          v-if="!battleEnded" 
          type="primary" 
          @click="nextRound"
          :loading="processing"
        >
          下一回合
        </el-button>
        <el-button 
          v-if="!battleEnded" 
          @click="autoPlay"
          :type="isAutoPlaying ? 'success' : 'default'"
          :loading="processing"
        >
          {{ isAutoPlaying ? '停止自动' : '自动战斗' }}
        </el-button>
        <el-button 
          v-if="!battleEnded" 
          type="danger" 
          @click="exitBattle"
        >
          退出战斗
        </el-button>
        <el-button 
          v-if="battleEnded" 
          type="primary" 
          @click="showResults"
        >
          查看结果
        </el-button>
      </div>
      
      <!-- 战斗角色状态 -->
      <div class="battle-status">
        <div class="team-status">
          <h3>我方阵容</h3>
          <div class="status-list">
            <div 
              v-for="unit in playerUnits" 
              :key="unit.id"
              class="status-item"
              :class="{ 'dead': unit.hp <= 0 }"
            >
              <el-avatar :size="30" :src="unit.avatar" />
              <div class="status-info">
                <div class="status-name">{{ unit.name }}</div>
                <el-progress 
                  :percentage="getHpPercentage(unit)" 
                  :color="getHpColor(unit)"
                  :format="() => `${unit.hp}/${unit.maxHp}`"
                  :stroke-width="10"
                />
              </div>
            </div>
          </div>
        </div>
        
        <div class="team-status enemy">
          <h3>敌方阵容</h3>
          <div class="status-list">
            <div 
              v-for="unit in enemyUnits" 
              :key="unit.id"
              class="status-item"
              :class="{ 'dead': unit.hp <= 0 }"
            >
              <el-avatar :size="30" :src="unit.avatar" />
              <div class="status-info">
                <div class="status-name">{{ unit.name }}</div>
                <el-progress 
                  :percentage="getHpPercentage(unit)" 
                  :color="getHpColor(unit)"
                  :format="() => `${unit.hp}/${unit.maxHp}`"
                  :stroke-width="10"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 战斗结果对话框 -->
      <el-dialog
        v-model="resultDialogVisible"
        :title="battleWon ? '战斗胜利！' : '战斗失败'"
        width="500px"
      >
        <div class="battle-result">
          <div class="result-icon" :class="{ 'win': battleWon, 'lose': !battleWon }">
            <i :class="battleWon ? 'el-icon-trophy' : 'el-icon-close'"></i>
          </div>
          
          <div v-if="battleWon" class="battle-rewards">
            <h3>获得奖励</h3>
            <div class="rewards-list">
              <div class="reward-item" v-if="battleRewards.exp">
                <img src="@/assets/icons/exp.png" class="reward-icon" />
                <span>经验: +{{ battleRewards.exp }}</span>
              </div>
              <div class="reward-item" v-if="battleRewards.gold">
                <img src="@/assets/icons/gold.png" class="reward-icon" />
                <span>金币: +{{ battleRewards.gold }}</span>
              </div>
              <div class="reward-item" v-if="battleRewards.items && battleRewards.items.length > 0">
                <img src="@/assets/icons/chest.png" class="reward-icon" />
                <span>获得物品:</span>
                <div class="items-list">
                  <div 
                    v-for="(item, index) in battleRewards.items" 
                    :key="index"
                    class="reward-item-detail"
                  >
                    <img :src="item.icon" class="item-icon" />
                    <span>{{ item.name }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="battle-statistics">
            <h3>战斗统计</h3>
            <div class="statistics-list">
              <div class="statistic-item">
                <span>战斗回合:</span>
                <span>{{ currentRound }}</span>
              </div>
              <div class="statistic-item">
                <span>造成伤害:</span>
                <span>{{ battleStats.damageDealt }}</span>
              </div>
              <div class="statistic-item">
                <span>承受伤害:</span>
                <span>{{ battleStats.damageTaken }}</span>
              </div>
              <div class="statistic-item">
                <span>治疗量:</span>
                <span>{{ battleStats.healing }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="replayBattle" v-if="battleWon">再战一次</el-button>
            <el-button @click="nextStage" v-if="battleWon && hasNextStage">下一关</el-button>
            <el-button 
              type="primary" 
              @click="returnToPreparation"
            >
              返回
            </el-button>
          </span>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '@/stores/game';
import { useNotificationStore } from '@/stores/notification';
import { QuestionFilled, ArrowRight, Plus, Close } from '@element-plus/icons-vue';

// 路由和状态
const router = useRouter();
const gameStore = useGameStore();
const notificationStore = useNotificationStore();

// 角色数据
const characters = computed(() => gameStore.characters);
const characterLevel = computed(() => {
  if (!gameStore.currentCharacter) return 1;
  return gameStore.currentCharacter.level;
});
const characterPower = computed(() => {
  // 实际项目中应该从角色属性计算战力
  return 1000;
});

// 资源数据
const resources = computed(() => gameStore.resources);

// 战斗准备状态
const battleStarted = ref(false);
const selectedChapter = ref('');
const selectedStage = ref(null);
const characterSelectionVisible = ref(false);
const selectedCharacter = ref(null);
const selectedPositionIndex = ref(-1);

// 战斗阵型位置 (3x3网格)
const battlePositions = reactive(Array(9).fill(null).map(() => ({ character: null })));

// 章节和关卡数据 (模拟数据)
const availableChapters = ref([
  {
    id: 'chapter1',
    name: '第一章: 觉醒',
    stages: [
      {
        id: 'stage1-1',
        name: '1-1 初始试炼',
        description: '初次接触战斗系统的简单试炼。',
        difficulty: 1,
        locked: false,
        completed: true,
        requirements: {
          level: 1,
          power: 500
        },
        rewards: {
          exp: 100,
          gold: 50,
          items: '随机装备 x1'
        }
      },
      {
        id: 'stage1-2',
        name: '1-2 森林遭遇',
        description: '在魔法森林中遭遇的神秘生物。',
        difficulty: 1.5,
        locked: false,
        completed: false,
        requirements: {
          level: 3,
          power: 600
        },
        rewards: {
          exp: 150,
          gold: 75,
          items: '随机装备 x1'
        }
      },
      {
        id: 'stage1-3',
        name: '1-3 黑暗洞穴',
        description: '探索古老洞穴中的未知危险。',
        difficulty: 2,
        locked: false,
        completed: false,
        requirements: {
          level: 5,
          power: 800
        },
        rewards: {
          exp: 200,
          gold: 100,
          items: '随机装备 x1'
        }
      },
      {
        id: 'stage1-4',
        name: '1-4 魔物巢穴',
        description: '深入洞穴深处，发现魔物的聚集地。',
        difficulty: 2.5,
        locked: true,
        completed: false,
        requirements: {
          level: 7,
          power: 1000
        },
        rewards: {
          exp: 250,
          gold: 125,
          items: '随机装备 x1'
        }
      }
    ]
  },
  {
    id: 'chapter2',
    name: '第二章: 成长',
    stages: [
      {
        id: 'stage2-1',
        name: '2-1 荒原探索',
        description: '踏入危险的荒原，寻找失落的遗迹。',
        difficulty: 3,
        locked: true,
        completed: false,
        requirements: {
          level: 10,
          power: 1200
        },
        rewards: {
          exp: 300,
          gold: 150,
          items: '随机装备 x1'
        }
      }
    ]
  }
]);

// 计算可用角色列表
const availableCharacters = computed(() => {
  // 过滤掉已经在战斗阵容中的角色
  const usedCharacterIds = battlePositions
    .filter(pos => pos.character)
    .map(pos => pos.character.id);
  
  return characters.value.filter(char => !usedCharacterIds.includes(char.id));
});

// 计算团队战力
const totalTeamPower = computed(() => {
  let power = 0;
  battlePositions.forEach(pos => {
    if (pos.character) {
      power += pos.character.power || 0;
    }
  });
  return power;
});

// 计算团队职业构成
const teamComposition = computed(() => {
  const composition = {};
  
  battlePositions.forEach(pos => {
    if (pos.character && pos.character.class) {
      const charClass = pos.character.class;
      composition[charClass] = (composition[charClass] || 0) + 1;
    }
  });
  
  return composition;
});

// 检查是否可以开始战斗
const canStartBattle = computed(() => {
  // 检查是否选择了关卡
  if (!selectedStage.value) return false;
  
  // 检查能量是否足够
  if (resources.value.energy < 10) return false;
  
  // 检查是否至少有一个角色
  const hasCharacter = battlePositions.some(pos => pos.character);
  if (!hasCharacter) return false;
  
  // 检查关卡要求
  if (selectedStage.value.locked) return false;
  
  if (selectedStage.value.requirements) {
    if (selectedStage.value.requirements.level > characterLevel.value) return false;
    if (selectedStage.value.requirements.power > totalTeamPower.value) return false;
  }
  
  return true;
});

// 战斗状态
const currentRound = ref(0);
const maxRounds = ref(20);
const battleLogs = ref([]);
const processing = ref(false);
const isAutoPlaying = ref(false);
const battleEnded = ref(false);
const battleWon = ref(false);
const resultDialogVisible = ref(false);
const playerUnits = ref([]);
const enemyUnits = ref([]);
const battleStats = reactive({
  damageDealt: 0,
  damageTaken: 0,
  healing: 0
});
const battleRewards = reactive({
  exp: 0,
  gold: 0,
  items: []
});
const autoPlayInterval = ref(null);
const logContent = ref(null);

// 检查是否有下一关
const hasNextStage = computed(() => {
  if (!selectedStage.value) return false;
  
  const currentChapter = availableChapters.value.find(c => c.id === selectedChapter.value);
  if (!currentChapter) return false;
  
  const currentStageIndex = currentChapter.stages.findIndex(s => s.id === selectedStage.value.id);
  if (currentStageIndex === -1 || currentStageIndex >= currentChapter.stages.length - 1) {
    // 当前章节已经是最后一关，检查是否有下一章节
    const currentChapterIndex = availableChapters.value.findIndex(c => c.id === selectedChapter.value);
    if (currentChapterIndex === -1 || currentChapterIndex >= availableChapters.value.length - 1) {
      return false;
    }
    
    // 检查下一章节的第一关是否解锁
    return !availableChapters.value[currentChapterIndex + 1].stages[0].locked;
  }
  
  // 检查当前章节的下一关是否解锁
  return !currentChapter.stages[currentStageIndex + 1].locked;
});

// 方法
// 角色选择相关
const selectStage = (stage) => {
  if (stage.locked) {
    notificationStore.addWarningNotification('该关卡尚未解锁');
    return;
  }
  
  selectedStage.value = stage;
};

const selectPosition = (index) => {
  selectedPositionIndex.value = index;
  characterSelectionVisible.value = true;
};

const selectCharacter = (character) => {
  selectedCharacter.value = character;
};

const addCharacterToPosition = (character) => {
  if (isCharacterInBattle(character.id)) {
    notificationStore.addWarningNotification('该角色已在阵容中');
    return;
  }
  
  if (selectedPositionIndex.value >= 0 && selectedPositionIndex.value < battlePositions.length) {
    battlePositions[selectedPositionIndex.value].character = character;
    characterSelectionVisible.value = false;
  }
};

const removeCharacter = (index) => {
  if (index >= 0 && index < battlePositions.length) {
    battlePositions[index].character = null;
  }
};

const isCharacterInBattle = (characterId) => {
  return battlePositions.some(pos => pos.character && pos.character.id === characterId);
};

// 职业组合类型
const getCompositionTagType = (classType, count) => {
  // 根据职业和数量返回不同的标签类型
  if (count >= 3) return 'success';
  if (count === 2) return 'warning';
  return 'info';
};

// 战斗控制相关
const startBattle = () => {
  if (!canStartBattle.value) return;
  
  // 扣除能量
  gameStore.updateResources({
    energy: resources.value.energy - 10
  });
  
  // 初始化战斗数据
  currentRound.value = 0;
  battleLogs.value = [];
  battleEnded.value = false;
  battleWon.value = false;
  
  // 设置战斗单位
  playerUnits.value = battlePositions
    .filter(pos => pos.character)
    .map(pos => ({
      ...pos.character,
      hp: pos.character.maxHp || 100,
      maxHp: pos.character.maxHp || 100,
      mp: pos.character.maxMp || 50,
      maxMp: pos.character.maxMp || 50,
      side: 'player'
    }));
  
  // 模拟敌方单位
  enemyUnits.value = [
    {
      id: 'e1',
      name: '魔法史莱姆',
      avatar: '/assets/enemies/slime.png',
      hp: 80,
      maxHp: 80,
      mp: 30,
      maxMp: 30,
      power: 300,
      side: 'enemy'
    },
    {
      id: 'e2',
      name: '骷髅战士',
      avatar: '/assets/enemies/skeleton.png',
      hp: 120,
      maxHp: 120,
      mp: 0,
      maxMp: 0,
      power: 400,
      side: 'enemy'
    },
    {
      id: 'e3',
      name: '哥布林',
      avatar: '/assets/enemies/goblin.png',
      hp: 60,
      maxHp: 60,
      mp: 10,
      maxMp: 10,
      power: 250,
      side: 'enemy'
    }
  ];
  
  // 重置战斗统计
  battleStats.damageDealt = 0;
  battleStats.damageTaken = 0;
  battleStats.healing = 0;
  
  // 添加战斗开始日志
  addBattleLog('system', '战斗开始！');
  
  // 开始战斗
  battleStarted.value = true;
  
  // 下一回合
  nextTick(() => {
    initBattleAnimation();
    nextRound();
  });
};

const nextRound = () => {
  if (battleEnded.value) return;
  
  processing.value = true;
  currentRound.value++;
  
  addBattleLog('system', `第 ${currentRound.value} 回合开始`);
  
  // 模拟战斗逻辑
  // 在实际项目中，这里应该有复杂的战斗计算逻辑
  setTimeout(() => {
    // 玩家行动
    playerAction();
    
    // 检查敌方是否全部阵亡
    if (isAllEnemyDefeated()) {
      endBattle(true);
      processing.value = false;
      return;
    }
    
    // 敌方行动
    enemyAction();
    
    // 检查玩家是否全部阵亡
    if (isAllPlayerDefeated()) {
      endBattle(false);
      processing.value = false;
      return;
    }
    
    // 检查回合数是否达到上限
    if (currentRound.value >= maxRounds.value) {
      addBattleLog('system', '回合数达到上限，战斗结束');
      endBattle(false);
    }
    
    processing.value = false;
    
    // 自动滚动日志到底部
    scrollLogToBottom();
    
    // 更新战斗动画
    updateBattleAnimation();
  }, 500);
};

const playerAction = () => {
  // 遍历所有存活的玩家单位，进行攻击
  for (const unit of playerUnits.value) {
    if (unit.hp <= 0) continue;
    
    // 随机选择一个敌人
    const aliveEnemies = enemyUnits.value.filter(e => e.hp > 0);
    if (aliveEnemies.length === 0) break;
    
    const targetIndex = Math.floor(Math.random() * aliveEnemies.length);
    const target = aliveEnemies[targetIndex];
    
    // 计算伤害
    const damage = calculateDamage(unit, target);
    target.hp = Math.max(0, target.hp - damage);
    
    // 更新统计
    battleStats.damageDealt += damage;
    
    // 添加日志
    addBattleLog('player', `${unit.name} 攻击 ${target.name}，造成 ${damage} 点伤害`);
    
    // 检查目标是否阵亡
    if (target.hp <= 0) {
      addBattleLog('system', `${target.name} 被击败了`);
    }
  }
};

const enemyAction = () => {
  // 遍历所有存活的敌方单位，进行攻击
  for (const unit of enemyUnits.value) {
    if (unit.hp <= 0) continue;
    
    // 随机选择一个玩家单位
    const alivePlayerUnits = playerUnits.value.filter(p => p.hp > 0);
    if (alivePlayerUnits.length === 0) break;
    
    const targetIndex = Math.floor(Math.random() * alivePlayerUnits.length);
    const target = alivePlayerUnits[targetIndex];
    
    // 计算伤害
    const damage = calculateDamage(unit, target);
    target.hp = Math.max(0, target.hp - damage);
    
    // 更新统计
    battleStats.damageTaken += damage;
    
    // 添加日志
    addBattleLog('enemy', `${unit.name} 攻击 ${target.name}，造成 ${damage} 点伤害`);
    
    // 检查目标是否阵亡
    if (target.hp <= 0) {
      addBattleLog('system', `${target.name} 被击败了`);
    }
  }
};

const calculateDamage = (attacker, defender) => {
  // 简单的伤害计算公式
  // 在实际项目中应该有更复杂的计算，考虑属性、技能等
  const baseDamage = attacker.power ? attacker.power / 10 : 10;
  const randomFactor = 0.8 + Math.random() * 0.4; // 80% - 120%
  return Math.floor(baseDamage * randomFactor);
};

const isAllEnemyDefeated = () => {
  return enemyUnits.value.every(unit => unit.hp <= 0);
};

const isAllPlayerDefeated = () => {
  return playerUnits.value.every(unit => unit.hp <= 0);
};

const endBattle = (won) => {
  battleEnded.value = true;
  battleWon.value = won;
  
  if (won) {
    addBattleLog('system', '战斗胜利！');
    
    // 准备奖励
    if (selectedStage.value) {
      battleRewards.exp = selectedStage.value.rewards.exp;
      battleRewards.gold = selectedStage.value.rewards.gold;
      
      // 模拟掉落物品
      battleRewards.items = [
        {
          id: 'i001',
          name: '初级治疗药水',
          icon: '/assets/items/health-potion.png'
        }
      ];
      
      // 标记关卡为已完成
      const chapter = availableChapters.value.find(c => c.id === selectedChapter.value);
      if (chapter) {
        const stage = chapter.stages.find(s => s.id === selectedStage.value.id);
        if (stage) {
          stage.completed = true;
          
          // 解锁下一关
          const stageIndex = chapter.stages.findIndex(s => s.id === selectedStage.value.id);
          if (stageIndex < chapter.stages.length - 1) {
            chapter.stages[stageIndex + 1].locked = false;
          }
        }
      }
    }
    
    // 更新资源
    gameStore.updateResources({
      gold: gameStore.resources.gold + battleRewards.gold
    });
    
    // 更新角色经验
    playerUnits.value.forEach(unit => {
      const character = characters.value.find(c => c.id === unit.id);
      if (character) {
        // 实际项目中应该调用API更新角色经验
      }
    });
  } else {
    addBattleLog('system', '战斗失败！');
  }
  
  // 停止自动战斗
  stopAutoPlay();
  
  // 显示结果
  setTimeout(() => {
    resultDialogVisible.value = true;
  }, 1000);
};

const getHpPercentage = (unit) => {
  if (unit.maxHp <= 0) return 0;
  return Math.floor((unit.hp / unit.maxHp) * 100);
};

const getHpColor = (unit) => {
  const percentage = getHpPercentage(unit);
  if (percentage < 30) return '#f56c6c';
  if (percentage < 70) return '#e6a23c';
  return '#67c23a';
};

const addBattleLog = (type, message) => {
  battleLogs.value.push({ type, message });
};

const clearLog = () => {
  battleLogs.value = [];
};

const scrollLogToBottom = () => {
  nextTick(() => {
    if (logContent.value) {
      logContent.value.scrollTop = logContent.value.scrollHeight;
    }
  });
};

const initBattleAnimation = () => {
  // 实现战斗动画初始化逻辑
};

const updateBattleAnimation = () => {
  // 实现战斗动画更新逻辑
};

const stopAutoPlay = () => {
  // 实现停止自动战斗逻辑
};

const goBack = () => {
  // 实现返回逻辑
};

const startBattle = () => {
  // 实现开始战斗逻辑
};

const showResults = () => {
  // 实现显示战斗结果逻辑
};

const returnToPreparation = () => {
  // 实现返回准备界面逻辑
};

const replayBattle = () => {
  // 实现重新开始战斗逻辑
};

const nextStage = () => {
  // 实现进入下一关逻辑
};
</script>
