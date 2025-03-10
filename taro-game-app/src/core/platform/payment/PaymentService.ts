/**
 * 统一支付接口 - 封装不同平台的支付API
 */
import Taro from '@tarojs/taro';

// 支付参数接口
export interface PaymentParams {
  outTradeNo: string;  // 商户订单号
  totalFee: number;    // 支付金额（分）
  body: string;        // 商品描述
  [key: string]: any;  // 其他平台特定参数
}

// 支付结果接口
export interface PaymentResult {
  success: boolean;     // 支付是否成功
  errMsg?: string;      // 错误信息
  platformResult?: any; // 平台原始返回结果
}

// 统一支付接口
interface UnifiedPayment {
  requestPayment(params: PaymentParams): Promise<PaymentResult>;
}

// 微信支付适配器
class WechatPaymentAdapter implements UnifiedPayment {
  async requestPayment(params: PaymentParams): Promise<PaymentResult> {
    try {
      // 转换为微信支付所需参数
      const wxParams: Taro.requestPayment.Option = {
        timeStamp: '',
        nonceStr: '',
        package: '',
        signType: 'MD5' as keyof Taro.requestPayment.SignType,
        paySign: '',
        // 从后端获取的支付参数
        ...params
      };
      
      // 调用微信支付API
      const res = await Taro.requestPayment(wxParams);
      return {
        success: true,
        platformResult: res
      };
    } catch (error) {
      return {
        success: false,
        errMsg: error.errMsg || '支付失败',
        platformResult: error
      };
    }
  }
}

// 支付宝支付适配器
class AlipayPaymentAdapter implements UnifiedPayment {
  async requestPayment(params: PaymentParams): Promise<PaymentResult> {
    try {
      // 转换为支付宝支付所需参数
      const aliParams = {
        tradeNO: params.outTradeNo,
        // 从后端获取的支付参数
        ...params
      };
      
      // 调用支付宝支付API
      // @ts-ignore - 支付宝环境下my对象会被注入
      const res = await my.tradePay(aliParams);
      return {
        success: res.resultCode === '9000', // 9000表示支付成功
        errMsg: res.resultCode !== '9000' ? res.memo || '支付失败' : '',
        platformResult: res
      };
    } catch (error) {
      return {
        success: false,
        errMsg: error.errMsg || '支付失败',
        platformResult: error
      };
    }
  }
}

// 抖音支付适配器
class TTPaymentAdapter implements UnifiedPayment {
  async requestPayment(params: PaymentParams): Promise<PaymentResult> {
    try {
      // 转换为抖音支付所需参数
      const ttParams = {
        orderInfo: {
          order_id: params.outTradeNo,
          order_amount: params.totalFee
        },
        // 从后端获取的支付参数
        ...params
      };
      
      // 调用抖音支付API
      // @ts-ignore - 抖音环境下tt对象会被注入
      const res = await tt.pay(ttParams);
      return {
        success: res.code === 0, // 0表示支付成功
        errMsg: res.code !== 0 ? res.errMsg || '支付失败' : '',
        platformResult: res
      };
    } catch (error) {
      return {
        success: false,
        errMsg: error.errMsg || '支付失败',
        platformResult: error
      };
    }
  }
}

// 支付工厂，根据当前环境创建对应的支付适配器
class PaymentFactory {
  static createPayment(): UnifiedPayment {
    const env = process.env.TARO_ENV;
    
    switch (env) {
      case 'weapp':
        return new WechatPaymentAdapter();
      case 'alipay':
        return new AlipayPaymentAdapter();
      case 'tt':
        return new TTPaymentAdapter();
      default:
        throw new Error(`不支持的平台: ${env}`);
    }
  }
}

// 统一支付服务
export class PaymentService {
  private payment: UnifiedPayment;
  
  constructor() {
    this.payment = PaymentFactory.createPayment();
  }
  
  /**
   * 发起支付
   * @param params 支付参数
   * @returns 支付结果
   */
  async pay(params: PaymentParams): Promise<PaymentResult> {
    return this.payment.requestPayment(params);
  }
}