<template>
  <div class="game-layout">
    <div class="game-header">
      <div class="logo-area">
        <img src="@/assets/game-logo.png" alt="Game Logo" class="game-logo" />
      </div>
      
      <div class="nav-area">
        <router-link 
          v-for="item in mainNavItems" 
          :key="item.path" 
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </router-link>
      </div>
      
      <div class="user-area">
        <div class="resource-display">
          <div class="resource-item">
            <img src="@/assets/icons/gold.png" alt="Gold" class="resource-icon" />
            <span>{{ formatNumber(userResources.gold) }}</span>
            <el-button size="small" circle @click="showRechargeDialog('gold')">+</el-button>
          </div>
          
          <div class="resource-item">
            <img src="@/assets/icons/diamond.png" alt="Diamond" class="resource-icon" />
            <span>{{ formatNumber(userResources.diamond) }}</span>
            <el-button size="small" circle @click="showRechargeDialog('diamond')">+</el-button>
          </div>
          
          <div class="resource-item">
            <img src="@/assets/icons/energy.png" alt="Energy" class="resource-icon" />
            <span>{{ userResources.energy }}/{{ userResources.maxEnergy }}</span>
          </div>
        </div>
        
        <el-dropdown trigger="click" @command="handleCommand">
          <div class="user-info">
            <el-avatar :size="40" :src="userAvatar" />
            <div class="user-details">
              <span class="username">{{ userName }}</span>
              <span class="user-level">Lv.{{ userLevel }}</span>
            </div>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile">个人资料</el-dropdown-item>
              <el-dropdown-item command="settings">游戏设置</el-dropdown-item>
              <el-dropdown-item command="cdk">兑换码</el-dropdown-item>
              <el-dropdown-item command="admin" v-if="isAdmin">管理后台</el-dropdown-item>
              <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
    
    <div class="game-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
    
    <div class="game-footer">
      <div class="footer-nav">
        <router-link 
          v-for="item in footerNavItems" 
          :key="item.path" 
          :to="item.path"
          class="footer-nav-item"
        >
          {{ item.title }}
        </router-link>
      </div>
      <div class="footer-info">
        <span>© {{ currentYear }} 游戏名称 版权所有</span>
        <span>版本: v1.0.0</span>
      </div>
    </div>
    
    <!-- 充值对话框 -->
    <el-dialog
      v-model="rechargeDialogVisible"
      :title="rechargeType === 'gold' ? '金币充值' : '钻石充值'"
      width="400px"
    >
      <div class="recharge-content">
        <div class="recharge-options">
          <div 
            v-for="(option, index) in rechargeOptions" 
            :key="index"
            class="recharge-option"
            :class="{ active: selectedRechargeOption === index }"
            @click="selectedRechargeOption = index"
          >
            <div class="option-amount">
              <img 
                :src="rechargeType === 'gold' ? '@/assets/icons/gold.png' : '@/assets/icons/diamond.png'" 
                :alt="rechargeType === 'gold' ? 'Gold' : 'Diamond'" 
                class="resource-icon" 
              />
              <span>{{ formatNumber(option.amount) }}</span>
            </div>
            <div class="option-price">¥{{ option.price.toFixed(2) }}</div>
            <div class="option-bonus" v-if="option.bonus > 0">+{{ option.bonus }}%</div>
          </div>
        </div>
        
        <div class="payment-methods">
          <div class="section-title">支付方式</div>
          <el-radio-group v-model="selectedPaymentMethod">
            <el-radio label="wechat">微信支付</el-radio>
            <el-radio label="alipay">支付宝</el-radio>
          </el-radio-group>
        </div>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="rechargeDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleRecharge">
            立即支付 ¥{{ selectedOption ? selectedOption.price.toFixed(2) : '0.00' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 全局游戏通知 -->
    <div class="game-notifications">
      <transition-group name="notification">
        <div 
          v-for="notification in activeNotifications" 
          :key="notification.id"
          class="notification-item"
          :class="notification.type"
        >
          <el-icon class="notification-icon">
            <component :is="getNotificationIcon(notification.type)" />
          </el-icon>
          <span class="notification-content">{{ notification.message }}</span>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { useGameStore } from '@/stores/game';
import { useNotificationStore } from '@/stores/notification';
import { logout, getUserRole } from '@/utils/auth';
import { getGameSocket } from '@/services/socket';
import {
  HomeFilled, Trophy, ShoppingBag, User, ChatDotRound,
  Setting, Bell, WarningFilled, SuccessFilled, InfoFilled
} from '@element-plus/icons-vue';

// 路由和状态
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const gameStore = useGameStore();
const notificationStore = useNotificationStore();

// 用户信息
const userName = computed(() => userStore.userName || '玩家');
const userAvatar = computed(() => userStore.userAvatar || 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png');
const userLevel = computed(() => userStore.userLevel || 1);
const isAdmin = computed(() => {
  const role = getUserRole();
  return role === 'admin' || role === 'moderator';
});

// 用户资源
const userResources = computed(() => gameStore.resources);

// 主导航项
const mainNavItems = [
  { path: '/game', title: '大厅', icon: 'HomeFilled' },
  { path: '/game/battle', title: '战斗', icon: 'Trophy' },
  { path: '/game/character', title: '角色', icon: 'User' },
  { path: '/game/guild', title: '公会', icon: 'User' },
  { path: '/game/shop', title: '商城', icon: 'ShoppingBag' },
  { path: '/game/chat', title: '聊天', icon: 'ChatDotRound' },
  { path: '/game/leaderboard', title: '排行', icon: 'Trophy' }
];

// 底部导航项
const footerNavItems = [
  { path: '/about', title: '关于我们' },
  { path: '/terms', title: '服务条款' },
  { path: '/privacy', title: '隐私政策' },
  { path: '/contact', title: '联系我们' },
  { path: '/help', title: '帮助中心' }
];

// 当前年份
const currentYear = new Date().getFullYear();

// 充值相关
const rechargeDialogVisible = ref(false);
const rechargeType = ref('gold');
const selectedRechargeOption = ref(0);
const selectedPaymentMethod = ref('wechat');

// 充值选项
const rechargeOptions = [
  { amount: 100, price: 10, bonus: 0 },
  { amount: 500, price: 50, bonus: 5 },
  { amount: 1000, price: 100, bonus: 10 },
  { amount: 2000, price: 198, bonus: 15 },
  { amount: 5000, price: 488, bonus: 20 },
  { amount: 10000, price: 968, bonus: 25 }
];

// 选中的充值选项
const selectedOption = computed(() => {
  return rechargeOptions[selectedRechargeOption.value];
});

// 活动通知
const activeNotifications = computed(() => {
  return notificationStore.notifications;
});

// WebSocket连接
let gameSocket = null;

// 方法
// 检查路由是否激活
const isActive = (path) => {
  return route.path.startsWith(path);
};

// 格式化数字
const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

// 显示充值对话框
const showRechargeDialog = (type) => {
  rechargeType.value = type;
  rechargeDialogVisible.value = true;
};

// 处理充值
const handleRecharge = () => {
  if (!selectedOption.value) return;
  
  // 创建订单
  const orderData = {
    type: rechargeType.value,
    amount: selectedOption.value.amount,
    price: selectedOption.value.price,
    paymentMethod: selectedPaymentMethod.value
  };
  
  // 调用支付API
  gameStore.createPaymentOrder(orderData)
    .then(response => {
      // 处理支付跳转
      if (response.payUrl) {
        window.open(response.payUrl, '_blank');
      }
      rechargeDialogVisible.value = false;
    })
    .catch(error => {
      console.error('支付失败', error);
    });
};

// 处理下拉菜单命令
const handleCommand = (command) => {
  switch (command) {
    case 'profile':
      router.push('/game/character/info');
      break;
    case 'settings':
      router.push('/game/settings');
      break;
    case 'cdk':
      router.push('/game/cdk');
      break;
    case 'admin':
      router.push('/admin');
      break;
    case 'logout':
      logout();
      router.push('/login');
      break;
  }
};

// 获取通知图标
const getNotificationIcon = (type) => {
  switch (type) {
    case 'success':
      return 'SuccessFilled';
    case 'warning':
      return 'WarningFilled';
    case 'error':
      return 'WarningFilled';
    default:
      return 'InfoFilled';
  }
};

// 生命周期钩子
onMounted(() => {
  // 初始化WebSocket连接
  gameSocket = getGameSocket();
  
  // 加载用户资源
  gameStore.loadResources();
  
  // 设置游戏状态
  gameStore.setGameActive(true);
  
  // 监听游戏事件
  gameSocket.on('resource_update', (data) => {
    gameStore.updateResources(data);
  });
  
  gameSocket.on('game_notification', (data) => {
    notificationStore.addNotification({
      type: data.type || 'info',
      message: data.message
    });
  });
});

onBeforeUnmount(() => {
  // 清理WebSocket监听器
  if (gameSocket) {
    gameSocket.off('resource_update');
    gameSocket.off('game_notification');
  }
  
  // 设置游戏状态
  gameStore.setGameActive(false);
});
</script>

<style scoped>
.game-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: url('@/assets/bg/game-bg.jpg') no-repeat center center fixed;
  background-size: cover;
  color: #fff;
}

.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background-color: rgba(0, 0, 0, 0.7);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.logo-area {
  flex: 0 0 200px;
}

.game-logo {
  height: 40px;
}

.nav-area {
  display: flex;
  justify-content: center;
  flex: 1;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 5px 15px;
  margin: 0 5px;
  color: #ccc;
  text-decoration: none;
  border-radius: 4px;
  transition: all 0.3s;
}

.nav-item:hover {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.1);
}

.nav-item.active {
  color: #ffcc00;
  background-color: rgba(255, 204, 0, 0.1);
}

.nav-item .el-icon {
  font-size: 20px;
  margin-bottom: 2px;
}

.user-area {
  display: flex;
  align-items: center;
}

.resource-display {
  display: flex;
  margin-right: 20px;
}

.resource-item {
  display: flex;
  align-items: center;
  margin-right: 15px;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 5px 10px;
  border-radius: 20px;
}

.resource-icon {
  width: 20px;
  height: 20px;
  margin-right: 5px;
}

.user-info {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: 20px;
  background-color: rgba(0, 0, 0, 0.5);
  transition: all 0.3s;
}

.user-info:hover {
  background-color: rgba(0, 0, 0, 0.7);
}

.user-details {
  margin-left: 10px;
  display: flex;
  flex-direction: column;
}

.username {
  font-weight: bold;
  font-size: 14px;
}

.user-level {
  font-size: 12px;
  color: #ffcc00;
}

.game-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.game-footer {
  background-color: rgba(0, 0, 0, 0.7);
  padding: 15px 20px;
  text-align: center;
}

.footer-nav {
  margin-bottom: 10px;
}

.footer-nav-item {
  color: #ccc;
  text-decoration: none;
  margin: 0 10px;
  font-size: 12px;
}

.footer-nav-item:hover {
  color: #fff;
  text-decoration: underline;
}

.footer-info {
  color: #999;
  font-size: 12px;
  display: flex;
  justify-content: space-between;
}

/* 充值对话框样式 */
.recharge-content {
  padding: 10px 0;
}

.recharge-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}

