<template>
  <div class="lobby-container">
    <!-- 欢迎横幅 -->
    <div class="welcome-banner">
      <div class="welcome-content">
        <h1 class="welcome-title">欢迎回来，{{ userName }}!</h1>
        <p class="welcome-subtitle">新的冒险等待着你</p>
        <el-button type="danger" size="large" @click="startQuickBattle">快速战斗</el-button>
      </div>
    </div>
    
    <!-- 功能卡片区域 -->
    <div class="feature-cards">
      <el-row :gutter="20">
        <!-- 每日任务 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <div class="feature-card daily-tasks">
            <div class="card-header">
              <h3>每日任务</h3>
              <el-tag type="warning" size="small">{{ completedTasks }}/{{ totalTasks }}</el-tag>
            </div>
            <div class="card-body">
              <el-progress 
                :percentage="taskProgress" 
                :color="taskProgressColors" 
                :stroke-width="10"
              ></el-progress>
              <div class="task-list">
                <div 
                  v-for="(task, index) in dailyTasks" 
                  :key="index"
                  class="task-item"
                >
                  <div class="task-info">
                    <el-checkbox v-model="task.completed" disabled></el-checkbox>
                    <span>{{ task.name }}</span>
                  </div>
                  <div class="task-reward">
                    <span>{{ task.reward }}</span>
                    <el-button 
                      size="small" 
                      :type="task.completed && !task.claimed ? 'primary' : 'info'"
                      :disabled="!task.completed || task.claimed"
                      @click="claimTaskReward(index)"
                    >
                      {{ task.claimed ? '已领取' : '领取' }}
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-col>
        
        <!-- 活动中心 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <div class="feature-card events">
            <div class="card-header">
              <h3>活动中心</h3>
              <span class="time-tag">{{ activeEvents.length }}个活动进行中</span>
            </div>
            <div class="card-body">
              <el-carousel height="150px" indicator-position="outside" arrow="never">
                <el-carousel-item v-for="(event, index) in activeEvents" :key="index">
                  <div class="event-item" :style="{ backgroundImage: `url(${event.image})` }">
                    <div class="event-info">
                      <h4>{{ event.name }}</h4>
                      <p>{{ event.desc }}</p>
                      <div class="event-time">
                        <el-icon><Timer /></el-icon>
                        <span>剩余: {{ event.remainingTime }}</span>
                      </div>
                    </div>
                  </div>
                </el-carousel-item>
              </el-carousel>
              <div class="event-actions">
                <el-button size="small" @click="showAllEvents">查看全部</el-button>
              </div>
            </div>
          </div>
        </el-col>
        
        <!-- 战斗记录 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <div class="feature-card battle-records">
            <div class="card-header">
              <h3>最近战斗</h3>
              <router-link to="/game/battle/history" class="more-link">更多</router-link>
            </div>
            <div class="card-body">
              <div class="battle-list">
                <div 
                  v-for="(battle, index) in recentBattles" 
                  :key="index"
                  class="battle-item"
                  :class="battle.result"
                >
                  <div class="battle-type">{{ battle.type }}</div>
                  <div class="battle-info">
                    <div class="battle-result">{{ formatBattleResult(battle.result) }}</div>
                    <div class="battle-time">{{ formatBattleTime(battle.time) }}</div>
                  </div>
                  <div class="battle-actions">
                    <el-button 
                      size="small" 
                      @click="replayBattle(battle.id)"
                      icon="VideoPlay"
                      circle
                    ></el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-col>
        
        <!-- 公会信息 -->
        <el-col :xs="24" :sm="12" :md="8" :lg="6">
          <div class="feature-card guild">
            <div class="card-header">
              <h3>公会</h3>
              <router-link to="/game/guild/info" class="more-link">详情</router-link>
            </div>
            <div class="card-body">
              <template v-if="userGuild">
                <div class="guild-info">
                  <el-avatar :size="50" :src="userGuild.logo" class="guild-logo"></el-avatar>
                  <div class="guild-details">
                    <h4>{{ userGuild.name }}</h4>
                    <p>等级: {{ userGuild.level }} · 成员: {{ userGuild.memberCount }}/{{ userGuild.maxMembers }}</p>
                  </div>
                </div>
                <div class="guild-activity">
                  <div class="activity-item">
                    <div class="activity-title">今日贡献</div>
                    <div class="activity-value">{{ userGuild.todayContribution }}</div>
                  </div>
                  <div class="activity-item">
                    <div class="activity-title">公会战</div>
                    <div class="activity-value">{{ userGuild.warStatus }}</div>
                  </div>
                </div>
              </template>
              <div v-else class="no-guild">
                <el-empty description="你还没有加入公会"></el-empty>
                <el-button type="primary" @click="showGuildList">寻找公会</el-button>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>
    </div>
    
    <!-- 推荐内容 -->
    <div class="recommendations">
      <h2 class="section-title">推荐内容</h2>
      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="8" v-for="(item, index) in recommendedItems" :key="index">
          <div class="recommendation-card" @click="handleRecommendation(item)">
            <div class="recommendation-image" :style="{ backgroundImage: `url(${item.image})` }">
              <div class="recommendation-tag" v-if="item.tag">{{ item.tag }}</div>
            </div>
            <div class="recommendation-content">
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
            </div>
          </div>
        </el-col>
      </el-row>
    </div>

    <!-- 公告和系统消息 -->
    <div class="announcement-section">
      <div class="announcement-header">
        <h2 class="section-title">公告 & 消息</h2>
        <el-radio-group v-model="messageTabActive" size="small">
          <el-radio-button label="announcement">公告</el-radio-button>
          <el-radio-button label="system">系统消息</el-radio-button>
        </el-radio-group>
      </div>
      
      <div class="announcement-content">
        <template v-if="messageTabActive === 'announcement'">
          <div 
            v-for="(announcement, index) in announcements" 
            :key="index"
            class="announcement-item"
          >
            <div class="announcement-title">
              <el-tag :type="announcement.important ? 'danger' : 'info'" size="small">
                {{ announcement.important ? '重要' : '公告' }}
              </el-tag>
              <h4>{{ announcement.title }}</h4>
            </div>
            <p>{{ announcement.content }}</p>
            <div class="announcement-footer">
              <span class="announcement-time">{{ formatMessageTime(announcement.time) }}</span>
            </div>
          </div>
        </template>
        
        <template v-else>
          <div 
            v-for="(message, index) in systemMessages" 
            :key="index"
            class="system-message-item"
          >
            <div class="message-title">
              <el-tag :type="message.type" size="small">{{ message.category }}</el-tag>
              <h4>{{ message.title }}</h4>
            </div>
            <p>{{ message.content }}</p>
            <div class="message-footer">
              <span class="message-time">{{ formatMessageTime(message.time) }}</span>
              <el-button 
                size="small" 
                type="primary"
                v-if="message.hasReward && !message.rewardClaimed"
                @click="claimMessageReward(index)"
              >
                领取奖励
              </el-button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { useGameStore } from '@/stores/game';
