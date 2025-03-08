<template>
  <view class="shop-container">
    <!-- 顶部信息栏 -->
    <view class="top-bar">
      <view class="back-button" @tap="navigateBack">
        <text class="back-icon">←</text>
        <text>返回</text>
      </view>
      <view class="page-title">游戏商城</view>
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

    <!-- 商城分类标签 -->
    <view class="shop-tabs">
      <view 
        v-for="(tab, index) in tabs" 
        :key="index"
        :class="['tab-item', activeTab === index ? 'active' : '']"
        @tap="activeTab = index"
      >
        <text>{{ tab }}</text>
      </view>
    </view>

    <!-- 商品列表区域 -->
    <scroll-view class="products-container" scroll-y>
      <!-- 热门商品轮播 -->
      <swiper v-if="activeTab === 0" class="hot-products-swiper" autoplay circular indicator-dots>
        <swiper-item v-for="(item, index) in hotProducts" :key="index">
          <view class="hot-product-item">
            <image class="hot-product-image" :src="item.image" />
            <view class="hot-product-info">
              <text class="hot-product-name">{{ item.name }}</text>
              <text class="hot-product-desc">{{ item.description }}</text>
              <view class="hot-product-price-row">
                <view class="product-price">
                  <image class="price-icon" :src="item.priceType === 'coin' ? '/assets/coin-icon.png' : '/assets/gem-icon.png'" />
                  <text>{{ item.price }}</text>
                </view>
                <view class="buy-button" @tap="handleBuy(item)">
                  <text>购买</text>
                </view>
              </view>
            </view>
          </view>
        </swiper-item>
      </swiper>

      <!-- 商品网格 -->
      <view class="products-grid">
        <view 
          v-for="(product, index) in filteredProducts" 
          :key="index"
          class="product-card"
          @tap="showProductDetail(product)"
        >
          <image class="product-image" :src="product.image" />
          <view class="product-info">
            <text class="product-name">{{ product.name }}</text>
            <view class="product-price">
              <image class="price-icon" :src="product.priceType === 'coin' ? '/assets/coin-icon.png' : '/assets/gem-icon.png'" />
              <text>{{ product.price }}</text>
            </view>
          </view>
          <view class="buy-button" @tap.stop="handleBuy(product)">
            <text>购买</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 商品详情弹窗 -->
    <view v-if="showDetail" class="product-detail-modal">
      <view class="modal-content">
        <view class="modal-close" @tap="showDetail = false">×</view>
        <image class="detail-image" :src="selectedProduct.image" />
        <text class="detail-name">{{ selectedProduct.name }}</text>
        <text class="detail-description">{{ selectedProduct.description }}</text>
        <view class="detail-attributes">
          <view v-for="(value, key) in selectedProduct.attributes" :key="key" class="attribute-item">
            <text class="attribute-name">{{ key }}:</text>
            <text class="attribute-value">{{ value }}</text>
          </view>
        </view>
        <view class="detail-price-row">
          <view class="product-price">
            <image class="price-icon" :src="selectedProduct.priceType === 'coin' ? '/assets/coin-icon.png' : '/assets/gem-icon.png'" />
            <text>{{ selectedProduct.price }}</text>
          </view>
          <view class="buy-button large" @tap="handleBuy(selectedProduct)">
            <text>立即购买</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { ref, computed } from 'vue'
import Taro from '@tarojs/taro'
import './index.css'

