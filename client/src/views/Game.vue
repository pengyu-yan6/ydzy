<template>
  <div class="game-container">
    <!-- 游戏顶部工具栏 -->
    <div class="game-toolbar">
      <div class="player-info">
        <el-avatar :size="40" src="https://example.com/avatar.jpg"></el-avatar>
        <div class="player-details">
          <span class="player-name">{{ playerInfo.username }}</span>
          <div class="player-level">
            <span>Lv.{{ playerInfo.level }}</span>
            <el-progress :percentage="playerInfo.exp / playerInfo.nextLevelExp * 100" :stroke-width="5" :show-text="false"></el-progress>
          </div>
        </div>
      </div>
      
      <div class="game-controls">
        <el-button-group>
          <el-button type="primary" plain @click="startGame">开始游戏</el-button>
          <el-button type="warning" plain @click="practiceMode">练习模式</el-button>
          <el-button type="info" plain @click="showRanking">排行榜</el-button>
          <el-button type="success" plain @click="goToShop">商城</el-button>
        </el-button-group>
      </div>
      
      <div class="game-resources">
        <div class="resource-item">
          <el-icon><Money /></el-icon>
          <span>{{ formatNumber(playerInfo.gold) }}</span>
        </div>
        <div class="resource-item">
          <el-icon><Diamond /></el-icon>
          <span>{{ formatNumber(playerInfo.diamond) }}</span>
        </div>
      </div>
    </div>
    
    <!-- 游戏主内容区 -->
    <div class="game-content">
      <!-- 游戏左侧区域 - 英雄选择和装备 -->
      <div class="game-sidebar">
        <div class="section-title">英雄池</div>
        <div class="hero-pool">
          <div 
            v-for="hero in availableHeroes" 
            :key="hero.id" 
            class="hero-card"
            :class="{ 'hero-selected': selectedHeroes.includes(hero.id) }"
            @click="toggleHeroSelection(hero.id)"
          >
            <div class="hero-cost" :class="'cost-' + hero.cost">{{ hero.cost }}</div>
            <img :src="hero.avatar" :alt="hero.name" class="hero-avatar" />
            <div class="hero-name">{{ hero.name }}</div>
            <div class="hero-traits">
              <span v-for="trait in hero.traits" :key="trait" class="hero-trait">
                {{ trait }}
              </span>
            </div>
          </div>
        </div>
        
        <div class="section-title">装备栏</div>
        <div class="item-pool">
          <div v-for="item in playerItems" :key="item.id" class="item-card">
            <img :src="item.icon" :alt="item.name" />
            <div class="item-tooltip">
              <div class="item-name">{{ item.name }}</div>
              <div class="item-desc">{{ item.description }}</div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 游戏中心区域 - 棋盘 -->
      <div class="game-board">
        <div class="board-grid">
          <!-- 动态生成7x7的棋盘格子 -->
          <div 
            v-for="y in 7" 
            v-for="x in 7" 
            :key="`${x}-${y}`" 
            class="board-cell"
            @click="handleCellClick(x, y)"
            :class="{ 'cell-active': isCellActive(x, y) }"
          >
            <template v-if="getBoardHero(x, y)">
              <div class="board-hero" :class="'hero-level-' + getBoardHero(x, y).level">
                <img :src="getBoardHero(x, y).avatar" :alt="getBoardHero(x, y).name" />
                <div class="hero-health-bar">
                  <div class="hero-health" :style="{ width: getBoardHero(x, y).hp / getBoardHero(x, y).maxHp * 100 + '%' }"></div>
                </div>
              </div>
            </template>
          </div>
        </div>
        
        <!-- 回合信息和控制 -->
        <div class="game-round-info">
          <div class="round-number">回合 {{ currentRound }}/30</div>
          <div class="player-health">
            <el-icon><User /></el-icon>
            <el-progress 
              :percentage="playerInfo.hp" 
              :format="format => `${playerInfo.hp}/100`" 
              :color="healthBarColor"
            ></el-progress>
          </div>
          
          <div class="round-controls">
            <el-button type="primary" @click="readyForBattle" :disabled="isInBattle">准备战斗</el-button>
            <el-button type="danger" @click="rerollHeroes" :disabled="isInBattle || playerInfo.gold < 2">
              刷新 (金币:2)
            </el-button>
            <el-button type="success" @click="buyExp" :disabled="isInBattle || playerInfo.gold < 4">
              购买经验 (金币:4)
            </el-button>
          </div>
        </div>
      </div>
      
      <!-- 游戏右侧区域 - 玩家列表和聊天 -->
      <div class="game-info">
        <div class="section-title">玩家列表</div>
        <div class="player-list">
          <div 
            v-for="player in players" 
            :key="player.id" 
            class="player-row"
            :class="{ 'current-player': player.id === playerInfo.id }"
          >
            <el-avatar :size="32" :src="player.avatar"></el-avatar>
            <div class="player-row-info">
              <div class="player-row-name">{{ player.username }}</div>
              <div class="player-row-details">
                <span>Lv.{{ player.level }}</span>
                <span class="player-hp">
                  <el-icon><HeartFilled /></el-icon> {{ player.hp }}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="section-title">游戏聊天</div>
        <div class="chat-box">
          <div class="chat-messages">
            <div v-for="(msg, index) in chatMessages" :key="index" class="chat-message">
              <strong>{{ msg.sender }}:</strong> {{ msg.content }}
            </div>
          </div>
          <div class="chat-input">
            <el-input
              v-model="chatInput"
              placeholder="发送消息..."
              @keyup.enter="sendChatMessage"
            >
              <template #append>
                <el-button @click="sendChatMessage">发送</el-button>
              </template>
            </el-input>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import { io } from 'socket.io-client';

