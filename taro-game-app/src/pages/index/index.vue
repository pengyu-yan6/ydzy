<template>
  <view class="index">
    <view class="header">
      <image class="logo" src="/assets/logo-placeholder.png" />
      <text class="title">战斗冒险</text>
    </view>
    
    <view class="main-buttons">
      <view class="button primary" @tap="navigateToGame">
        <text>开始游戏</text>
      </view>
      <view class="button secondary" @tap="navigateToShop">
        <text>进入商城</text>
      </view>
    </view>
    
    <view class="news-section">
      <view class="section-title">
        <text>最新公告</text>
      </view>
      <view class="news-list">
        <view class="news-item" v-for="(item, index) in newsItems" :key="index">
          <text class="news-title">{{ item.title }}</text>
          <text class="news-date">{{ item.date }}</text>
        </view>
      </view>
    </view>
    
    <view class="footer">
      <text>版本: 1.0.0</text>
    </view>
  </view>
</template>

<script>
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import './index.css'

export default {
  setup () {
    const newsItems = ref([
      { title: '游戏正式上线，欢迎加入战斗冒险！', date: '2023-06-01' },
      { title: '新角色「暗影刺客」现已上线', date: '2023-05-28' },
      { title: '首充活动开启，充值双倍返还', date: '2023-05-25' }
    ])
    
    const navigateToGame = () => {
      Taro.navigateTo({
        url: '/pages/game/index'
      })
    }
    
    const navigateToShop = () => {
      Taro.navigateTo({
        url: '/pages/shop/index'
      })
    }
    
    return {
      newsItems,
      navigateToGame,
      navigateToShop
    }
  }
}
</script>
