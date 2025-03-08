/**
 * ShopPage.tsx
 * 商城页面 - 提供游戏内物品购买功能
 */
import React, { useState } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import { AtButton, AtTabs, AtTabsPane, AtIcon, AtToast } from 'taro-ui';
import { PaymentService } from '../../services/payment/PaymentService';
import './ShopPage.scss';

// 商品类型
interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number; // 原价，用于显示折扣
  image: string;
  type: 'character' | 'item' | 'currency' | 'vip';
  tags?: string[];
  discount?: number; // 折扣百分比
  limited?: boolean; // 是否限时商品
  hot?: boolean; // 是否热门商品
  new?: boolean; // 是否新品
  soldOut?: boolean; // 是否售罄
}

// 商品分类
interface ShopCategory {
  id: string;
  title: string;
  items: ShopItem[];
}

// 模拟商品数据
const mockShopData: ShopCategory[] = [
  {
    id: 'characters',
    title: '角色',
    items: [
      {
        id: 'char_001',
        name: '战士',
        description: '强力的近战单位，拥有高生命值和护甲',
        price: 680,
        image: 'https://via.placeholder.com/100',
        type: 'character',
        tags: ['近战', '坦克'],
        new: true
      },
      {
        id: 'char_002',
        name: '法师',
        description: '强大的法术输出，拥有范围伤害技能',
        price: 680,
        image: 'https://via.placeholder.com/100',
        type: 'character',
        tags: ['远程', '法术']
      },
      {
        id: 'char_003',
        name: '刺客',
        description: '高爆发的单体伤害，擅长暗杀敌方后排',
        price: 880,
        originalPrice: 1280,
        image: 'https://via.placeholder.com/100',
        type: 'character',
        tags: ['近战', '爆发'],
        discount: 30,
        hot: true
      },
      {
        id: 'char_004',
        name: '射手',
        description: '持续输出的远程单位，攻击速度快',
        price: 680,
        image: 'https://via.placeholder.com/100',
        type: 'character',
        tags: ['远程', '持续']
      }
    ]
  },
  {
    id: 'items',
    title: '道具',
    items: [
      {
        id: 'item_001',
        name: '经验卡',
        description: '立即获得1000点经验值',
        price: 50,
        image: 'https://via.placeholder.com/100',
        type: 'item'
      },
      {
        id: 'item_002',
        name: '金币礼包',
        description: '立即获得10000金币',
        price: 100,
        image: 'https://via.placeholder.com/100',
        type: 'item',
        hot: true
      },
      {
        id: 'item_003',
        name: '抽奖券',
        description: '可用于抽取稀有角色或道具',
        price: 30,
        image: 'https://via.placeholder.com/100',
        type: 'item'
      }
    ]
  },
  {
    id: 'currency',
    title: '货币',
    items: [
      {
        id: 'currency_001',
        name: '60钻石',
        description: '游戏内高级货币',
        price: 6,
        image: 'https://via.placeholder.com/100',
        type: 'currency'
      },
      {
        id: 'currency_002',
        name: '300钻石',
        description: '游戏内高级货币',
        price: 30,
        image: 'https://via.placeholder.com/100',
        type: 'currency'
      },
      {
        id: 'currency_003',
        name: '980钻石',
        description: '游戏内高级货币',
        price: 98,
        image: 'https://via.placeholder.com/100',
        type: 'currency',
        hot: true
      },
      {
        id: 'currency_004',
        name: '1980钻石',
        description: '游戏内高级货币',
        price: 198,
        originalPrice: 220,
        image: 'https://via.placeholder.com/100',
        type: 'currency',
        discount: 10
      }
    ]
  },
  {
    id: 'vip',
    title: '特权',
    items: [
      {
        id: 'vip_001',
        name: '月卡',
        description: '30天内每天领取100钻石，总计3000钻石',
        price: 30,
        image: 'https://via.placeholder.com/100',
        type: 'vip',
        hot: true
      },
      {
        id: 'vip_002',
        name: '季卡',
        description: '90天内每天领取100钻石，总计9000钻石',
        price: 88,
        originalPrice: 98,
        image: 'https://via.placeholder.com/100',
        type: 'vip',
        discount: 10
      },
      {
        id: 'vip_003',
        name: '年卡',
        description: '365天内每天领取100钻石，总计36500钻石',
        price: 328,
        originalPrice: 398,
        image: 'https://via.placeholder.com/100',
        type: 'vip',
        discount: 18
      }
    ]
  }
];