import { useNotificationStore } from '@/stores/notification';
import { Timer, VideoPlay } from '@element-plus/icons-vue';

// 路由和状态
const router = useRouter();
const userStore = useUserStore();
const gameStore = useGameStore();
const notificationStore = useNotificationStore();

// 用户信息
const userName = computed(() => userStore.userName || '冒险者');

// 每日任务
const dailyTasks = ref([
  { name: '完成3场战斗', reward: '100金币', completed: true, claimed: false },
  { name: '升级一件装备', reward: '50钻石', completed: false, claimed: false },
  { name: '完成一次公会捐献', reward: '公会积分×20', completed: false, claimed: false },
  { name: '购买一件商品', reward: '经验×500', completed: true, claimed: true }
]);

// 任务进度计算
const totalTasks = computed(() => dailyTasks.value.length);
const completedTasks = computed(() => dailyTasks.value.filter(task => task.completed).length);
const taskProgress = computed(() => Math.round((completedTasks.value / totalTasks.value) * 100));

// 进度条颜色
const taskProgressColors = [
  { color: '#f56c6c', percentage: 30 },
  { color: '#e6a23c', percentage: 60 },
  { color: '#5cb87a', percentage: 100 }
];

// 活动中心
const activeEvents = ref([
  {
    name: '新春活动',
    desc: '参与新春活动获得限定皮肤和道具',
    image: '/assets/events/new-year.jpg',
    remainingTime: '3天12小时',
    url: '/game/events/new-year'
  },
  {
    name: '限时副本',
    desc: '限时开放精英副本，掉落稀有装备',
    image: '/assets/events/elite-dungeon.jpg',
    remainingTime: '1天8小时',
    url: '/game/events/elite-dungeon'
  },
  {
    name: '双倍经验',
    desc: '周末双倍经验活动',
    image: '/assets/events/double-exp.jpg',
    remainingTime: '2天',
    url: '/game/events/double-exp'
  }
]);

