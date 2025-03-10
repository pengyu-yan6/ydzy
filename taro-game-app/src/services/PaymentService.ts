/**
 * PaymentService.ts - 安全支付模块
 * 实现双重验证、防重放攻击和微信/支付宝异常处理兼容方案
 */

import Taro from '@tarojs/taro';
import { generateUUID } from '../utils/uuid';
import { sha256 } from '../utils/crypto';

// 支付渠道枚举
export enum PaymentChannel {
  WECHAT = 'wechat',
  ALIPAY = 'alipay'
}

// 支付状态枚举
export enum PaymentStatus {
  PENDING = 'pending',     // 待支付
  SUCCESS = 'success',     // 支付成功
  FAILED = 'failed',       // 支付失败
  CANCELLED = 'cancelled', // 用户取消
  TIMEOUT = 'timeout',     // 超时
  UNKNOWN = 'unknown'      // 未知状态
}

// 订单信息接口
export interface OrderInfo {
  orderId: string;         // 订单ID
  amount: number;          // 支付金额（单位：分）
  productId: string;       // 商品ID
  productName: string;     // 商品名称
  userId: string;          // 用户ID
  createTime: number;      // 创建时间戳
  expireTime: number;      // 过期时间戳
  channel: PaymentChannel; // 支付渠道
  extraData?: any;         // 额外数据
}

// 支付请求参数接口
export interface PaymentRequest {
  orderId: string;         // 订单ID
  amount: number;          // 支付金额（单位：分）
  channel: PaymentChannel; // 支付渠道
  timestamp: number;       // 请求时间戳
  nonce: string;           // 随机字符串，防重放
  signature: string;       // 客户端签名
  returnUrl?: string;      // 支付完成后的跳转URL
  notifyUrl?: string;      // 支付结果通知URL
}

// 支付结果接口
export interface PaymentResult {
  success: boolean;        // 是否成功
  orderId: string;         // 订单ID
  status: PaymentStatus;   // 支付状态
  channel: PaymentChannel; // 支付渠道
  transactionId?: string;  // 第三方交易ID
  errorCode?: string;      // 错误代码
  errorMessage?: string;   // 错误信息
  timestamp: number;       // 结果时间戳
}

// 支付异常类
export class PaymentError extends Error {
  public code: string;
  public orderId?: string;
  public channel?: PaymentChannel;
  
  constructor(message: string, code: string, orderId?: string, channel?: PaymentChannel) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.orderId = orderId;
    this.channel = channel;
  }
}

/**
 * 安全支付服务类
 * 实现双重验证、防重放攻击和异常处理兼容方案
 */
export class PaymentService {
  private readonly API_BASE_URL: string;
  private readonly APP_ID: string;
  private readonly APP_SECRET: string;
  private readonly SIGNATURE_EXPIRE_TIME: number = 5 * 60 * 1000; // 签名有效期5分钟
  private readonly NONCE_CACHE: Map<string, number> = new Map(); // nonce缓存，防重放
  
  constructor(apiBaseUrl: string, appId: string, appSecret: string) {
    this.API_BASE_URL = apiBaseUrl;
    this.APP_ID = appId;
    this.APP_SECRET = appSecret;
  }
  
