/**
 * 支付宝支付实现
 * 实现支付宝支付的各种接口
 */

const crypto = require('crypto');
const moment = require('moment');
const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;
const PaymentBase = require('../core/PaymentBase');
const logger = require('../../utils/logger');

class ZhifubaoPayment extends PaymentBase {
  /**
   * 初始化支付宝支付
   * @param {Object} config - 支付配置
   */
  constructor(config) {
    super(config);
    this.provider = 'zhifubao';
    
    // 创建支付宝SDK实例
    this.alipay = new AlipaySdk({
      appId: config.appId,
      privateKey: config.privateKey,
      alipayPublicKey: config.alipayPublicKey,
      gateway: config.sandbox ? 'https://openapi.alipaydev.com/gateway.do' : 'https://openapi.alipay.com/gateway.do',
      charset: 'utf-8',
      version: '1.0',
      signType: 'RSA2',
      keyType: 'PKCS8'
    });
  }

  /**
   * 验证配置是否有效
   * @throws {Error} 配置无效时抛出异常
   */
  validateConfig() {
    super.validateConfig();
    
    const { appId, privateKey, alipayPublicKey } = this.config;
    
    if (!appId) {
      throw new Error('支付宝支付配置缺少appId');
    }
    
    if (!privateKey) {
      throw new Error('支付宝支付配置缺少privateKey');
    }
    
    if (!alipayPublicKey) {
      throw new Error('支付宝支付配置缺少alipayPublicKey');
    }
  }

