/**
 * PaymentService.ts
 * 统一支付服务 - 封装不同平台的支付API
 */
import Taro from '@tarojs/taro';
import { PaymentResult, PaymentParams, PaymentPlatform } from './PaymentTypes';

/**
 * 支付服务类 - 提供统一的支付接口
 */
export class PaymentService {
  private static instance: PaymentService;
  
  // 当前平台
  private platform: PaymentPlatform;
  
  private constructor() {
    // 根据环境确定当前平台
    this.platform = this.detectPlatform();
    console.log(`初始化支付服务，当前平台: ${this.platform}`);
  }
  
  /**
   * 获取支付服务实例（单例模式）
   */
  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }
  
  /**
   * 检测当前运行平台
   */
  private detectPlatform(): PaymentPlatform {
    const env = Taro.getEnv();
    
    switch (env) {
      case Taro.ENV_TYPE.WEAPP:
        return PaymentPlatform.WECHAT;
      case Taro.ENV_TYPE.ALIPAY:
        return PaymentPlatform.ALIPAY;
      case Taro.ENV_TYPE.TT:
        return PaymentPlatform.DOUYIN;
      default:
        console.warn('未知平台，默认使用微信支付');
        return PaymentPlatform.WECHAT;
    }
  }
  
  /**
   * 发起支付
   * @param params 支付参数
   * @returns Promise<PaymentResult> 支付结果
   */
  public async pay(params: PaymentParams): Promise<PaymentResult> {
    try {
      // 根据不同平台调用对应的支付方法
      switch (this.platform) {
        case PaymentPlatform.WECHAT:
          return await this.wechatPay(params);
        case PaymentPlatform.ALIPAY:
          return await this.alipayPay(params);
        case PaymentPlatform.DOUYIN:
          return await this.douyinPay(params);
        default:
          throw new Error('不支持的支付平台');
      }
    } catch (error) {
      console.error('支付失败:', error);
      return {
        success: false,
        platform: this.platform,
        errorMsg: error.message || '支付过程中发生错误',
        orderInfo: params.orderInfo
      };
    }
  }
  
  /**
   * 微信支付实现
   * @param params 支付参数
   */
  private async wechatPay(params: PaymentParams): Promise<PaymentResult> {
    // 类型守卫：确保orderInfo是WechatOrderInfo类型
    if (!params.orderInfo || !this.isWechatOrderInfo(params.orderInfo)) {
      throw new Error('缺少微信支付必要参数');
    }
    
    try {
      // 由于已经通过类型守卫确认了类型，可以安全地访问WechatOrderInfo的属性
      const payResult = await Taro.requestPayment({
        timeStamp: params.orderInfo.timeStamp,
        nonceStr: params.orderInfo.nonceStr,
        package: `prepay_id=${params.orderInfo.prepayId}`,
        signType: 'MD5',
        paySign: params.orderInfo.paySign
      });
      
      return {
        success: true,
        platform: PaymentPlatform.WECHAT,
        orderInfo: params.orderInfo,
        platformResult: payResult
      };
    } catch (error) {
      // 用户取消支付也会进入catch
      if (error.errMsg && error.errMsg.indexOf('cancel') > -1) {
        return {
          success: false,
          platform: PaymentPlatform.WECHAT,
          errorMsg: '用户取消支付',
          orderInfo: params.orderInfo
        };
      }
      
      throw error;
    }
  }
  
  /**
   * 支付宝支付实现
   * @param params 支付参数
   */
  private async alipayPay(params: PaymentParams): Promise<PaymentResult> {
    // 类型守卫：确保orderInfo是AlipayOrderInfo类型
    if (!params.orderInfo || !this.isAlipayOrderInfo(params.orderInfo)) {
      throw new Error('缺少支付宝支付必要参数');
    }
    
    try {
      // 由于已经通过类型守卫确认了类型，可以安全地访问AlipayOrderInfo的属性
      const payResult = await Taro.tradePay({
        tradeNO: params.orderInfo.tradeNO
      }) as Taro.tradePay.SuccessCallbackResult & { resultCode: string };
      
      // 支付宝支付结果处理
      if (payResult.resultCode === '9000') {
        // 支付成功
        return {
          success: true,
          platform: PaymentPlatform.ALIPAY,
          orderInfo: params.orderInfo,
          platformResult: payResult
        };
      } else if (payResult.resultCode === '6001') {
        // 用户取消支付
        return {
          success: false,
          platform: PaymentPlatform.ALIPAY,
          errorMsg: '用户取消支付',
          orderInfo: params.orderInfo,
          platformResult: payResult
        };
      } else {
        // 其他错误
        return {
          success: false,
          platform: PaymentPlatform.ALIPAY,
          errorMsg: `支付失败，错误码: ${payResult.resultCode}`,
          orderInfo: params.orderInfo,
          platformResult: payResult
        };
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * 抖音支付实现
   * @param params 支付参数
   */
  private async douyinPay(params: PaymentParams): Promise<PaymentResult> {
    // 类型守卫：确保orderInfo是DouyinOrderInfo类型
    if (!params.orderInfo || !this.isDouyinOrderInfo(params.orderInfo)) {
      throw new Error('缺少抖音支付必要参数');
    }
    
    try {
      // 抖音小程序支付API
      // 注意：Taro.pay 可能不存在，需要使用 tt.pay 或其他API
      // @ts-ignore - 忽略类型检查，因为Taro类型定义中可能没有pay方法
      const payResult = await Taro.requestPayment({
        // 使用类型断言解决orderInfo属性不在Option类型中的问题
        orderInfo: {
          order_id: params.orderInfo.orderId,
          order_token: params.orderInfo.orderToken
        },
        service: 5, // 抖音支付的service参数，5表示支付应用内订单
        getOrderStatus: params.getOrderStatus // 是否在支付完成后获取订单状态
      } as any);
      
      // 处理抖音支付结果，使用类型断言解决code属性不存在的问题
      const result = payResult as any;
      if (result.code === 0) {
        // 支付成功
        return {
          success: true,
          platform: PaymentPlatform.DOUYIN,
          orderInfo: params.orderInfo,
          platformResult: payResult
        };
      } else if (result.code === 2) {
        // 用户取消支付
        return {
          success: false,
          platform: PaymentPlatform.DOUYIN,
          errorMsg: '用户取消支付',
          orderInfo: params.orderInfo,
          platformResult: payResult
        };
      } else {
        // 其他错误
        return {
          success: false,
          platform: PaymentPlatform.DOUYIN,
          errorMsg: result.errMsg || `支付失败，错误码: ${result.code}`,
          orderInfo: params.orderInfo,
          platformResult: payResult
        };
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * 类型守卫：判断是否为微信支付订单信息
   */
  private isWechatOrderInfo(orderInfo: any): orderInfo is import('./PaymentTypes').WechatOrderInfo {
    return 'prepayId' in orderInfo && 'nonceStr' in orderInfo && 'timeStamp' in orderInfo && 'paySign' in orderInfo;
  }

  /**
   * 类型守卫：判断是否为支付宝支付订单信息
   */
  private isAlipayOrderInfo(orderInfo: any): orderInfo is import('./PaymentTypes').AlipayOrderInfo {
    return 'tradeNO' in orderInfo;
  }

  /**
   * 类型守卫：判断是否为抖音支付订单信息
   */
  private isDouyinOrderInfo(orderInfo: any): orderInfo is import('./PaymentTypes').DouyinOrderInfo {
    return 'orderId' in orderInfo && 'orderToken' in orderInfo;
  }

  /**
   * 查询订单状态
   * @param orderId 订单ID
   * @param platform 支付平台，默认为当前平台
   */
  public async queryOrderStatus(orderId: string, platform?: PaymentPlatform): Promise<any> {
    const targetPlatform = platform || this.platform;
    
    // 这里应该调用后端API查询订单状态
    // 实际实现需要与后端接口对接
    try {
      // 模拟API调用
      const response = await Taro.request({
        url: '/api/payment/query',
        method: 'POST',
        data: {
          orderId,
          platform: targetPlatform
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('查询订单状态失败:', error);
      throw error;
    }
  }
}