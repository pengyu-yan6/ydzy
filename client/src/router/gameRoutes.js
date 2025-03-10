/**
 * 游戏相关路由配置
 */
import GameLayout from '@/layouts/GameLayout.vue';

export default {
  path: '/game',
  component: GameLayout,
  meta: { requiresAuth: true },
  children: [
    {
      path: '',
      name: 'GameLobby',
      component: () => import('@/views/game/Lobby.vue'),
      meta: { title: '游戏大厅' }
    },
    // 战斗相关路由
    {
      path: 'battle',
      name: 'BattleMain',
      component: () => import('@/views/game/battle/Index.vue'),
      meta: { title: '战斗' },
      children: [
        {
          path: 'pve',
          name: 'PVEBattle',
          component: () => import('@/views/game/battle/PVEBattle.vue'),
          meta: { title: 'PVE战斗' }
        },
        {
          path: 'pvp',
          name: 'PVPBattle',
          component: () => import('@/views/game/battle/PVPBattle.vue'),
          meta: { title: 'PVP战斗' }
        },
        {
          path: 'arena',
          name: 'ArenaMatch',
          component: () => import('@/views/game/battle/ArenaMatch.vue'),
          meta: { title: '竞技场' }
        },
        {
          path: 'history',
          name: 'BattleHistory',
          component: () => import('@/views/game/battle/History.vue'),
          meta: { title: '战斗记录' }
        }
      ]
    },
    // 角色相关路由
    {
      path: 'character',
      name: 'CharacterMain',
      component: () => import('@/views/game/character/Index.vue'),
      meta: { title: '角色' },
      children: [
        {
          path: 'info',
          name: 'CharacterInfo',
          component: () => import('@/views/game/character/Info.vue'),
          meta: { title: '角色信息' }
        },
        {
          path: 'equipment',
          name: 'CharacterEquipment',
          component: () => import('@/views/game/character/Equipment.vue'),
          meta: { title: '装备管理' }
        },
        {
          path: 'skills',
          name: 'CharacterSkills',
          component: () => import('@/views/game/character/Skills.vue'),
          meta: { title: '技能管理' }
        }
      ]
    },
    // 公会相关路由
    {
      path: 'guild',
      name: 'GuildMain',
      component: () => import('@/views/game/guild/Index.vue'),
      meta: { title: '公会' },
      children: [
        {
          path: 'info',
          name: 'GuildInfo',
          component: () => import('@/views/game/guild/Info.vue'),
          meta: { title: '公会信息' }
        },
        {
          path: 'members',
          name: 'GuildMembers',
          component: () => import('@/views/game/guild/Members.vue'),
          meta: { title: '成员管理' }
        },
        {
          path: 'activities',
          name: 'GuildActivities',
          component: () => import('@/views/game/guild/Activities.vue'),
          meta: { title: '公会活动' }
        }
      ]
    },
    // 商城相关路由
    {
      path: 'shop',
      name: 'ShopMain',
      component: () => import('@/views/game/shop/Index.vue'),
      meta: { title: '商城' },
      children: [
        {
          path: 'items',
          name: 'ShopItems',
          component: () => import('@/views/game/shop/Items.vue'),
          meta: { title: '道具商城' }
        },
        {
          path: 'skins',
          name: 'ShopSkins',
          component: () => import('@/views/game/shop/Skins.vue'),
          meta: { title: '皮肤商城' }
        },
        {
          path: 'vip',
          name: 'ShopVIP',
          component: () => import('@/views/game/shop/VIP.vue'),
          meta: { title: 'VIP特权' }
        }
      ]
    },
    // 聊天系统
    {
      path: 'chat',
      name: 'ChatSystem',
      component: () => import('@/views/game/chat/Index.vue'),
      meta: { title: '聊天' }
    },
    // 排行榜
    {
      path: 'leaderboard',
      name: 'Leaderboard',
      component: () => import('@/views/game/Leaderboard.vue'),
      meta: { title: '排行榜' }
    },
    // 个人设置
    {
      path: 'settings',
      name: 'GameSettings',
      component: () => import('@/views/game/Settings.vue'),
      meta: { title: '游戏设置' }
    }
  ]
}; 