const ShopPage: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<number>(0);
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const [showItemDetail, setShowItemDetail] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastText, setToastText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // 支付服务实例
  const paymentService = PaymentService.getInstance();
  
  // 处理分类切换
  const handleTabChange = (index: number) => {
    setCurrentTab(index);
  };
  
  // 显示商品详情
  const showItemDetails = (item: ShopItem) => {
    setSelectedItem(item);
    setShowItemDetail(true);
  };
  
  // 关闭商品详情
  const closeItemDetails = () => {
    setShowItemDetail(false);
    setSelectedItem(null);
  };
  
  // 购买商品
  const handlePurchase = async (item: ShopItem) => {
    try {
      setIsLoading(true);
      
      // 这里应该调用后端API创建订单
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 模拟订单数据
      const mockOrderData = {
        orderId: `order_${Date.now()}`,
        orderToken: `token_${Math.random().toString(36).substring(2, 15)}`,
        amount: item.price,
        itemId: item.id,
        itemName: item.name
      };
      
      // 根据不同平台构建支付参数
      const platform = Taro.getEnv();
      let payParams: any;
      
      if (platform === Taro.ENV_TYPE.WEAPP) {
        // 微信支付参数
        payParams = {
          orderInfo: {
            prepayId: mockOrderData.orderId,
            nonceStr: 'nonceStr',
            timeStamp: Date.now().toString(),
            paySign: 'paySign'
          }
        };
      } else if (platform === Taro.ENV_TYPE.ALIPAY) {
        // 支付宝支付参数
        payParams = {
          orderInfo: {
            tradeNO: mockOrderData.orderId
          }
        };
      } else if (platform === Taro.ENV_TYPE.TT) {
        // 抖音支付参数
        payParams = {
          orderInfo: {
            orderId: mockOrderData.orderId,
            orderToken: mockOrderData.orderToken
          },
          getOrderStatus: true
        };
      } else {
        throw new Error('不支持的平台');
      }
      
      // 调用支付服务
      const payResult = await paymentService.pay(payParams);
      
      if (payResult.success) {
        // 支付成功
        setToastText('购买成功！');
        setShowToast(true);
        closeItemDetails();
      } else {
        // 支付失败
        setToastText(payResult.errorMsg || '购买失败，请重试');
        setShowToast(true);
      }
    } catch (error) {
      console.error('购买失败:', error);
      setToastText('购买失败，请重试');
      setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 渲染商品列表
  const renderShopItems = (items: ShopItem[]) => {
    return (
      <View className='shop-items'>
        {items.map(item => (
          <View key={item.id} className='shop-item' onClick={() => showItemDetails(item)}>
            <View className='shop-item-image-container'>
              <Image className='shop-item-image' src={item.image} mode='aspectFill' />
              {item.discount && (
                <View className='shop-item-discount'>{item.discount}% OFF</View>
              )}
              {item.new && (
                <View className='shop-item-tag shop-item-new'>NEW</View>
              )}
              {item.hot && (
                <View className='shop-item-tag shop-item-hot'>HOT</View>
              )}
            </View>
            <View className='shop-item-info'>
              <Text className='shop-item-name'>{item.name}</Text>
              <View className='shop-item-price-container'>
                {item.originalPrice && (
                  <Text className='shop-item-original-price'>¥{item.originalPrice}</Text>
                )}
                <Text className='shop-item-price'>¥{item.price}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    );
  };
  
  // 渲染商品详情
  const renderItemDetail = () => {
    if (!selectedItem) return null;
    
    return (
      <View className='item-detail-modal'>
        <View className='item-detail-content'>
          <View className='item-detail-header'>
            <Text className='item-detail-title'>{selectedItem.name}</Text>
            <View className='item-detail-close' onClick={closeItemDetails}>
              <AtIcon value='close' size='20' color='#666' />
            </View>
          </View>
          
          <View className='item-detail-body'>
            <Image className='item-detail-image' src={selectedItem.image} mode='aspectFit' />
            
            <View className='item-detail-info'>
              {selectedItem.tags && selectedItem.tags.length > 0 && (
                <View className='item-detail-tags'>
                  {selectedItem.tags.map(tag => (
                    <Text key={tag} className='item-detail-tag'>{tag}</Text>
                  ))}
                </View>
              )}
              
              <Text className='item-detail-description'>{selectedItem.description}</Text>
              
              <View className='item-detail-price-container'>
                {selectedItem.originalPrice && (
                  <Text className='item-detail-original-price'>¥{selectedItem.originalPrice}</Text>
                )}
                <Text className='item-detail-price'>¥{selectedItem.price}</Text>
                {selectedItem.discount && (
                  <Text className='item-detail-discount'>{selectedItem.discount}% OFF</Text>
                )}
              </View>
            </View>
          </View>
          
          <View className='item-detail-footer'>
            <AtButton 
              type='primary' 
              className='item-detail-buy-btn'
              onClick={() => handlePurchase(selectedItem)}
              loading={isLoading}
            >
              立即购买
            </AtButton>
          </View>
        </View>
      </View>
    );
  };
  
  return (
    <View className='shop-page'>
      <AtTabs
        current={currentTab}
        tabList={mockShopData.map(category => ({ title: category.title }))}
        onClick={handleTabChange}
        className='shop-tabs'
      >
        {mockShopData.map((category, index) => (
          <AtTabsPane current={currentTab} index={index} key={category.id}>
            <ScrollView scrollY className='shop-items-scroll'>
              {renderShopItems(category.items)}
            </ScrollView>
          </AtTabsPane>
        ))}
      </AtTabs>
      
      {showItemDetail && renderItemDetail()}
      
      <AtToast
        isOpened={showToast}
        text={toastText}
        duration={2000}
        onClose={() => setShowToast(false)}
      />
    </View>
  );
};

export default ShopPage;