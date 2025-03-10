/**
 * 应用入口文件
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

import App from './App.vue';
import router from './router';
import { globalErrorHandler } from './utils/errorHandler';
import { enableAntiDebugging, handleDebuggerDetection } from './utils/security/anti-debug';
import config from './config';

import './assets/styles/main.css';

// 创建应用实例
const app = createApp(App);

// 注册所有Element Plus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

// 注册全局错误处理器
app.config.errorHandler = globalErrorHandler;

// 使用插件
app.use(createPinia());
app.use(router);
app.use(ElementPlus, {
  locale: zhCn,
  size: 'default',
  zIndex: 3000
});

// 在生产环境启用反调试措施
if (config.isProd && config.SECURITY_CONFIG.antiDebug.enabled) {
  enableAntiDebugging(handleDebuggerDetection, config.SECURITY_CONFIG.antiDebug.aggressiveMode);
}

// 挂载应用
app.mount('#app');

// 初始化用户和游戏状态
import { useUserStore } from './stores/user';
import { useGameStore } from './stores/game';

const userStore = useUserStore();
const gameStore = useGameStore();

// 初始化用户状态
userStore.initialize().then(() => {
  // 如果用户已登录，初始化游戏状态
  if (userStore.isLoggedIn) {
    gameStore.initialize();
  }
}); 