export default {
  name: 'GamePage',
  data() {
    return {
      // 玩家信息
      playerInfo: {
        id: 1,
        username: '玩家1',
        level: 5,
        exp: 30,
        nextLevelExp: 50,
        gold: 50,
        diamond: 1000,
        hp: 85
      },
      
      // 游戏状态
      currentRound: 1,
      isInBattle: false,
      
      // 可用英雄池
      availableHeroes: [
        {
          id: 1,
          name: '剑圣',
          cost: 1,
          avatar: 'https://example.com/hero1.jpg',
          traits: ['战士', '剑客'],
          level: 1,
          hp: 100,
          maxHp: 100
        },
        {
          id: 2,
          name: '法师',
          cost: 3,
          avatar: 'https://example.com/hero2.jpg',
          traits: ['法师', '元素'],
          level: 1,
          hp: 80,
          maxHp: 80
        },
        {
          id: 3,
          name: '刺客',
          cost: 2,
          avatar: 'https://example.com/hero3.jpg',
          traits: ['刺客', '暗影'],
          level: 1,
          hp: 90,
          maxHp: 90
        },
        {
          id: 4,
          name: '坦克',
          cost: 4,
          avatar: 'https://example.com/hero4.jpg',
          traits: ['坦克', '守护'],
          level: 1,
          hp: 120,
          maxHp: 120
        },
        {
          id: 5,
          name: '射手',
          cost: 2,
          avatar: 'https://example.com/hero5.jpg',
          traits: ['射手', '游侠'],
          level: 1,
          hp: 85,
          maxHp: 85
        }
      ],
      
      // 已选择的英雄
      selectedHeroes: [1, 3],
      
      // 棋盘上的英雄
      boardHeroes: {
        '1-1': { id: 1, name: '剑圣', level: 1, hp: 95, maxHp: 100, avatar: 'https://example.com/hero1.jpg' },
        '2-3': { id: 3, name: '刺客', level: 1, hp: 70, maxHp: 90, avatar: 'https://example.com/hero3.jpg' }
      },
      
      // 玩家道具
      playerItems: [
        { id: 1, name: '暴击之刃', description: '增加30%暴击率', icon: 'https://example.com/item1.png' },
        { id: 2, name: '护甲', description: '增加30点护甲', icon: 'https://example.com/item2.png' }
      ],
      
      // 其他玩家
      players: [
        { id: 1, username: '玩家1', level: 5, hp: 85, avatar: 'https://example.com/avatar1.jpg' },
        { id: 2, username: '玩家2', level: 6, hp: 65, avatar: 'https://example.com/avatar2.jpg' },
        { id: 3, username: '玩家3', level: 4, hp: 90, avatar: 'https://example.com/avatar3.jpg' },
        { id: 4, username: '玩家4', level: 7, hp: 45, avatar: 'https://example.com/avatar4.jpg' }
      ],
      
      // 聊天
      chatMessages: [
        { sender: '系统', content: '欢迎来到跃升之路！' },
        { sender: '玩家2', content: '大家好！' },
        { sender: '玩家3', content: '有人知道剑圣怎么玩吗？' }
      ],
      chatInput: '',
      
      // WebSocket
      socket: null
    };
  },
  computed: {
    healthBarColor() {
      if (this.playerInfo.hp > 70) return '#67C23A';
      if (this.playerInfo.hp > 30) return '#E6A23C';
      return '#F56C6C';
    }
  },
  mounted() {
    // 初始化WebSocket连接
    this.initSocket();
    
    // 获取游戏初始数据
    this.fetchGameData();
  },
  beforeUnmount() {
    // 断开WebSocket连接
    if (this.socket) {
      this.socket.disconnect();
    }
  },
  methods: {
    // 初始化WebSocket连接
    initSocket() {
      this.socket = io();
      
      // 监听游戏事件
      this.socket.on('gameUpdate', this.handleGameUpdate);
      this.socket.on('chatMessage', this.handleChatMessage);
      this.socket.on('battleResult', this.handleBattleResult);
    },
    
    // 获取游戏初始数据
    async fetchGameData() {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('/api/game/data', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // 更新本地游戏数据
        const { playerInfo, heroes, items, players } = response.data;
        this.playerInfo = playerInfo;
        this.availableHeroes = heroes;
        this.playerItems = items;
        this.players = players;
      } catch (error) {
        this.$message.error('获取游戏数据失败');
        console.error(error);
      }
    },
    
    // 开始游戏
    startGame() {
      this.socket.emit('startGame');
      this.$message.success('游戏即将开始');
    },
    
    // 练习模式
    practiceMode() {
      this.$router.push('/game/practice');
    },
    
    // 显示排行榜
    showRanking() {
      // 实现排行榜显示逻辑
    },
    
    // 前往商城
    goToShop() {
      this.$router.push('/shop');
    },
    
    // 格式化数字（如1000 -> 1,000）
    formatNumber(num) {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    
    // 切换英雄选择
    toggleHeroSelection(heroId) {
      const index = this.selectedHeroes.indexOf(heroId);
      if (index > -1) {
        this.selectedHeroes.splice(index, 1);
      } else {
        this.selectedHeroes.push(heroId);
      }
    },
    
    // 处理棋盘格子点击
    handleCellClick(x, y) {
      console.log(`点击了格子 ${x}, ${y}`);
      // 实现放置英雄等逻辑
    },
    
    // 检查格子是否激活
    isCellActive(x, y) {
      // 实现格子状态检查逻辑
      return false;
    },
    
    // 获取格子上的英雄信息
    getBoardHero(x, y) {
      return this.boardHeroes[`${x}-${y}`] || null;
    },
    
    // 准备战斗
    readyForBattle() {
      this.socket.emit('readyForBattle');
      this.isInBattle = true;
      this.$message.success('已准备战斗');
    },
    
    // 刷新英雄池
    rerollHeroes() {
      if (this.playerInfo.gold < 2) {
        this.$message.error('金币不足');
        return;
      }
      
      this.socket.emit('rerollHeroes');
      this.playerInfo.gold -= 2;
      // 实际应该由服务器更新英雄池
    },
    
    // 购买经验
    buyExp() {
      if (this.playerInfo.gold < 4) {
        this.$message.error('金币不足');
        return;
      }
      
      this.socket.emit('buyExp');
      this.playerInfo.gold -= 4;
      this.playerInfo.exp += 4;
      
      // 检查是否升级
      if (this.playerInfo.exp >= this.playerInfo.nextLevelExp) {
        this.playerInfo.level += 1;
        this.playerInfo.exp -= this.playerInfo.nextLevelExp;
        this.playerInfo.nextLevelExp = Math.floor(this.playerInfo.nextLevelExp * 1.3);
        this.$message.success(`恭喜升级到 ${this.playerInfo.level} 级！`);
      }
    },
    
    // 发送聊天消息
    sendChatMessage() {
      if (!this.chatInput.trim()) return;
      
      this.socket.emit('chatMessage', this.chatInput);
      this.chatMessages.push({
        sender: this.playerInfo.username,
        content: this.chatInput
      });
      this.chatInput = '';
    },
    
    // 处理游戏更新
    handleGameUpdate(data) {
      // 更新游戏状态
      console.log('Game update received:', data);
    },
    
    // 处理聊天消息
    handleChatMessage(data) {
      this.chatMessages.push(data);
    },
    
    // 处理战斗结果
    handleBattleResult(data) {
      this.isInBattle = false;
      this.currentRound++;
      this.playerInfo.hp = data.playerHp;
      
      // 显示战斗结果
      if (data.result === 'win') {
        this.$message.success('战斗胜利！');
      } else if (data.result === 'lose') {
        this.$message.error('战斗失败！');
      } else {
        this.$message.info('战平！');
      }
    }
  }
};
</script>

<style scoped>
.game-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background-color: #1a1a1a;
  color: #fff;
}

