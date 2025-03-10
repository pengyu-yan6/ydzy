/**
 * 微信支付实现
 * 实现微信支付的各种接口
 */

const axios = require('axios');
const crypto = require('crypto');
const xml2js = require('xml2js');
const PaymentBase = require('../core/PaymentBase');
const logger = require('../../utils/logger');

// XML解析器
const xmlParser = new xml2js.Parser({ explicitArray: false, trim: true });
// XML构建器
const xmlBuilder = new xml2js.Builder({ 
  rootName: 'xml',
  cdata: true,
  headless: true
});

class WeixinPayment extends PaymentBase {
  /**
   * 初始化微信支付
   * @param {Object} config - 支付配置
   */
  constructor(config) {
    super(config);
    this.provider = 'weixin';
    
    // 设置API地址
    this.apiBaseUrl = config.sandbox 
      ? 'https://api.mch.weixin.qq.com/sandboxnew' 
      : 'https://api.mch.weixin.qq.com';
  }

  /**
   * 验证配置是否有效
   * @throws {Error} 配置无效时抛出异常
   */
  validateConfig() {
    super.validateConfig();
    
    const { appId, mchId, mchKey } = this.config;
    
    if (!appId) {
      throw new Error('微信支付配置缺少appId');
    }
    
    if (!mchId) {
      throw new Error('微信支付配置缺少mchId');
    }
    
    if (!mchKey) {
      throw new Error('微信支付配置缺少mchKey');
    }
  }