  /**
   * 创建支付订单
   * @param orderInfo 订单信息
   * @returns 创建的订单信息
   */
  public async createOrder(orderInfo: Omit<OrderInfo, 'orderId' | 'createTime' | 'expireTime'>): Promise<OrderInfo> {
    try {
      // 生成订单ID和时间戳
      const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const createTime = Date.now();
      const expireTime = createTime + 30 * 60 * 1000; // 订单30分钟有效期
      
      // 构建完整订单信息
      const fullOrderInfo: OrderInfo = {
        ...orderInfo,
        orderId,
        createTime,
        expireTime
      };
      
      // 生成请求签名
      const timestamp = Date.now();
      const nonce = this.generateNonce();
      const signature = this.generateSignature({
        orderId,
        amount: orderInfo.amount,
        userId: orderInfo.userId,
        timestamp,
        nonce
      });
      
      // 发送创建订单请求
      const response = await Taro.request({
        url: `${this.API_BASE_URL}/api/payment/create-order`,
        method: 'POST',
        data: {
          ...fullOrderInfo,
          appId: this.APP_ID,
          timestamp,
          nonce,
          signature
        },
        header: {
          'Content-Type': 'application/json'
        }
      });
      
      // 检查响应
      if (response.statusCode !== 200 || !response.data.success) {
        throw new PaymentError(
          response.data.message || '创建订单失败',
          response.data.code || 'CREATE_ORDER_FAILED',
          orderId,
          orderInfo.channel
        );
      }
      
      return response.data.data as OrderInfo;
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }
      throw new PaymentError(
        error.message || '创建订单失败',
        'CREATE_ORDER_FAILED',
        undefined,
        orderInfo.channel
      );
    }
  }
  
  /**
   * 发起支付请求
   * @param orderInfo 订单信息
   * @returns 支付结果
   */
  public async requestPayment(orderInfo: OrderInfo): Promise<PaymentResult> {
    try {
      // 检查订单是否过期
      if (Date.now() > orderInfo.expireTime) {
        throw new PaymentError('订单已过期', 'ORDER_EXPIRED', orderInfo.orderId, orderInfo.channel);
      }
      
      // 生成支付请求参数
      const timestamp = Date.now();
      const nonce = this.generateNonce();
      const signature = this.generateSignature({
        orderId: orderInfo.orderId,
        amount: orderInfo.amount,
        userId: orderInfo.userId,
        timestamp,
        nonce
      });
      
      const paymentRequest: PaymentRequest = {
        orderId: orderInfo.orderId,
        amount: orderInfo.amount,
        channel: orderInfo.channel,
        timestamp,
        nonce,
        signature
      };
      
      // 根据不同渠道处理支付
      switch (orderInfo.channel) {
        case PaymentChannel.WECHAT:
          return await this.handleWechatPayment(paymentRequest, orderInfo);
        case PaymentChannel.ALIPAY:
          return await this.handleAlipayPayment(paymentRequest, orderInfo);
        default:
          throw new PaymentError(
            '不支持的支付渠道',
            'UNSUPPORTED_CHANNEL',
            orderInfo.orderId,
            orderInfo.channel
          );
      }
    } catch (error) {
      // 统一异常处理
      return this.handlePaymentError(error, orderInfo);
    }
  }
  
  /**
   * 查询支付结果
   * @param orderId 订单ID
   * @param channel 支付渠道
   * @returns 支付结果
   */
  public async queryPaymentResult(orderId: string, channel: PaymentChannel): Promise<PaymentResult> {
    try {
      // 生成请求签名
      const timestamp = Date.now();
      const nonce = this.generateNonce();
      const signature = this.generateSignature({
        orderId,
        timestamp,
        nonce
      });
      
      // 发送查询请求
      const response = await Taro.request({
        url: `${this.API_BASE_URL}/api/payment/query`,
        method: 'POST',
        data: {
          orderId,
          channel,
          appId: this.APP_ID,
          timestamp,
          nonce,
          signature
        },
        header: {
          'Content-Type': 'application/json'
        }
      });
      
      // 检查响应
      if (response.statusCode !== 200) {
        throw new PaymentError(
          '查询支付结果失败',
          'QUERY_FAILED',
          orderId,
          channel
        );
      }
      
      return response.data.data as PaymentResult;
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }
      throw new PaymentError(
        error.message || '查询支付结果失败',
        'QUERY_FAILED',
        orderId,
        channel
      );
    }
  }
  
  /**
   * 处理微信支付
   * @param paymentRequest 支付请求参数
   * @param orderInfo 订单信息
   * @returns 支付结果
   */
  private async handleWechatPayment(paymentRequest: PaymentRequest, orderInfo: OrderInfo): Promise<PaymentResult> {
    try {
      // 获取微信支付参数
      const payParams = await this.getWechatPayParams(paymentRequest);
      
      // 调用微信支付API
      await Taro.requestPayment({
        ...payParams,
        timeStamp: payParams.timeStamp,
        nonceStr: payParams.nonceStr,
        package: payParams.package,
        signType: payParams.signType,
        paySign: payParams.paySign
      });
      
      // 支付成功，查询订单状态确认
      return await this.verifyPaymentStatus(orderInfo.orderId, PaymentChannel.WECHAT);
    } catch (error) {
      // 处理微信支付特定错误
      if (error.errMsg) {
        if (error.errMsg.includes('cancel')) {
          return {
            success: false,
            orderId: orderInfo.orderId,
            status: PaymentStatus.CANCELLED,
            channel: PaymentChannel.WECHAT,
            errorCode: 'USER_CANCEL',
            errorMessage: '用户取消支付',
            timestamp: Date.now()
          };
        } else if (error.errMsg.includes('timeout')) {
          // 超时错误，需要查询订单状态
          return await this.verifyPaymentStatus(orderInfo.orderId, PaymentChannel.WECHAT);
        }
      }
      
      // 其他错误
      throw new PaymentError(
        error.message || '支付宝支付失败',
        error.code || 'ALIPAY_PAYMENT_FAILED',
        orderInfo.orderId,
        PaymentChannel.ALIPAY
      );
    }
  }
  
  /**
   * 统一处理支付错误
   * @param error 错误对象
   * @param orderInfo 订单信息
   * @returns 支付结果
   */
  private handlePaymentError(error: any, orderInfo: OrderInfo): PaymentResult {
    // 如果已经是PaymentResult类型，直接返回
    if (error.success !== undefined && error.orderId && error.status) {
      return error as PaymentResult;
    }
    
    // 构造错误支付结果
    return {
      success: false,
      orderId: orderInfo.orderId,
      status: PaymentStatus.FAILED,
      channel: orderInfo.channel,
      errorCode: error.code || 'PAYMENT_FAILED',
      errorMessage: error.message || '支付失败',
      timestamp: Date.now()
    };
  }
  
  /**
   * 获取微信支付参数
   * @param paymentRequest 支付请求参数
   * @returns 微信支付参数
   */
  private async getWechatPayParams(paymentRequest: PaymentRequest): Promise<any> {
    try {
      // 向服务端请求支付参数
      const response = await Taro.request({
        url: `${this.API_BASE_URL}/api/payment/wechat/params`,
        method: 'POST',
        data: {
          ...paymentRequest,
          appId: this.APP_ID
        },
        header: {
          'Content-Type': 'application/json'
        }
      });
      
      // 检查响应
      if (response.statusCode !== 200 || !response.data.success) {
        throw new PaymentError(
          response.data.message || '获取微信支付参数失败',
          response.data.code || 'GET_WECHAT_PARAMS_FAILED',
          paymentRequest.orderId,
          PaymentChannel.WECHAT
        );
      }
      
      return response.data.data;
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }
      throw new PaymentError(
        error.message || '获取微信支付参数失败',
        'GET_WECHAT_PARAMS_FAILED',
        paymentRequest.orderId,
        PaymentChannel.WECHAT
      );
    }
  }
  
  /**
   * 获取支付宝支付参数
   * @param paymentRequest 支付请求参数
   * @returns 支付宝支付参数
   */
  private async getAlipayParams(paymentRequest: PaymentRequest): Promise<any> {
    try {
      // 向服务端请求支付参数
      const response = await Taro.request({
        url: `${this.API_BASE_URL}/api/payment/alipay/params`,
        method: 'POST',
        data: {
          ...paymentRequest,
          appId: this.APP_ID
        },
        header: {
          'Content-Type': 'application/json'
        }
      });
      
      // 检查响应
      if (response.statusCode !== 200 || !response.data.success) {
        throw new PaymentError(
          response.data.message || '获取支付宝支付参数失败',
          response.data.code || 'GET_ALIPAY_PARAMS_FAILED',
          paymentRequest.orderId,
          PaymentChannel.ALIPAY
        );
      }
      
      return response.data.data;
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }
      throw new PaymentError(
        error.message || '获取支付宝支付参数失败',
        'GET_ALIPAY_PARAMS_FAILED',
        paymentRequest.orderId,
        PaymentChannel.ALIPAY
      );
    }
  }
  
  // verifyPaymentStatus 方法已在上方定义
  
  // generateSignature 方法已在上方定义
  
  // verifySignature 方法已在上方定义
  
  // generateNonce 方法已在上方定义
  
  // getAlipayErrorMessage 方法已在上方定义

  /**
   * 处理支付宝支付
   * @param paymentRequest 支付请求参数
   * @param orderInfo 订单信息
   * @returns 支付结果
   */
  private async handleAlipayPayment(paymentRequest: PaymentRequest, orderInfo: OrderInfo): Promise<PaymentResult> {
    try {
      // 获取支付宝支付参数
      const payParams = await this.getAlipayParams(paymentRequest);
      
      // 调用支付宝支付API
      // 注意：Taro暂不直接支持支付宝小程序支付，这里使用my.tradePay作为示例
      // 实际使用时需要根据具体环境调整
      await new Promise<void>((resolve, reject) => {
        // @ts-ignore - 支付宝小程序API
        my.tradePay({
          ...payParams,
          success: (res: any) => {
            if (res.resultCode === '9000') {
              resolve();
            } else {
              reject({
                code: res.resultCode,
                message: this.getAlipayErrorMessage(res.resultCode)
              });
            }
          },
          fail: (err: any) => {
            reject(err);
          }
        });
      });
      
      // 支付成功，查询订单状态确认
      return await this.verifyPaymentStatus(orderInfo.orderId, PaymentChannel.ALIPAY);
    } catch (error) {
      // 处理支付宝支付特定错误
      if (error.code) {
        if (error.code === '6001') {
          return {
            success: false,
            orderId: orderInfo.orderId,
            status: PaymentStatus.CANCELLED,
            channel: PaymentChannel.ALIPAY,
            errorCode: 'USER_CANCEL',
            errorMessage: '用户取消支付',
            timestamp: Date.now()
          };
        } else if (error.code === '6002' || error.code === '6004') {
          // 网络错误或未知状态，需要查询订单状态
          return await this.verifyPaymentStatus(orderInfo.orderId, PaymentChannel.ALIPAY);
        }
      }
      
      // 其他错误
      throw new PaymentError(
        error.message || '支付宝支付失败',
        error.code || 'ALIPAY_PAYMENT_FAILED',
        orderInfo.orderId,
        PaymentChannel.ALIPAY
      );
    }
  }
  
  /**
   * 验证支付状态
   * @param orderId 订单ID
   * @param channel 支付渠道
   * @returns 支付结果
   */
  private async verifyPaymentStatus(orderId: string, channel: PaymentChannel): Promise<PaymentResult> {
    // 查询支付结果
    const result = await this.queryPaymentResult(orderId, channel);
    
    // 如果状态是未知，可能需要多次查询
    if (result.status === PaymentStatus.UNKNOWN) {
      // 等待一段时间后再次查询
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.verifyPaymentStatus(orderId, channel);
    }
    
    return result;
  }
  
  /**
   * 生成签名
   * @param data 需要签名的数据
   * @returns 签名字符串
   */
  private generateSignature(data: Record<string, any>): string {
    // 按键名排序
    const keys = Object.keys(data).sort();
    
    // 构建签名字符串
    let signStr = '';
    for (const key of keys) {
      if (data[key] !== undefined && data[key] !== null) {
        signStr += `${key}=${data[key]}&`;
      }
    }
    
    // 添加密钥
    signStr += `key=${this.APP_SECRET}`;
    
    // 计算SHA256哈希
    return sha256(signStr);
  }
  
  /**
   * 验证签名
   * @param data 签名数据
   * @param signature 待验证的签名
   * @returns 是否验证通过
   */
  // @ts-ignore: 方法暂未使用，但保留以供将来使用
  private verifySignature(data: Record<string, any>, signature: string): boolean {
    // 生成签名
    const calculatedSignature = this.generateSignature(data);
    
    // 比较签名
    return calculatedSignature === signature;
  }
  
  /**
   * 生成防重放攻击的随机字符串
   * @returns 随机字符串
   */
  private generateNonce(): string {
    // 生成UUID
    const nonce = generateUUID();
    
    // 存入缓存，用于防重放攻击检测
    this.NONCE_CACHE.set(nonce, Date.now());
    
    // 清理过期的nonce
    this.cleanExpiredNonce();
    
    return nonce;
  }
  
  /**
   * 清理过期的nonce
   */
  private cleanExpiredNonce(): void {
    const now = Date.now();
    for (const [nonce, timestamp] of this.NONCE_CACHE.entries()) {
      if (now - timestamp > this.SIGNATURE_EXPIRE_TIME) {
        this.NONCE_CACHE.delete(nonce);
      }
    }
  }
  
  /**
   * 获取支付宝错误信息
   * @param code 错误代码
   * @returns 错误信息
   */
  private getAlipayErrorMessage(code: string): string {
    const errorMessages: Record<string, string> = {
      '4000': '订单支付失败',
      '6001': '用户中途取消',
      '6002': '网络连接出错',
      '6004': '支付结果未知',
      '99': '用户点击忘记密码导致快捷界面退出'
    };
    
    return errorMessages[code] || `未知错误(${code})`;
  }
}