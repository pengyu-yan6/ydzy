<template>
  <div id="app" :class="{ 'dark-mode': isDarkMode }">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    
    <!-- 全局加载指示器 -->
    <div v-if="loading" class="global-loading">
      <div class="loading-spinner">
        <el-icon class="is-loading"><Loading /></el-icon>
      </div>
      <div class="loading-text">{{ loadingText }}</div>
    </div>
    
    <!-- 全局通知 -->
    <div class="global-notifications">
      <transition-group name="notification">
        <div 
          v-for="notification in notifications" 
          :key="notification.id"
          class="notification-item"
          :class="notification.type"
        >
          <el-icon class="notification-icon">
            <component :is="getNotificationIcon(notification.type)" />
          </el-icon>
          <span class="notification-content">{{ notification.message }}</span>
          <el-icon class="notification-close" @click="removeNotification(notification.id)">
            <Close />
          </el-icon>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useUserStore } from './stores/user';
import { useGameStore } from './stores/game';
import { useNotificationStore } from './stores/notification';
import { Loading, Close, SuccessFilled, WarningFilled, InfoFilled } from '@element-plus/icons-vue';
import config from './config';

// 路由和状态
const route = useRoute();
const userStore = useUserStore();
const gameStore = useGameStore();
const notificationStore = useNotificationStore();

// 从状态中提取响应式属性
const { loading: userLoading } = storeToRefs(userStore);
const { gameLoading } = storeToRefs(gameStore);
const { notifications } = storeToRefs(notificationStore);

// 全局加载状态
const loading = computed(() => userLoading.value || gameLoading.value);
const loadingText = ref('加载中...');

// 暗黑模式
const isDarkMode = ref(config.UI_CONFIG.theme === 'dark' || 
  (config.UI_CONFIG.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches));

// 获取通知图标
const getNotificationIcon = (type) => {
  switch (type) {
    case 'success':
      return 'SuccessFilled';
    case 'warning':
    case 'error':
      return 'WarningFilled';
    default:
      return 'InfoFilled';
  }
};

// 移除通知
const removeNotification = (id) => {
  notificationStore.removeNotification(id);
};

// 监听路由变化
watch(() => route.path, (newPath) => {
  // 根据路由设置页面标题
  if (route.meta.title) {
    document.title = `${route.meta.title} - 游戏名称`;
  } else {
    document.title = '游戏名称';
  }
  
  // 如果进入游戏路由，设置游戏活动状态
  if (newPath.startsWith('/game')) {
    gameStore.setGameActive(true);
  } else {
    gameStore.setGameActive(false);
  }
});

// 监听暗黑模式媒体查询
onMounted(() => {
  if (config.UI_CONFIG.theme === 'auto') {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleDarkModeChange = (e) => {
      isDarkMode.value = e.matches;
    };
    
    darkModeMediaQuery.addEventListener('change', handleDarkModeChange);
    
    // 清理函数
    return () => {
      darkModeMediaQuery.removeEventListener('change', handleDarkModeChange);
    };
  }
});
</script>

<style>
/* 全局样式 */
:root {
  --primary-color: #409eff;
  --success-color: #67c23a;
  --warning-color: #e6a23c;
  --danger-color: #f56c6c;
  --info-color: #909399;
  
  --text-color: #303133;
  --text-color-secondary: #606266;
  --border-color: #dcdfe6;
  --background-color: #f5f7fa;
  
  --header-height: 60px;
  --sidebar-width: 220px;
  --sidebar-collapsed-width: 64px;
  
  --transition-duration: 0.3s;
}

/* 暗黑模式变量 */
.dark-mode {
  --primary-color: #409eff;
  --success-color: #67c23a;
  --warning-color: #e6a23c;
  --danger-color: #f56c6c;
  --info-color: #909399;
  
  --text-color: #e0e0e0;
  --text-color-secondary: #a0a0a0;
  --border-color: #434343;
  --background-color: #1f1f1f;
}

/* 基础样式 */
html, body {
  margin: 0;
  padding: 0;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
  font-size: 16px;
  color: var(--text-color);
  background-color: var(--background-color);
  height: 100%;
  width: 100%;
}

#app {
  height: 100%;
  width: 100%;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-duration) ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 全局加载指示器 */
.global-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.loading-spinner {
  font-size: 48px;
  color: var(--primary-color);
}

.loading-text {
  margin-top: 16px;
  color: #fff;
  font-size: 18px;
}

/* 全局通知 */
.global-notifications {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  width: 320px;
}

.notification-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 10px;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  background-color: #fff;
  color: var(--text-color);
  transition: all 0.3s;
}

.notification-item.success {
  background-color: #f0f9eb;
  color: var(--success-color);
}

.notification-item.warning {
  background-color: #fdf6ec;
  color: var(--warning-color);
}

.notification-item.error {
  background-color: #fef0f0;
  color: var(--danger-color);
}

.notification-item.info {
  background-color: #f4f4f5;
  color: var(--info-color);
}

.notification-icon {
  margin-right: 10px;
  font-size: 20px;
}

.notification-content {
  flex: 1;
}

.notification-close {
  cursor: pointer;
  font-size: 16px;
  opacity: 0.7;
  transition: opacity 0.3s;
}

.notification-close:hover {
  opacity: 1;
}

/* 通知动画 */
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

/* 暗黑模式通知样式 */
.dark-mode .notification-item {
  background-color: #2c2c2c;
  color: #e0e0e0;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.3);
}

.dark-mode .notification-item.success {
  background-color: rgba(103, 194, 58, 0.2);
}

.dark-mode .notification-item.warning {
  background-color: rgba(230, 162, 60, 0.2);
}

.dark-mode .notification-item.error {
  background-color: rgba(245, 108, 108, 0.2);
}

.dark-mode .notification-item.info {
  background-color: rgba(144, 147, 153, 0.2);
}
</style> 