<template>
  <div class="admin-layout">
    <el-container class="layout-container">
      <el-aside :width="sidebarCollapsed ? '64px' : '220px'" class="sidebar-container">
        <div class="logo-container">
          <img v-if="sidebarCollapsed" src="@/assets/logo-small.png" alt="Logo" class="logo-small" />
          <img v-else src="@/assets/logo.png" alt="Logo" class="logo" />
        </div>
        <el-menu
          :default-active="activeMenu"
          :collapse="sidebarCollapsed"
          :collapse-transition="false"
          class="sidebar-menu"
          background-color="#001529"
          text-color="#fff"
          active-text-color="#409EFF"
          router
        >
          <el-menu-item index="/admin">
            <el-icon><Dashboard /></el-icon>
            <template #title>控制台</template>
          </el-menu-item>
          
          <el-sub-menu index="/admin/payment">
            <template #title>
              <el-icon><Money /></el-icon>
              <span>支付管理</span>
            </template>
            <el-menu-item index="/admin/payment/wechat">微信支付配置</el-menu-item>
            <el-menu-item index="/admin/payment/alipay">支付宝配置</el-menu-item>
            <el-menu-item index="/admin/payment/orders">订单管理</el-menu-item>
            <el-menu-item index="/admin/payment/statistics">支付统计</el-menu-item>
          </el-sub-menu>
          
          <el-sub-menu index="/admin/cdk">
            <template #title>
              <el-icon><Key /></el-icon>
              <span>CDK管理</span>
            </template>
            <el-menu-item index="/admin/cdk/generator">CDK生成器</el-menu-item>
            <el-menu-item index="/admin/cdk/records">CDK记录</el-menu-item>
            <el-menu-item index="/admin/cdk/statistics">CDK统计分析</el-menu-item>
          </el-sub-menu>
          
          <el-sub-menu index="/admin/users">
            <template #title>
              <el-icon><User /></el-icon>
              <span>用户管理</span>
            </template>
            <el-menu-item index="/admin/users/list">用户列表</el-menu-item>
            <el-menu-item index="/admin/users/roles">角色管理</el-menu-item>
          </el-sub-menu>
          
          <el-sub-menu index="/admin/settings">
            <template #title>
              <el-icon><Setting /></el-icon>
              <span>系统设置</span>
            </template>
            <el-menu-item index="/admin/settings/security">安全设置</el-menu-item>
            <el-menu-item index="/admin/settings/audit-logs">审计日志</el-menu-item>
          </el-sub-menu>
          
          <el-menu-item index="/game">
            <el-icon><Monitor /></el-icon>
            <template #title>进入游戏</template>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <el-container class="main-container">
        <el-header class="header">
          <div class="header-left">
            <el-button
              type="text"
              @click="toggleSidebar"
              class="toggle-button"
            >
              <el-icon v-if="sidebarCollapsed"><Expand /></el-icon>
              <el-icon v-else><Fold /></el-icon>
            </el-button>
            <breadcrumb />
          </div>
          
          <div class="header-right">
            <el-tooltip content="全屏" placement="bottom">
              <el-button type="text" @click="toggleFullscreen" class="action-button">
                <el-icon v-if="isFullscreen"><FullscreenExit /></el-icon>
                <el-icon v-else><FullScreen /></el-icon>
              </el-button>
            </el-tooltip>
            
            <el-dropdown trigger="click" @command="handleCommand">
              <div class="user-info">
                <el-avatar :size="32" :src="userAvatar" />
                <span class="username">{{ userName }}</span>
                <el-icon><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">个人资料</el-dropdown-item>
                  <el-dropdown-item command="settings">账号设置</el-dropdown-item>
                  <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>
        
        <el-main class="main-content">
          <router-view v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <keep-alive :include="cachedViews">
                <component :is="Component" />
              </keep-alive>
            </transition>
          </router-view>
        </el-main>
        
        <el-footer class="footer">
          <div class="footer-content">
            <span>© {{ currentYear }} 游戏名称 版权所有</span>
            <span>管理系统 v1.0.0</span>
          </div>
        </el-footer>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { logout } from '@/utils/auth';
import Breadcrumb from '@/components/admin/Breadcrumb.vue';
import {
  Dashboard, Money, Key, User, Setting, Monitor,
  Expand, Fold, FullScreen, FullscreenExit, ArrowDown
} from '@element-plus/icons-vue';

// 路由和用户信息
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

// 侧边栏状态
const sidebarCollapsed = ref(false);
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  // 可以保存到localStorage，使刷新后保持状态
  localStorage.setItem('adminSidebarCollapsed', sidebarCollapsed.value);
};

// 全屏状态
const isFullscreen = ref(false);
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    isFullscreen.value = true;
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
      isFullscreen.value = false;
    }
  }
};

// 用户信息
const userName = computed(() => userStore.userName || '管理员');
const userAvatar = computed(() => userStore.userAvatar || 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png');

// 当前年份
const currentYear = new Date().getFullYear();

// 缓存的视图
const cachedViews = ['AdminDashboard', 'PaymentStatistics', 'CDKStatistics'];

// 当前激活的菜单
const activeMenu = computed(() => {
  return route.path;
});

// 处理下拉菜单命令
const handleCommand = (command) => {
  switch (command) {
    case 'profile':
      router.push('/admin/profile');
      break;
    case 'settings':
      router.push('/admin/settings');
      break;
    case 'logout':
      logout();
      router.push('/login');
      break;
  }
};

// 组件挂载时
onMounted(() => {
  // 从localStorage恢复侧边栏状态
  const savedState = localStorage.getItem('adminSidebarCollapsed');
  if (savedState !== null) {
    sidebarCollapsed.value = savedState === 'true';
  }
  
  // 监听全屏变化事件
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement;
  });
});
</script>

<style scoped>
.admin-layout {
  height: 100vh;
  width: 100%;
}

.layout-container {
  height: 100%;
}

.sidebar-container {
  background-color: #001529;
  transition: width 0.3s;
  overflow: hidden;
  box-shadow: 2px 0 6px rgba(0, 21, 41, 0.35);
  z-index: 10;
}

.logo-container {
  height: 60px;
  padding: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #002140;
}

.logo {
  height: 32px;
  width: auto;
}

.logo-small {
  height: 32px;
  width: 32px;
}

.sidebar-menu {
  border-right: none;
  height: calc(100% - 60px);
}

.main-container {
  background-color: #f0f2f5;
  display: flex;
  flex-direction: column;
}

.header {
  background-color: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 60px;
}

.header-left, .header-right {
  display: flex;
  align-items: center;
}

.toggle-button {
  font-size: 20px;
  margin-right: 16px;
}

.action-button {
  font-size: 18px;
  margin: 0 8px;
}

.user-info {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 0 8px;
}

.username {
  margin: 0 8px;
  font-size: 14px;
}

.main-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.footer {
  height: 40px;
  background-color: #fff;
  border-top: 1px solid #e8e8e8;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 16px;
  color: #666;
  font-size: 12px;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style> 