  /**
   * 创建支付宝订单
   * @param {Object} orderData - 订单数据
   * @returns {Promise<Object>} 支付结果
   */
  async createOrder(orderData) {
    const { 
      outTradeNo, subject, totalAmount, 
      body, notifyUrl, returnUrl, 
      qrCode = false, buyerId
    } = orderData;

    try {
      this.logSafe('info', '开始创建支付宝支付订单', { 
        outTradeNo, 
        totalAmount 
      });
      
      // 创建表单数据
      const formData = new AlipayFormData();
      formData.setMethod('POST');
      
      // 设置公共请求参数
      formData.addField('returnUrl', returnUrl || this.config.returnUrl);
      formData.addField('notifyUrl', notifyUrl || this.config.notifyUrl);
      
      // 根据不同支付方式设置接口名称和业务参数
      let method;
      const bizContent = {
        out_trade_no: outTradeNo,
        total_amount: totalAmount.toFixed(2),
        subject: subject || '商品订单',
        body: body || '支付宝支付'
      };
      
      if (qrCode) {
        // 扫码支付
        method = 'alipay.trade.precreate';
      } else if (buyerId) {
        // 付款码支付
        method = 'alipay.trade.pay';
        bizContent.buyer_id = buyerId;
        bizContent.scene = 'bar_code';
      } else {
        // 电脑网站支付
        method = 'alipay.trade.page.pay';
        bizContent.product_code = 'FAST_INSTANT_TRADE_PAY';
      }
      
      formData.addField('bizContent', bizContent);
      
      // 执行请求
      const result = await this.alipay.exec(method, {}, { formData });
      
      // 处理不同支付方式的结果
      if (method === 'alipay.trade.precreate') {
        const response = result.alipay_trade_precreate_response;
        
        if (response.code !== '10000') {
          throw new Error(`支付宝支付失败: ${response.sub_msg || response.msg}`);
        }
        
        return {
          success: true,
          provider: this.provider,
          outTradeNo,
          qrCode: response.qr_code,
          paymentUrl: null,
          rawData: response
        };
      } else if (method === 'alipay.trade.pay') {
        const response = result.alipay_trade_pay_response;
        
        if (response.code !== '10000') {
          throw new Error(`支付宝支付失败: ${response.sub_msg || response.msg}`);
        }
        
        return {
          success: true,
          provider: this.provider,
          outTradeNo,
          tradeNo: response.trade_no,
          status: response.trade_status,
          paymentUrl: null,
          rawData: response
        };
      } else {
        // 网页支付返回表单（自动提交的HTML）
        return {
          success: true,
          provider: this.provider,
          outTradeNo,
          paymentUrl: result,
          rawData: { formData: result }
        };
      }
    } catch (error) {
      this.logSafe('error', '创建支付宝支付订单失败', { 
        outTradeNo, 
        error: error.message 
      });
      
      return {
        success: false,
        provider: this.provider,
        outTradeNo,
        errorMessage: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 查询支付宝订单
   * @param {String} outTradeNo - 商户订单号
   * @returns {Promise<Object>} 查询结果
   */
  async queryOrder(outTradeNo) {
    try {
      this.logSafe('info', '开始查询支付宝支付订单', { outTradeNo });
      
      const bizContent = {
        out_trade_no: outTradeNo
      };
      
      const result = await this.alipay.exec('alipay.trade.query', {}, { bizContent });
      
      const response = result.alipay_trade_query_response;
      
      if (response.code !== '10000') {
        throw new Error(`支付宝查询失败: ${response.sub_msg || response.msg}`);
      }
      
      return {
        success: true,
        provider: this.provider,
        outTradeNo,
        tradeNo: response.trade_no,
        tradeStatus: response.trade_status,
        totalAmount: parseFloat(response.total_amount),
        receiptAmount: parseFloat(response.receipt_amount || 0),
        payTime: response.send_pay_date ? new Date(response.send_pay_date) : null,
        rawData: response
      };
    } catch (error) {
      this.logSafe('error', '查询支付宝支付订单失败', { 
        outTradeNo, 
        error: error.message 
      });
      
      return {
        success: false,
        provider: this.provider,
        outTradeNo,
        errorMessage: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 关闭支付宝订单
   * @param {String} outTradeNo - 商户订单号
   * @returns {Promise<Object>} 关闭结果
   */
  async closeOrder(outTradeNo) {
    try {
      this.logSafe('info', '开始关闭支付宝支付订单', { outTradeNo });
      
      const bizContent = {
        out_trade_no: outTradeNo
      };
      
      const result = await this.alipay.exec('alipay.trade.close', {}, { bizContent });
      
      const response = result.alipay_trade_close_response;
      
      if (response.code !== '10000') {
        throw new Error(`支付宝关闭订单失败: ${response.sub_msg || response.msg}`);
      }
      
      return {
        success: true,
        provider: this.provider,
        outTradeNo,
        tradeNo: response.trade_no,
        message: '订单关闭成功',
        rawData: response
      };
    } catch (error) {
      this.logSafe('error', '关闭支付宝支付订单失败', { 
        outTradeNo, 
        error: error.message 
      });
      
      return {
        success: false,
        provider: this.provider,
        outTradeNo,
        errorMessage: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 申请退款
   * @param {Object} refundData - 退款数据
   * @returns {Promise<Object>} 退款结果
   */
  async refund(refundData) {
    const { 
      outTradeNo, outRefundNo, refundAmount, 
      refundReason
    } = refundData;

    try {
      this.logSafe('info', '开始申请支付宝支付退款', { 
        outTradeNo, 
        outRefundNo,
        refundAmount
      });
      
      const bizContent = {
        out_trade_no: outTradeNo,
        refund_amount: refundAmount.toFixed(2),
        out_request_no: outRefundNo || outTradeNo,
        refund_reason: refundReason || '用户退款'
      };
      
      const result = await this.alipay.exec('alipay.trade.refund', {}, { bizContent });
      
      const response = result.alipay_trade_refund_response;
      
      if (response.code !== '10000') {
        throw new Error(`支付宝退款失败: ${response.sub_msg || response.msg}`);
      }
      
      return {
        success: true,
        provider: this.provider,
        outTradeNo,
        outRefundNo: outRefundNo || outTradeNo,
        tradeNo: response.trade_no,
        refundAmount: parseFloat(response.refund_fee),
        rawData: response
      };
    } catch (error) {
      this.logSafe('error', '支付宝支付退款申请失败', { 
        outTradeNo, 
        outRefundNo,
        error: error.message 
      });
      
      return {
        success: false,
        provider: this.provider,
        outTradeNo,
        outRefundNo: outRefundNo || outTradeNo,
        errorMessage: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 查询退款
   * @param {Object} queryData - 查询数据
   * @returns {Promise<Object>} 查询结果
   */
  async queryRefund({ outTradeNo, outRefundNo }) {
    try {
      this.logSafe('info', '开始查询支付宝支付退款', { 
        outTradeNo, 
        outRefundNo 
      });
      
      const bizContent = {
        out_trade_no: outTradeNo,
        out_request_no: outRefundNo || outTradeNo
      };
      
      const result = await this.alipay.exec('alipay.trade.fastpay.refund.query', {}, { bizContent });
      
      const response = result.alipay_trade_fastpay_refund_query_response;
      
      if (response.code !== '10000') {
        throw new Error(`支付宝查询退款失败: ${response.sub_msg || response.msg}`);
      }
      
      return {
        success: true,
        provider: this.provider,
        outTradeNo,
        outRefundNo: outRefundNo || outTradeNo,
        refundAmount: parseFloat(response.refund_amount),
        refundStatus: this._mapRefundStatus(response),
        rawData: response
      };
    } catch (error) {
      this.logSafe('error', '查询支付宝支付退款失败', { 
        outTradeNo, 
        outRefundNo, 
        error: error.message 
      });
      
      return {
        success: false,
        provider: this.provider,
        outTradeNo,
        outRefundNo: outRefundNo || outTradeNo,
        errorMessage: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 下载对账单
   * @param {String} billDate - 对账单日期（格式：yyyy-MM-dd）
   * @param {String} billType - 账单类型（默认：trade）
   * @returns {Promise<Object>} 对账单数据
   */
  async downloadReconciliation(billDate, billType = 'trade') {
    try {
      this.logSafe('info', '开始下载支付宝对账单', { billDate, billType });
      
      // 确保日期格式正确
      const formattedDate = moment(billDate).format('YYYY-MM-DD');
      
      const bizContent = {
        bill_type: billType,
        bill_date: formattedDate
      };
      
      const result = await this.alipay.exec('alipay.data.dataservice.bill.downloadurl.query', {}, { bizContent });
      
      const response = result.alipay_data_dataservice_bill_downloadurl_query_response;
      
      if (response.code !== '10000') {
        throw new Error(`支付宝获取对账单下载地址失败: ${response.sub_msg || response.msg}`);
      }
      
      return {
        success: true,
        provider: this.provider,
        billDate: formattedDate,
        billType,
        downloadUrl: response.bill_download_url,
        rawData: response
      };
    } catch (error) {
      this.logSafe('error', '下载支付宝对账单失败', { 
        billDate, 
        error: error.message 
      });
      
      return {
        success: false,
        provider: this.provider,
        billDate,
        errorMessage: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 验证异步通知
   * @param {Object} notifyData - 通知数据
   * @returns {Promise<Object>} 验证结果
   */
  async verifyNotification(notifyData) {
    try {
      this.logSafe('info', '收到支付宝回调通知', { 
        outTradeNo: notifyData.out_trade_no 
      });
      
      // 验证签名
      const signVerified = this.alipay.checkNotifySign(notifyData);
      
      if (!signVerified) {
        throw new Error('支付宝通知签名验证失败');
      }
      
      // 判断交易状态
      const tradeStatus = notifyData.trade_status;
      const isSuccess = tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED';
      
      return {
        success: true,
        provider: this.provider,
        outTradeNo: notifyData.out_trade_no,
        tradeNo: notifyData.trade_no,
        totalAmount: parseFloat(notifyData.total_amount),
        isSuccess,
        tradeStatus,
        payTime: notifyData.gmt_payment ? new Date(notifyData.gmt_payment) : null,
        rawData: notifyData
      };
    } catch (error) {
      this.logSafe('error', '验证支付宝通知失败', { error: error.message });
      
      return {
        success: false,
        provider: this.provider,
        errorMessage: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 生成成功响应
   * @returns {String} 成功响应
   */
  generateSuccessResponse() {
    return 'success';
  }

  /**
   * 生成失败响应
   * @returns {String} 失败响应
   */
  generateFailResponse() {
    return 'fail';
  }

  /**
   * 测试连接
   * @returns {Promise<Object>} 测试结果
   */
  async testConnection() {
    try {
      // 使用查询接口测试连接
      const bizContent = {
        out_trade_no: `TEST_${Date.now()}`
      };
      
      await this.alipay.exec('alipay.trade.query', {}, { bizContent });
      
      return {
        success: true,
        message: '连接测试成功'
      };
    } catch (error) {
      // 接口调用失败，但如果是业务错误（如订单不存在）也认为连接成功
      if (error.message.includes('交易不存在') || error.message.includes('TRADE_NOT_EXIST')) {
        return {
          success: true,
          message: '连接测试成功'
        };
      }
      
      return {
        success: false,
        message: `连接测试失败: ${error.message}`
      };
    }
  }

  /**
   * 映射退款状态
   * @private
   */
  _mapRefundStatus(response) {
    // 支付宝没有明确的退款状态字段，需要根据其他字段推断
    if (response.refund_amount) {
      if (response.refund_settlement_id) {
        return 'SUCCESS';
      } else {
        return 'PROCESSING';
      }
    }
    
    return 'UNKNOWN';
  }
}

module.exports = ZhifubaoPayment; 