// 战斗记录
const recentBattles = ref([
  { id: 'b001', type: 'PVE', result: 'win', time: new Date(Date.now() - 30 * 60 * 1000) },
  { id: 'b002', type: '竞技场', result: 'lose', time: new Date(Date.now() - 2 * 60 * 60 * 1000) },
  { id: 'b003', type: '公会战', result: 'win', time: new Date(Date.now() - 5 * 60 * 60 * 1000) }
]);

// 公会信息
const userGuild = ref({
  id: 'g001',
  name: '星辰公会',
  level: 8,
  memberCount: 42,
  maxMembers: 50,
  logo: '/assets/guild/logo1.png',
  todayContribution: 150,
  warStatus: '准备中'
});

// 推荐内容
const recommendedItems = ref([
  {
    title: '限时折扣',
    description: '钻石礼包8折优惠，限时3天',
    image: '/assets/recommendations/discount.jpg',
    tag: '折扣',
    type: 'shop',
    url: '/game/shop/discount'
  },
  {
    title: '新英雄登场',
    description: '全新英雄「暗影刺客」现已推出',
    image: '/assets/recommendations/new-hero.jpg',
    tag: '新内容',
    type: 'character',
    url: '/game/character/new'
  },
  {
    title: '公会活动',
    description: '参与公会副本，获取稀有装备',
    image: '/assets/recommendations/guild-event.jpg',
    tag: '活动',
    type: 'guild',
    url: '/game/guild/events'
  }
]);

// 公告和系统消息
const messageTabActive = ref('announcement');
const announcements = ref([
  {
    title: '游戏更新公告 v1.2.5',
    content: '亲爱的玩家，游戏将于3月15日进行版本更新，新增内容包括新英雄、新地图以及多项游戏优化。',
    time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    important: true
  },
  {
    title: '服务器维护通知',
    content: '为了给玩家提供更好的游戏体验，我们计划于3月10日03:00-07:00进行服务器维护，期间将无法登录游戏。',
    time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    important: true
  },
  {
    title: '新活动预告',
    content: '春节活动即将开始，敬请期待各种丰厚奖励和特别内容。',
    time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    important: false
  }
]);

const systemMessages = ref([
  {
    title: '装备强化成功',
    content: '你的装备「雷霆战靴」强化到了+7级。',
    time: new Date(Date.now() - 1 * 60 * 60 * 1000),
    category: '系统',
    type: 'success',
    hasReward: false,
    rewardClaimed: false
  },
  {
    title: '竞技场排名奖励',
    content: '恭喜你在本周竞技场中获得第8名，获得了丰厚奖励。',
    time: new Date(Date.now() - 24 * 60 * 60 * 1000),
    category: '奖励',
    type: 'warning',
    hasReward: true,
    rewardClaimed: false
  },
  {
    title: '好友申请',
    content: '玩家「风之剑客」向你发送了好友申请。',
    time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    category: '社交',
    type: 'info',
    hasReward: false,
    rewardClaimed: false
  }
]);

