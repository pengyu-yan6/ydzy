/**
 * PaymentTypes.ts
 * 支付相关类型定义
 */

/**
 * 支付平台枚举
 */
export enum PaymentPlatform {
  WECHAT = 'wechat',   // 微信支付
  ALIPAY = 'alipay',   // 支付宝支付
  DOUYIN = 'douyin'    // 抖音支付
}

/**
 * 微信支付订单信息
 */
export interface WechatOrderInfo {
  prepayId: string;     // 预支付ID
  nonceStr: string;     // 随机字符串
  timeStamp: string;    // 时间戳
  paySign: string;      // 签名
  signType?: string;    // 签名类型，默认MD5
}

/**
 * 支付宝支付订单信息
 */
export interface AlipayOrderInfo {
  tradeNO: string;      // 交易号
}

/**
 * 抖音支付订单信息
 */
export interface DouyinOrderInfo {
  orderId: string;      // 订单ID
  orderToken: string;   // 订单令牌
}

/**
 * 支付参数接口
 */
export interface PaymentParams {
  // 订单信息，根据平台不同而不同
  orderInfo: WechatOrderInfo | AlipayOrderInfo | DouyinOrderInfo;
  
  // 抖音支付特有参数：是否在支付完成后获取订单状态
  getOrderStatus?: boolean;
  
  // 支付成功回调
  success?: (result: PaymentResult) => void;
  
  // 支付失败回调
  fail?: (result: PaymentResult) => void;
  
  // 支付完成回调（无论成功失败）
  complete?: (result: PaymentResult) => void;
}

/**
 * 支付结果接口
 */
export interface PaymentResult {
  // 支付是否成功
  success: boolean;
  
  // 支付平台
  platform: PaymentPlatform;
  
  // 订单信息
  orderInfo: any;
  
  // 平台返回的原始结果
  platformResult?: any;
  
  // 错误信息（如果支付失败）
  errorMsg?: string;
}

/**
 * 订单状态枚举
 */
export enum OrderStatus {
  PENDING = 'pending',       // 待支付
  PAID = 'paid',             // 已支付
  CANCELED = 'canceled',     // 已取消
  REFUNDED = 'refunded',     // 已退款
  FAILED = 'failed'          // 支付失败
}