.recharge-option {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 10px;
  text-align: center;
  cursor: pointer;
  position: relative;
  transition: all 0.3s;
}

.recharge-option:hover {
  border-color: #409eff;
  background-color: #f5f7fa;
}

.recharge-option.active {
  border-color: #409eff;
  background-color: #ecf5ff;
}

.option-amount {
  font-size: 16px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.option-price {
  margin-top: 5px;
  color: #f56c6c;
}

.option-bonus {
  position: absolute;
  top: -5px;
  right: -5px;
  background-color: #f56c6c;
  color: white;
  border-radius: 10px;
  padding: 2px 5px;
  font-size: 12px;
}

.section-title {
  margin-bottom: 10px;
  font-weight: bold;
}

/* 通知样式 */
.game-notifications {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 9999;
  width: 300px;
}

.notification-item {
  display: flex;
  align-items: center;
  padding: 10px 15px;
  margin-bottom: 10px;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  background-color: #fff;
  color: #333;
}

.notification-item.success {
  background-color: #f0f9eb;
  color: #67c23a;
}

.notification-item.warning {
  background-color: #fdf6ec;
  color: #e6a23c;
}

.notification-item.error {
  background-color: #fef0f0;
  color: #f56c6c;
}

.notification-icon {
  margin-right: 10px;
  font-size: 18px;
}

.notification-content {
  flex: 1;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.notification-leave-to {
  opacity: 0;
  transform: translateY(-30px);
}
</style> 