// 方法
// 领取任务奖励
const claimTaskReward = (index) => {
  const task = dailyTasks.value[index];
  if (task.completed && !task.claimed) {
    task.claimed = true;
    
    // 这里应该通过API领取奖励
    // 模拟API调用
    setTimeout(() => {
      const rewardText = task.reward.split('×')[0].trim();
      const rewardAmount = task.reward.split('×')[1]?.trim() || '';
      
      notificationStore.addSuccessNotification(`成功领取任务奖励: ${rewardText} ${rewardAmount}`);
      
      // 根据奖励类型更新资源
      if (task.reward.includes('金币')) {
        gameStore.updateResources({
          gold: gameStore.resources.gold + 100
        });
      } else if (task.reward.includes('钻石')) {
        gameStore.updateResources({
          diamond: gameStore.resources.diamond + 50
        });
      }
    }, 500);
  }
};

// 显示所有活动
const showAllEvents = () => {
  router.push('/game/events');
};

// 回放战斗
const replayBattle = (battleId) => {
  router.push(`/game/battle/replay/${battleId}`);
};

// 快速战斗
const startQuickBattle = () => {
  // 检查能量是否足够
  if (gameStore.resources.energy < 10) {
    notificationStore.addWarningNotification('能量不足，无法开始战斗');
    return;
  }
  
  // 跳转到战斗页面
  router.push('/game/battle/pve');
};

// 显示公会列表
const showGuildList = () => {
  router.push('/game/guild');
};

// 处理推荐内容点击
const handleRecommendation = (item) => {
  router.push(item.url);
};

// 领取消息奖励
const claimMessageReward = (index) => {
  const message = systemMessages.value[index];
  if (message.hasReward && !message.rewardClaimed) {
    message.rewardClaimed = true;
    
    // 模拟API调用
    setTimeout(() => {
      notificationStore.addSuccessNotification('成功领取竞技场排名奖励');
      
      // 更新资源
      gameStore.updateResources({
        gold: gameStore.resources.gold + 200,
        diamond: gameStore.resources.diamond + 30
      });
    }, 500);
  }
};

// 格式化战斗结果
const formatBattleResult = (result) => {
  switch (result) {
    case 'win': return '胜利';
    case 'lose': return '失败';
    case 'draw': return '平局';
    default: return '未知';
  }
};

// 格式化战斗时间
const formatBattleTime = (time) => {
  const now = new Date();
  const diff = Math.floor((now - time) / (1000 * 60)); // 分钟差
  
  if (diff < 60) {
    return `${diff}分钟前`;
  } else if (diff < 24 * 60) {
    return `${Math.floor(diff / 60)}小时前`;
  } else {
    return `${Math.floor(diff / (24 * 60))}天前`;
  }
};