export default {
  setup () {
    // 商城分类
    const tabs = ref(['热门', '道具', '角色', '礼包', '限时'])
    const activeTab = ref(0)

    // 热门商品数据
    const hotProducts = ref([
      {
        id: 'hot1',
        name: '限时特惠礼包',
        description: '超值礼包！包含1000金币和100钻石，限时7折优惠！',
        price: 68,
        priceType: 'gem',
        image: '/assets/product-placeholder.png',
        type: '礼包',
        attributes: {
          '内含金币': '1000',
          '内含钻石': '100',
          '限时折扣': '7折'
        }
      },
      {
        id: 'hot2',
        name: '暗影刺客角色',
        description: '全新角色：暗影刺客，拥有超高爆发伤害和隐身能力',
        price: 120,
        priceType: 'gem',
        image: '/assets/product-placeholder.png',
        type: '角色',
        attributes: {
          '职业': '刺客',
          '稀有度': '传说',
          '特殊技能': '暗影突袭'
        }
      }
    ])

    // 所有商品数据
    const allProducts = ref([
      {
        id: 'item1',
        name: '初级体力药水',
        description: '恢复30点体力值',
        price: 500,
        priceType: 'coin',
        image: '/assets/product-placeholder.png',
        type: '道具',
        attributes: {
          '效果': '恢复30点体力',
          '冷却时间': '无',
          '使用限制': '每日10次'
        }
      },
      {
        id: 'item2',
        name: '中级体力药水',
        description: '恢复60点体力值',
        price: 1000,
        priceType: 'coin',
        image: '/assets/product-placeholder.png',
        type: '道具',
        attributes: {
          '效果': '恢复60点体力',
          '冷却时间': '无',
          '使用限制': '每日5次'
        }
      },
      {
        id: 'item3',
        name: '高级体力药水',
        description: '恢复100点体力值',
        price: 20,
        priceType: 'gem',
        image: '/assets/product-placeholder.png',
        type: '道具',
        attributes: {
          '效果': '恢复100点体力',
          '冷却时间': '无',
          '使用限制': '无限制'
        }
      },
      {
        id: 'char1',
        name: '战士角色',
        description: '基础战士角色，拥有较高的生命值和防御力',
        price: 2000,
        priceType: 'coin',
        image: '/assets/product-placeholder.png',
        type: '角色',
        attributes: {
          '职业': '战士',
          '稀有度': '普通',
          '特殊技能': '盾牌冲锋'
        }
      },
      {
        id: 'char2',
        name: '法师角色',
        description: '基础法师角色，拥有强大的魔法攻击能力',
        price: 2000,
        priceType: 'coin',
        image: '/assets/product-placeholder.png',
        type: '角色',
        attributes: {
          '职业': '法师',
          '稀有度': '普通',
          '特殊技能': '火球术'
        }
      },
      {
        id: 'pack1',
        name: '新手礼包',
        description: '新手专属礼包，包含各种基础道具和金币',
        price: 10,
        priceType: 'gem',
        image: '/assets/product-placeholder.png',
        type: '礼包',
        attributes: {
          '内含金币': '1000',
          '内含道具': '初级体力药水x5',
          '限购': '每账号1次'
        }
      },
      {
        id: 'limited1',
        name: '限时皮肤：星空战士',
        description: '限时7天销售的稀有皮肤，错过再等一年！',
        price: 50,
        priceType: 'gem',
        image: '/assets/product-placeholder.png',
        type: '限时',
        attributes: {
          '类型': '角色皮肤',
          '稀有度': '史诗',
          '限时': '剩余7天'
        }
      }
    ])

    // 根据当前选中的标签过滤商品
    const filteredProducts = computed(() => {
      if (activeTab.value === 0) {
        return allProducts.value.slice(0, 6) // 热门页显示前6个商品
      } else {
        const tabType = tabs.value[activeTab.value]
        return allProducts.value.filter(product => product.type === tabType)
      }
    })

    // 商品详情相关
    const showDetail = ref(false)
    const selectedProduct = ref({})

    const showProductDetail = (product) => {
      selectedProduct.value = product
      showDetail.value = true
    }

    // 购买处理
    const handleBuy = (product) => {
      Taro.showModal({
        title: '确认购买',
        content: `确定要购买 ${product.name} 吗？`,
        success: function (res) {
          if (res.confirm) {
            // 这里应该调用支付服务
            Taro.showLoading({ title: '处理中...' })
            
            setTimeout(() => {
              Taro.hideLoading()
              Taro.showToast({
                title: '购买成功！',
                icon: 'success'
              })
            }, 1500)
          }
        }
      })
    }

    // 返回上一页
    const navigateBack = () => {
      Taro.navigateBack()
    }

    return {
      tabs,
      activeTab,
      hotProducts,
      filteredProducts,
      showDetail,
      selectedProduct,
      showProductDetail,
      handleBuy,
      navigateBack
    }
  }
}
</script>