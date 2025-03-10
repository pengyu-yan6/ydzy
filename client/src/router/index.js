/**
 * 路由配置主文件
 */
import { createRouter, createWebHistory } from 'vue-router';
import { beforeEachGuard } from '@/utils/routeGuard';
import adminRoutes from './adminRoutes';
import gameRoutes from './gameRoutes';

// 基础路由
const baseRoutes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: { title: '首页' }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/Login.vue'),
    meta: { title: '登录' }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/auth/Register.vue'),
    meta: { title: '注册' }
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: () => import('@/views/auth/ForgotPassword.vue'),
    meta: { title: '忘记密码' }
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('@/views/auth/ResetPassword.vue'),
    meta: { title: '重置密码' }
  },
  {
    path: '/verify-email',
    name: 'VerifyEmail',
    component: () => import('@/views/auth/VerifyEmail.vue'),
    meta: { title: '验证邮箱' }
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无权限访问' }
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: { title: '页面未找到' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404'
  }
];

// 合并所有路由
const routes = [
  ...baseRoutes,
  adminRoutes,
  gameRoutes
];

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  }
});

// 全局前置守卫
router.beforeEach(beforeEachGuard);

// 全局后置钩子 - 设置页面标题
router.afterEach((to) => {
  // 设置页面标题
  const title = to.meta.title || '游戏管理系统';
  document.title = `${title} - 游戏名称`;
  
  // 记录访问历史（可选）
  // logPageView(to.fullPath);
});

export default router; 