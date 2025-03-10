/**
 * 路由守卫工具
 * 用于保护需要登录或特定权限的路由
 */

import { isLoggedIn, hasRole, getUserRole, isTokenExpiringSoon } from './auth';
import { encryptData } from './security/signature';

/**
 * 检查用户是否有权限访问路由
 * @param {Object} route - 路由对象
 * @returns {boolean} 是否有权限访问
 */
export function checkRoutePermission(route) {
  // 检查路由是否需要身份验证
  if (route.meta && route.meta.requiresAuth) {
    // 用户未登录
    if (!isLoggedIn()) {
      return false;
    }
    
    // 检查是否需要特定角色
    if (route.meta.roles) {
      return hasRole(route.meta.roles);
    }
  }
  
  return true;
}

/**
 * 获取未授权时的重定向路径
 * @param {Object} route - 当前路由对象
 * @param {string} defaultPath - 默认重定向路径
 * @returns {Object} 重定向对象
 */
export function getAuthRedirect(route, defaultPath = '/login') {
  // 如果路由不需要身份验证，则不重定向
  if (!route.meta || !route.meta.requiresAuth) {
    return null;
  }
  
  // 用户未登录，重定向到登录页面
  if (!isLoggedIn()) {
    // 加密当前路径，以便登录后重定向回来
    const redirectPath = encryptData(route.fullPath);
    
    return {
      path: defaultPath,
      query: { redirect: redirectPath }
    };
  }
  
  // 检查用户角色
  if (route.meta.roles) {
    const userRole = getUserRole();
    
    // 用户没有所需角色
    if (!userRole || !hasRole(route.meta.roles)) {
      return { path: '/403' };
    }
  }
  
  return null;
}

/**
 * Vue Router 前置守卫
 * 用于 Vue Router 的 beforeEach 钩子
 * @param {Object} to - 目标路由
 * @param {Object} from - 来源路由
 * @param {Function} next - 路由解析函数
 */
export function beforeEachGuard(to, from, next) {
  // 检查路由是否需要身份验证
  if (to.matched.some(record => record.meta.requiresAuth)) {
    // 用户未登录
    if (!isLoggedIn()) {
      // 保存目标路径用于登录后重定向
      const redirectPath = encryptData(to.fullPath);
      
      next({
        path: '/login',
        query: { redirect: redirectPath }
      });
      return;
    }
    
    // 检查Token是否即将过期
    if (isTokenExpiringSoon()) {
      // 此处可以触发刷新Token操作
      console.log('Token即将过期，准备刷新');
      // refreshToken().catch(() => {
      //   next({ path: '/login' });
      //   return;
      // });
    }
    
    // 检查用户角色
    const requiresRoles = to.matched.find(record => record.meta.roles)?.meta.roles;
    
    if (requiresRoles && !hasRole(requiresRoles)) {
      next({ path: '/403' });
      return;
    }
  }
  
  // 允许访问
  next();
}

/**
 * 根据角色过滤路由
 * @param {Array} routes - 路由配置数组
 * @param {string|Array} roles - 用户角色或角色数组
 * @returns {Array} 过滤后的路由
 */
export function filterRoutesByRole(routes, roles) {
  return routes.filter(route => {
    // 克隆路由以避免修改原始配置
    const r = { ...route };
    
    // 检查当前路由是否需要角色
    if (r.meta && r.meta.roles) {
      // 检查用户是否有权访问
      if (!hasRole(r.meta.roles)) {
        return false;
      }
    }
    
    // 如果有子路由，递归过滤
    if (r.children) {
      r.children = filterRoutesByRole(r.children, roles);
    }
    
    return true;
  });
}

/**
 * 生成动态路由配置
 * 根据用户权限生成可访问的路由
 * @returns {Array} 动态路由配置
 */
export function generateDynamicRoutes() {
  const userRole = getUserRole();
  
  if (!userRole) {
    return [];
  }
  
  // 根据角色生成不同的路由
  // 这里仅示例，实际应使用预定义的路由配置
  let routes = [];
  
  switch (userRole) {
    case 'admin':
      routes = [
        {
          path: '/admin',
          name: 'Admin',
          component: () => import('../views/admin/AdminDashboard.vue'),
          meta: { requiresAuth: true, roles: ['admin'] },
          children: [
            {
              path: 'users',
              name: 'UserManagement',
              component: () => import('../views/admin/UserManagement.vue'),
              meta: { requiresAuth: true, roles: ['admin'] }
            },
            {
              path: 'system',
              name: 'SystemSettings',
              component: () => import('../views/admin/SystemSettings.vue'),
              meta: { requiresAuth: true, roles: ['admin'] }
            }
          ]
        }
      ];
      break;
      
    case 'moderator':
      routes = [
        {
          path: '/moderator',
          name: 'Moderator',
          component: () => import('../views/moderator/ModeratorDashboard.vue'),
          meta: { requiresAuth: true, roles: ['admin', 'moderator'] },
          children: [
            {
              path: 'reports',
              name: 'Reports',
              component: () => import('../views/moderator/Reports.vue'),
              meta: { requiresAuth: true, roles: ['admin', 'moderator'] }
            }
          ]
        }
      ];
      break;
      
    case 'user':
    default:
      routes = [
        {
          path: '/user',
          name: 'UserProfile',
          component: () => import('../views/user/UserProfile.vue'),
          meta: { requiresAuth: true }
        }
      ];
      break;
  }
  
  return routes;
}

export default {
  checkRoutePermission,
  getAuthRedirect,
  beforeEachGuard,
  filterRoutesByRole,
  generateDynamicRoutes
}; 