  /**
   * 统一下单
   * @param {Object} orderData - 订单数据
   * @returns {Promise<Object>} 支付结果
   */
  async createOrder(orderData) {
    const { 
      outTradeNo, body, totalFee, 
      clientIp, notifyUrl, tradeType = 'NATIVE',
      productId, openid
    } = orderData;

    try {
      this.logSafe('info', '开始创建微信支付订单', { outTradeNo, totalFee, tradeType });
      
      // 构建请求参数
      const params = {
        appid: this.config.appId,
        mch_id: this.config.mchId,
        nonce_str: this._generateNonceStr(),
        body: body || '支付订单',
        out_trade_no: outTradeNo,
        total_fee: Math.round(totalFee * 100), // 转换为分
        spbill_create_ip: clientIp,
        notify_url: notifyUrl || this.config.notifyUrl,
        trade_type: tradeType
      };
      
      // 根据交易类型添加额外参数
      if (tradeType === 'NATIVE' && productId) {
        params.product_id = productId;
      }
      
      if (tradeType === 'JSAPI' && openid) {
        params.openid = openid;
      }
      
      // 计算签名
      params.sign = this._generateSign(params);
      
      // 将对象转换为XML
      const xmlData = this._objectToXml(params);
      
      // 发送请求
      const response = await axios.post(
        `${this.apiBaseUrl}/pay/unifiedorder`,
        xmlData,
        {
          headers: {
            'Content-Type': 'text/xml'
          }
        }
      );
      
      // 解析XML响应
      const result = await this._parseXml(response.data);
      
      // 检查返回结果
      if (result.return_code !== 'SUCCESS') {
        throw new Error(`微信支付请求失败: ${result.return_msg}`);
      }
      
      if (result.result_code !== 'SUCCESS') {
        throw new Error(`微信支付业务失败: ${result.err_code} - ${result.err_code_des}`);
      }
      
      // 验证签名
      const resultSign = result.sign;
      delete result.sign;
      
      if (this._generateSign(result) !== resultSign) {
        throw new Error('微信支付返回结果签名验证失败');
      }
      
      // 构建返回结果
      const payResult = {
        success: true,
        provider: this.provider,
        outTradeNo,
        prepayId: result.prepay_id,
        codeUrl: result.code_url, // 二维码链接
        tradeType: result.trade_type,
        paymentParams: this._generatePaymentParams(result),
        rawData: result
      };
      
      this.logSafe('info', '微信支付订单创建成功', { 
        outTradeNo, 
        prepayId: result.prepay_id 
      });
      
      return payResult;
    } catch (error) {
      this.logSafe('error', '微信支付订单创建失败', { 
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
   * 查询订单
   * @param {String} outTradeNo - 商户订单号
   * @returns {Promise<Object>} 查询结果
   */
  async queryOrder(outTradeNo) {
    try {
      this.logSafe('info', '开始查询微信支付订单', { outTradeNo });
      
      // 构建请求参数
      const params = {
        appid: this.config.appId,
        mch_id: this.config.mchId,
        out_trade_no: outTradeNo,
        nonce_str: this._generateNonceStr()
      };
      
      // 计算签名
      params.sign = this._generateSign(params);
      
      // 将对象转换为XML
      const xmlData = this._objectToXml(params);
      
      // 发送请求
      const response = await axios.post(
        `${this.apiBaseUrl}/pay/orderquery`,
        xmlData,
        {
          headers: {
            'Content-Type': 'text/xml'
          }
        }
      );
      
      // 解析XML响应
      const result = await this._parseXml(response.data);
      
      // 检查返回结果
      if (result.return_code !== 'SUCCESS') {
        throw new Error(`微信支付请求失败: ${result.return_msg}`);
      }
      
      if (result.result_code !== 'SUCCESS') {
        throw new Error(`微信支付业务失败: ${result.err_code} - ${result.err_code_des}`);
      }
      
      // 构建返回结果
      return {
        success: true,
        provider: this.provider,
        outTradeNo,
        transactionId: result.transaction_id,
        tradeState: result.trade_state,
        tradeStateDesc: result.trade_state_desc,
        totalFee: parseInt(result.total_fee) / 100, // 转换为元
        cashFee: parseInt(result.cash_fee) / 100, // 转换为元
        payTime: result.time_end ? this._parseTimeEnd(result.time_end) : null,
        rawData: result
      };
    } catch (error) {
      this.logSafe('error', '查询微信支付订单失败', { 
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
   * 关闭订单
   * @param {String} outTradeNo - 商户订单号
   * @returns {Promise<Object>} 关闭结果
   */
  async closeOrder(outTradeNo) {
    try {
      this.logSafe('info', '开始关闭微信支付订单', { outTradeNo });
      
      // 构建请求参数
      const params = {
        appid: this.config.appId,
        mch_id: this.config.mchId,
        out_trade_no: outTradeNo,
        nonce_str: this._generateNonceStr()
      };
      
      // 计算签名
      params.sign = this._generateSign(params);
      
      // 将对象转换为XML
      const xmlData = this._objectToXml(params);
      
      // 发送请求
      const response = await axios.post(
        `${this.apiBaseUrl}/pay/closeorder`,
        xmlData,
        {
          headers: {
            'Content-Type': 'text/xml'
          }
        }
      );
      
      // 解析XML响应
      const result = await this._parseXml(response.data);
      
      // 检查返回结果
      if (result.return_code !== 'SUCCESS') {
        throw new Error(`微信支付请求失败: ${result.return_msg}`);
      }
      
      if (result.result_code !== 'SUCCESS') {
        throw new Error(`微信支付业务失败: ${result.err_code} - ${result.err_code_des}`);
      }
      
      return {
        success: true,
        provider: this.provider,
        outTradeNo,
        message: '订单关闭成功',
        rawData: result
      };
    } catch (error) {
      this.logSafe('error', '关闭微信支付订单失败', { 
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
      outTradeNo, outRefundNo, totalFee, 
      refundFee, refundDesc
    } = refundData;

    try {
      this.logSafe('info', '开始申请微信支付退款', { 
        outTradeNo, 
        outRefundNo,
        refundFee
      });
      
      // 构建请求参数
      const params = {
        appid: this.config.appId,
        mch_id: this.config.mchId,
        nonce_str: this._generateNonceStr(),
        out_trade_no: outTradeNo,
        out_refund_no: outRefundNo,
        total_fee: Math.round(totalFee * 100), // 转换为分
        refund_fee: Math.round(refundFee * 100), // 转换为分
        refund_desc: refundDesc || '商品退款'
      };
      
      // 计算签名
      params.sign = this._generateSign(params);
      
      // 将对象转换为XML
      const xmlData = this._objectToXml(params);
      
      // 配置HTTPS证书
      const httpsAgent = {
        pfx: this.config.pfx,
        passphrase: this.config.pfxPassword
      };
      
      // 发送请求
      const response = await axios.post(
        `${this.apiBaseUrl}/secapi/pay/refund`,
        xmlData,
        {
          headers: {
            'Content-Type': 'text/xml'
          },
          httpsAgent
        }
      );
      
      // 解析XML响应
      const result = await this._parseXml(response.data);
      
      // 检查返回结果
      if (result.return_code !== 'SUCCESS') {
        throw new Error(`微信支付请求失败: ${result.return_msg}`);
      }
      
      if (result.result_code !== 'SUCCESS') {
        throw new Error(`微信支付业务失败: ${result.err_code} - ${result.err_code_des}`);
      }
      
      return {
        success: true,
        provider: this.provider,
        outTradeNo,
        outRefundNo,
        refundId: result.refund_id,
        refundFee: parseInt(result.refund_fee) / 100, // 转换为元
        rawData: result
      };
    } catch (error) {
      this.logSafe('error', '微信支付退款申请失败', { 
        outTradeNo, 
        outRefundNo,
        error: error.message 
      });
      
      return {
        success: false,
        provider: this.provider,
        outTradeNo,
        outRefundNo,
        errorMessage: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 查询退款
   * @param {String} outRefundNo - 商户退款单号
   * @returns {Promise<Object>} 查询结果
   */
  async queryRefund(outRefundNo) {
    try {
      this.logSafe('info', '开始查询微信支付退款', { outRefundNo });
      
      // 构建请求参数
      const params = {
        appid: this.config.appId,
        mch_id: this.config.mchId,
        out_refund_no: outRefundNo,
        nonce_str: this._generateNonceStr()
      };
      
      // 计算签名
      params.sign = this._generateSign(params);
      
      // 将对象转换为XML
      const xmlData = this._objectToXml(params);
      
      // 发送请求
      const response = await axios.post(
        `${this.apiBaseUrl}/pay/refundquery`,
        xmlData,
        {
          headers: {
            'Content-Type': 'text/xml'
          }
        }
      );
      
      // 解析XML响应
      const result = await this._parseXml(response.data);
      
      // 检查返回结果
      if (result.return_code !== 'SUCCESS') {
        throw new Error(`微信支付请求失败: ${result.return_msg}`);
      }
      
      if (result.result_code !== 'SUCCESS') {
        throw new Error(`微信支付业务失败: ${result.err_code} - ${result.err_code_des}`);
      }
      
      return {
        success: true,
        provider: this.provider,
        outRefundNo,
        outTradeNo: result.out_trade_no,
        refundStatus: result.refund_status_0,
        refundFee: parseInt(result.refund_fee_0) / 100, // 转换为元
        rawData: result
      };
    } catch (error) {
      this.logSafe('error', '查询微信支付退款失败', { 
        outRefundNo, 
        error: error.message 
      });
      
      return {
        success: false,
        provider: this.provider,
        outRefundNo,
        errorMessage: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 下载对账单
   * @param {String} billDate - 对账单日期（格式：yyyyMMdd）
   * @param {String} billType - 账单类型
   * @returns {Promise<Object>} 对账单数据
   */
  async downloadReconciliation(billDate, billType = 'ALL') {
    try {
      this.logSafe('info', '开始下载微信支付对账单', { billDate, billType });
      
      // 构建请求参数
      const params = {
        appid: this.config.appId,
        mch_id: this.config.mchId,
        bill_date: billDate,
        bill_type: billType,
        nonce_str: this._generateNonceStr()
      };
      
      // 计算签名
      params.sign = this._generateSign(params);
      
      // 将对象转换为XML
      const xmlData = this._objectToXml(params);
      
      // 发送请求
      const response = await axios.post(
        `${this.apiBaseUrl}/pay/downloadbill`,
        xmlData,
        {
          headers: {
            'Content-Type': 'text/xml'
          },
          responseType: 'text'
        }
      );
      
      // 检查是否返回XML（表示错误）
      if (response.data.includes('<xml>')) {
        const result = await this._parseXml(response.data);
        throw new Error(`微信支付业务失败: ${result.err_code} - ${result.err_code_des}`);
      }
      
      // 解析账单数据
      const billData = this._parseBill(response.data);
      
      return {
        success: true,
        provider: this.provider,
        billDate,
        billType,
        data: billData
      };
    } catch (error) {
      this.logSafe('error', '下载微信支付对账单失败', { 
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
   * 验证支付通知
   * @param {Object|String} notifyData - 通知数据（XML字符串或对象）
   * @returns {Promise<Object>} 验证结果
   */
  async verifyNotification(notifyData) {
    try {
      // 解析XML通知
      let notify;
      if (typeof notifyData === 'string') {
        notify = await this._parseXml(notifyData);
      } else {
        notify = notifyData;
      }
      
      this.logSafe('info', '收到微信支付回调通知', { 
        outTradeNo: notify.out_trade_no 
      });
      
      // 检查返回结果
      if (notify.return_code !== 'SUCCESS') {
        throw new Error(`通知数据错误: ${notify.return_msg}`);
      }
      
      // 验证签名
      const notifySign = notify.sign;
      delete notify.sign;
      
      if (this._generateSign(notify) !== notifySign) {
        throw new Error('通知签名验证失败');
      }
      
      // 检查支付结果
      if (notify.result_code !== 'SUCCESS') {
        throw new Error(`支付失败: ${notify.err_code} - ${notify.err_code_des}`);
      }
      
      return {
        success: true,
        provider: this.provider,
        outTradeNo: notify.out_trade_no,
        transactionId: notify.transaction_id,
        totalFee: parseInt(notify.total_fee) / 100, // 转换为元
        isSuccess: notify.result_code === 'SUCCESS',
        payTime: notify.time_end ? this._parseTimeEnd(notify.time_end) : null,
        rawData: notify
      };
    } catch (error) {
      this.logSafe('error', '验证微信支付通知失败', { error: error.message });
      
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
   * @returns {String} 成功响应XML
   */
  generateSuccessResponse() {
    return this._objectToXml({
      return_code: 'SUCCESS',
      return_msg: 'OK'
    });
  }

  /**
   * 生成失败响应
   * @param {String} message - 失败消息
   * @returns {String} 失败响应XML
   */
  generateFailResponse(message) {
    return this._objectToXml({
      return_code: 'FAIL',
      return_msg: message || 'FAIL'
    });
  }

  /**
   * 测试连接
   * @returns {Promise<Object>} 测试结果
   */
  async testConnection() {
    try {
      // 构建请求参数
      const params = {
        appid: this.config.appId,
        mch_id: this.config.mchId,
        nonce_str: this._generateNonceStr(),
        sign_type: 'MD5'
      };
      
      // 计算签名
      params.sign = this._generateSign(params);
      
      // 将对象转换为XML
      const xmlData = this._objectToXml(params);
      
      // 发送请求（使用获取沙箱密钥的接口测试连接）
      const response = await axios.post(
        'https://api.mch.weixin.qq.com/sandboxnew/pay/getsignkey',
        xmlData,
        {
          headers: {
            'Content-Type': 'text/xml'
          },
          timeout: 5000 // 5秒超时
        }
      );
      
      // 解析XML响应
      const result = await this._parseXml(response.data);
      
      // 检查返回结果
      if (result.return_code !== 'SUCCESS') {
        return {
          success: false,
          message: `连接测试失败: ${result.return_msg}`
        };
      }
      
      return {
        success: true,
        message: '连接测试成功'
      };
    } catch (error) {
      return {
        success: false,
        message: `连接测试失败: ${error.message}`
      };
    }
  }

  /**
   * 生成随机字符串
   * @param {Number} length - 长度
   * @returns {String} 随机字符串
   * @private
   */
  _generateNonceStr(length = 32) {
    return crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  /**
   * 生成签名
   * @param {Object} params - 参数
   * @returns {String} 签名
   * @private
   */
  _generateSign(params) {
    // 按字母顺序排序并拼接
    const sortedParams = Object.keys(params).sort().map(key => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        return `${key}=${params[key]}`;
      }
      return '';
    }).filter(Boolean).join('&');
    
    // 拼接key
    const stringSign = `${sortedParams}&key=${this.config.mchKey}`;
    
    // 使用MD5加密并转为大写
    return crypto.createHash('md5')
      .update(stringSign)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * 解析XML
   * @param {String} xml - XML字符串
   * @returns {Promise<Object>} 解析结果
   * @private
   */
  _parseXml(xml) {
    return new Promise((resolve, reject) => {
      xmlParser.parseString(xml, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result.xml);
        }
      });
    });
  }

  /**
   * 将对象转换为XML
   * @param {Object} obj - 对象
   * @returns {String} XML字符串
   * @private
   */
  _objectToXml(obj) {
    return xmlBuilder.buildObject(obj);
  }

  /**
   * 解析支付时间
   * @param {String} timeEnd - 支付完成时间
   * @returns {Date} 日期对象
   * @private
   */
  _parseTimeEnd(timeEnd) {
    // 格式：yyyyMMddHHmmss
    const year = timeEnd.substring(0, 4);
    const month = timeEnd.substring(4, 6);
    const day = timeEnd.substring(6, 8);
    const hour = timeEnd.substring(8, 10);
    const minute = timeEnd.substring(10, 12);
    const second = timeEnd.substring(12, 14);
    
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
  }

  /**
   * 解析对账单
   * @param {String} bill - 对账单字符串
   * @returns {Object} 解析结果
   * @private
   */
  _parseBill(bill) {
    try {
      // 分割行
      const lines = bill.split('\n').filter(line => line.trim() !== '');
      
      // 第一行是标题
      const headers = lines[0].split(',').map(item => item.trim().replace(/`/g, ''));
      
      // 数据行
      const dataLines = lines.slice(1, lines.length - 2);
      
      // 解析数据
      const items = dataLines.map(line => {
        const values = line.split(',').map(item => item.trim().replace(/`/g, ''));
        
        const item = {};
        headers.forEach((header, index) => {
          item[header] = values[index];
        });
        
        return item;
      });
      
      // 解析统计行
      const summaryLine = lines[lines.length - 2];
      const summaryValues = summaryLine.split(',').map(item => item.trim().replace(/`/g, ''));
      
      const summary = {};
      // 统计行的格式固定
      summary.total_transactions = summaryValues[0].split('：')[1];
      summary.total_fee = summaryValues[1].split('：')[1];
      summary.total_refund = summaryValues[2].split('：')[1];
      summary.total_coupon_refund = summaryValues[3].split('：')[1];
      summary.total_commission_fee = summaryValues[4].split('：')[1];
      
      return {
        items,
        summary
      };
    } catch (error) {
      this.logSafe('error', '解析对账单失败', { error: error.message });
      return { items: [], summary: {} };
    }
  }

  /**
   * 生成支付参数（用于APP、JSAPI等支付）
   * @param {Object} unifiedOrderResult - 统一下单返回结果
   * @returns {Object} 支付参数
   * @private
   */
  _generatePaymentParams(unifiedOrderResult) {
    const { prepay_id, trade_type } = unifiedOrderResult;
    
    // 根据不同交易类型生成不同参数
    if (trade_type === 'JSAPI') {
      // 生成JSAPI支付参数
      const params = {
        appId: this.config.appId,
        timeStamp: Math.floor(Date.now() / 1000).toString(),
        nonceStr: this._generateNonceStr(),
        package: `prepay_id=${prepay_id}`,
        signType: 'MD5'
      };
      
      params.paySign = this._generateSign(params);
      
      return params;
    } else if (trade_type === 'APP') {
      // 生成APP支付参数
      const params = {
        appid: this.config.appId,
        partnerid: this.config.mchId,
        prepayid: prepay_id,
        package: 'Sign=WXPay',
        noncestr: this._generateNonceStr(),
        timestamp: Math.floor(Date.now() / 1000).toString()
      };
      
      params.sign = this._generateSign(params);
      
      return params;
    }
    
    return {};
  }
}

module.exports = WeixinPayment; 