// 格式化消息时间
const formatMessageTime = (time) => {
  return time.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// 生命周期钩子
onMounted(() => {
  // 加载数据
  // 可以在这里调用API获取各种数据
});
</script>

<style scoped>
.lobby-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

/* 欢迎横幅 */
.welcome-banner {
  height: 200px;
  background: url('@/assets/bg/lobby-banner.jpg') no-repeat center center;
  background-size: cover;
  border-radius: 8px;
  margin-bottom: 20px;
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 40px;
}

.welcome-content {
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.welcome-title {
  font-size: 28px;
  margin: 0 0 5px;
}

.welcome-subtitle {
  font-size: 16px;
  margin: 0 0 20px;
  opacity: 0.9;
}

/* 功能卡片 */
.feature-cards {
  margin-bottom: 30px;
}

.feature-card {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  height: 350px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.card-header {
  padding: 15px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.card-body {
  flex-grow: 1;
  padding: 15px;
  overflow-y: auto;
}

/* 任务卡片 */
.task-list {
  margin-top: 15px;
}

.task-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.task-item:last-child {
  border-bottom: none;
}

.task-info {
  display: flex;
  align-items: center;
}

.task-info span {
  margin-left: 8px;
}

.task-reward {
  display: flex;
  align-items: center;
}

.task-reward span {
  margin-right: 10px;
  font-size: 13px;
  color: #e6a23c;
}

.time-tag {
  color: #409eff;
  font-size: 13px;
}

/* 活动卡片 */
.event-item {
  height: 100%;
  background-size: cover;
  background-position: center;
  position: relative;
}

.event-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 15px;
  background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
  color: white;
}

.event-info h4 {
  margin: 0 0 5px;
  font-size: 16px;
}

.event-info p {
  margin: 0 0 8px;
  font-size: 13px;
  opacity: 0.9;
}

.event-time {
  display: flex;
  align-items: center;
  font-size: 12px;
}

.event-time .el-icon {
  margin-right: 5px;
}

.event-actions {
  margin-top: 10px;
  text-align: center;
}

/* 战斗记录卡片 */
.battle-list {
  display: flex;
  flex-direction: column;
}

.battle-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 10px;
  background-color: #f9f9f9;
  border-left: 4px solid #909399;
}

.battle-item.win {
  border-left-color: #67c23a;
}

.battle-item.lose {
  border-left-color: #f56c6c;
}

.battle-item.draw {
  border-left-color: #e6a23c;
}

.battle-type {
  flex: 0 0 80px;
  font-weight: bold;
}

.battle-info {
  flex: 1;
}

.battle-result {
  font-size: 15px;
  margin-bottom: 2px;
}

.battle-time {
  font-size: 12px;
  color: #909399;
}

.battle-actions {
  margin-left: 10px;
}

/* 公会卡片 */
.guild-info {
  display: flex;
  margin-bottom: 15px;
}

.guild-logo {
  margin-right: 15px;
}

.guild-details h4 {
  margin: 5px 0;
  font-size: 16px;
}

.guild-details p {
  margin: 0;
  color: #909399;
  font-size: 13px;
}

.guild-activity {
  display: flex;
  justify-content: space-around;
  text-align: center;
  margin-top: 15px;
}

.activity-title {
  color: #909399;
  font-size: 13px;
  margin-bottom: 5px;
}

.activity-value {
  font-size: 16px;
  font-weight: bold;
}

.no-guild {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.more-link {
  font-size: 13px;
  color: #409eff;
  text-decoration: none;
}

/* 推荐内容 */
.section-title {
  font-size: 20px;
  margin: 0 0 20px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.recommendation-card {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  margin-bottom: 20px;
  cursor: pointer;
  transition: transform 0.2s;
}

.recommendation-card:hover {
  transform: translateY(-5px);
}

.recommendation-image {
  height: 160px;
  background-size: cover;
  background-position: center;
  position: relative;
}

.recommendation-tag {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(230, 162, 60, 0.9);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.recommendation-content {
  padding: 15px;
}

.recommendation-content h3 {
  margin: 0 0 8px;
  font-size: 18px;
}

.recommendation-content p {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

/* 公告和系统消息 */
.announcement-section {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  padding: 20px;
  margin-top: 30px;
}

.announcement-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.announcement-header .section-title {
  color: #333;
  text-shadow: none;
  margin: 0;
}

.announcement-item, .system-message-item {
  padding: 15px;
  border-bottom: 1px solid #f0f0f0;
}

.announcement-item:last-child, .system-message-item:last-child {
  border-bottom: none;
}

.announcement-title, .message-title {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.announcement-title h4, .message-title h4 {
  margin: 0 0 0 10px;
  font-size: 16px;
}

.announcement-footer, .message-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  font-size: 12px;
  color: #909399;
}

/* 响应式样式 */
@media (max-width: 768px) {
  .welcome-banner {
    height: 150px;
    padding: 0 20px;
  }
  
  .welcome-title {
    font-size: 22px;
  }
  
  .event-actions, .recommendation-content, .announcement-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .announcement-header .el-radio-group {
    margin-top: 10px;
  }
}
</style> 