.game-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: #2c3e50;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  height: 60px;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-details {
  display: flex;
  flex-direction: column;
}

.player-name {
  font-weight: bold;
}

.player-level {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.8rem;
}

.player-level .el-progress {
  width: 100px;
}

.game-resources {
  display: flex;
  gap: 20px;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: bold;
}

.game-content {
  display: flex;
  height: calc(100vh - 60px);
}

.game-sidebar {
  width: 280px;
  background-color: #2c3e50;
  padding: 1rem;
  overflow-y: auto;
}

.game-board {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background-color: #34495e;
}

.game-info {
  width: 300px;
  background-color: #2c3e50;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.section-title {
  font-size: 1.2rem;
  font-weight: bold;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #4a6b8a;
}

.hero-pool {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 2rem;
}

.hero-card {
  position: relative;
  background-color: #34495e;
  border-radius: 8px;
  padding: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.hero-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.hero-selected {
  border-color: #409EFF;
}

.hero-cost {
  position: absolute;
  top: 5px;
  left: 5px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.8rem;
}

.cost-1 { background-color: #95a5a6; }
.cost-2 { background-color: #3498db; }
.cost-3 { background-color: #9b59b6; }
.cost-4 { background-color: #f1c40f; }
.cost-5 { background-color: #e74c3c; }

.hero-avatar {
  width: 100%;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}

.hero-name {
  margin-top: 0.5rem;
  font-weight: bold;
  text-align: center;
}

.hero-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 0.3rem;
  justify-content: center;
}

.hero-trait {
  font-size: 0.7rem;
  background-color: #4a6b8a;
  padding: 2px 6px;
  border-radius: 10px;
}

.item-pool {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.item-card {
  width: 40px;
  height: 40px;
  background-color: #34495e;
  border-radius: 4px;
  position: relative;
  cursor: pointer;
}

.item-card img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.item-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 150px;
  background-color: #2c3e50;
  border: 1px solid #4a6b8a;
  border-radius: 4px;
  padding: 0.5rem;
  z-index: 10;
  display: none;
}

.item-card:hover .item-tooltip {
  display: block;
}

.item-name {
  font-weight: bold;
  margin-bottom: 0.3rem;
}

.item-desc {
  font-size: 0.8rem;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(7, 1fr);
  gap: 4px;
  width: 100%;
  flex: 1;
}

.board-cell {
  background-color: #4a6b8a;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.cell-active {
  background-color: rgba(64, 158, 255, 0.3);
}

.board-hero {
  width: 90%;
  height: 90%;
  position: relative;
}

.board-hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
}

.hero-health-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background-color: #c0392b;
  border-radius: 2px;
}

.hero-health {
  height: 100%;
  background-color: #2ecc71;
  border-radius: 2px;
}

.hero-level-1 { border: 1px solid #95a5a6; }
.hero-level-2 { border: 2px solid #3498db; }
.hero-level-3 { border: 2px solid #f1c40f; }

.game-round-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
}

.round-number {
  font-weight: bold;
  font-size: 1.2rem;
}

.player-health {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 200px;
}

.round-controls {
  display: flex;
  gap: 0.5rem;
}

.player-list {
  margin-bottom: 2rem;
  overflow-y: auto;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0.5rem;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  background-color: #34495e;
}

.player-row:hover {
  background-color: #4a6b8a;
}

.current-player {
  background-color: rgba(64, 158, 255, 0.3);
}

.player-row-info {
  flex: 1;
}

.player-row-name {
  font-weight: bold;
}

.player-row-details {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  margin-top: 0.2rem;
}

.player-hp {
  display: flex;
  align-items: center;
  gap: 3px;
}

.chat-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #34495e;
  border-radius: 4px;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  padding: 0.5rem;
  overflow-y: auto;
}

.chat-message {
  margin-bottom: 0.5rem;
  word-break: break-all;
}

.chat-input {
  padding: 0.5rem;
  background-color: #2c3e50;
}
</style> 