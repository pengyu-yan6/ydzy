/**
 * 管理系统路由配置
 */
import AdminLayout from '@/layouts/AdminLayout.vue';

export default {
  path: '/admin',
  component: AdminLayout,
  meta: { requiresAuth: true, roles: ['admin', 'moderator'] },
  children: [
    {
      path: '',
      name: 'AdminDashboard',
      component: () => import('@/views/admin/Dashboard.vue'),
      meta: { title: '管理控制台' }
    },
    // 支付管理相关路由
    {
      path: 'payment',
      name: 'PaymentManagement',
      component: () => import('@/views/admin/payment/Index.vue'),
      meta: { title: '支付管理' },
      children: [
        {
          path: 'wechat',
          name: 'WechatPaymentSettings',
          component: () => import('@/views/admin/payment/WechatSettings.vue'),
          meta: { title: '微信支付配置' }
        },
        {
          path: 'alipay',
          name: 'AlipaySettings',
          component: () => import('@/views/admin/payment/AlipaySettings.vue'),
          meta: { title: '支付宝配置' }
        },
        {
          path: 'orders',
          name: 'OrderManagement',
          component: () => import('@/views/admin/payment/OrderManagement.vue'),
          meta: { title: '订单管理' }
        },
        {
          path: 'statistics',
          name: 'PaymentStatistics',
          component: () => import('@/views/admin/payment/Statistics.vue'),
          meta: { title: '支付统计' }
        }
      ]
    },
    // CDK管理相关路由
    {
      path: 'cdk',
      name: 'CDKManagement',
      component: () => import('@/views/admin/cdk/Index.vue'),
      meta: { title: 'CDK管理' },
      children: [
        {
          path: 'generator',
          name: 'CDKGenerator',
          component: () => import('@/views/admin/cdk/Generator.vue'),
          meta: { title: 'CDK生成器' }
        },
        {
          path: 'records',
          name: 'CDKRecords',
          component: () => import('@/views/admin/cdk/Records.vue'),
          meta: { title: 'CDK记录' }
        },
        {
          path: 'statistics',
          name: 'CDKStatistics',
          component: () => import('@/views/admin/cdk/Statistics.vue'),
          meta: { title: 'CDK统计分析' }
        }
      ]
    },
    // 用户管理路由
    {
      path: 'users',
      name: 'UserManagement',
      component: () => import('@/views/admin/user/Index.vue'),
      meta: { title: '用户管理' },
      children: [
        {
          path: 'list',
          name: 'UserList',
          component: () => import('@/views/admin/user/UserList.vue'),
          meta: { title: '用户列表' }
        },
        {
          path: 'roles',
          name: 'RoleManagement',
          component: () => import('@/views/admin/user/RoleManagement.vue'),
          meta: { title: '角色管理' }
        }
      ]
    },
    // 系统设置路由
    {
      path: 'settings',
      name: 'SystemSettings',
      component: () => import('@/views/admin/settings/Index.vue'),
      meta: { title: '系统设置' },
      children: [
        {
          path: 'security',
          name: 'SecuritySettings',
          component: () => import('@/views/admin/settings/SecuritySettings.vue'),
          meta: { title: '安全设置' }
        },
        {
          path: 'audit-logs',
          name: 'AuditLogs',
          component: () => import('@/views/admin/settings/AuditLogs.vue'),
          meta: { title: '审计日志' }
        }
      ]
    }
  ]
}; 