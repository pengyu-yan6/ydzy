<template>
  <view class="game-container">
    <!-- 顶部信息栏 -->
    <view class="top-bar">
      <view class="user-info">
        <image class="avatar" src="/assets/avatar-placeholder.png" />
        <view class="user-details">
          <text class="username">玩家名称</text>
          <text class="level">等级: 1</text>
        </view>
      </view>
      <view class="resources">
        <view class="resource-item">
          <image class="resource-icon" src="/assets/coin-icon.png" />
          <text class="resource-value">1000</text>
        </view>
        <view class="resource-item">
          <image class="resource-icon" src="/assets/gem-icon.png" />
          <text class="resource-value">50</text>
        </view>
      </view>
    </view>

    <!-- 主游戏区域 -->
    <view class="game-main">
      <view class="game-title">
        <text>战斗冒险</text>
      </view>
      
      <!-- 角色展示区 -->
      <view class="character-showcase">
        <image class="character-image" src="/assets/character-placeholder.png" />
        <view class="character-stats">
          <text class="character-name">勇者</text>
          <view class="stats-bar health">
            <text>HP</text>
            <view class="bar-bg">
              <view class="bar-fill" style="width: 80%;"></view>
            </view>
            <text>800/1000</text>
          </view>
          <view class="stats-bar mana">
            <text>MP</text>
            <view class="bar-bg">
              <view class="bar-fill" style="width: 60%;"></view>
            </view>
            <text>60/100</text>
          </view>
        </view>
      </view>

      <!-- 游戏功能按钮区 -->
      <view class="game-actions">
        <view class="action-button" @tap="navigateToBattle">
          <image class="action-icon" src="/assets/battle-icon.png" />
          <text>战斗</text>
        </view>
        <view class="action-button" @tap="navigateToCharacter">
          <image class="action-icon" src="/assets/character-icon.png" />
          <text>角色</text>
        </view>
        <view class="action-button" @tap="navigateToShop">
          <image class="action-icon" src="/assets/shop-icon.png" />
          <text>商城</text>
        </view>
        <view class="action-button" @tap="navigateToGuild">
          <image class="action-icon" src="/assets/guild-icon.png" />
          <text>公会</text>
        </view>
      </view>

      <!-- 活动公告区 -->
      <view class="announcements">
        <view class="announcement-title">
          <text>活动公告</text>
        </view>
        <swiper class="announcement-swiper" autoplay circular interval="3000">
          <swiper-item v-for="(item, index) in announcements" :key="index">
            <view class="announcement-item">
              <text class="announcement-text">{{ item }}</text>
            </view>
          </swiper-item>
        </swiper>
      </view>
    </view>

    <!-- 底部导航栏 -->
    <view class="bottom-nav">
      <view class="nav-item active">
        <image class="nav-icon" src="/assets/home-icon.png" />
        <text>主页</text>
      </view>
      <view class="nav-item">
        <image class="nav-icon" src="/assets/battle-icon.png" />
        <text>战斗</text>
      </view>
      <view class="nav-item">
        <image class="nav-icon" src="/assets/shop-icon.png" />
        <text>商城</text>
      </view>
      <view class="nav-item">
        <image class="nav-icon" src="/assets/settings-icon.png" />
        <text>设置</text>
      </view>
    </view>
  </view>
</template>

<script>
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import './index.css'

export default {
  setup () {
    // 公告数据
    const announcements = ref([
      '欢迎来到战斗冒险游戏！',
      '新活动：限时双倍金币获取中！',
      '新角色「暗影刺客」已上线，前往商城查看！',
      '参与每日任务可获得丰厚奖励！'
    ])

    // 页面导航方法
    const navigateToBattle = () => {
      Taro.showToast({
        title: '战斗功能开发中...',
        icon: 'none'
      })
    }

    const navigateToCharacter = () => {
      Taro.showToast({
        title: '角色功能开发中...',
        icon: 'none'
      })
    }

    const navigateToShop = () => {
      Taro.showToast({
        title: '商城功能开发中...',
        icon: 'none'
      })
    }

    const navigateToGuild = () => {
      Taro.showToast({
        title: '公会功能开发中...',
        icon: 'none'
      })
    }

    return {
      announcements,
      navigateToBattle,
      navigateToCharacter,
      navigateToShop,
      navigateToGuild
    }
  }
}
</script>