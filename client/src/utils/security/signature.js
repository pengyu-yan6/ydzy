/**
 * 安全签名工具
 * 用于生成请求签名和数据加密
 */

import { getToken } from '../auth';
import CryptoJS from 'crypto-js';

// 默认密钥（生产环境应使用环境变量或配置文件）
const DEFAULT_SECRET = 'game-security-signature-key';

/**
 * 生成随机字符串作为nonce
 * @param {number} length - 生成的随机字符串长度
 * @returns {string} 随机字符串
 */
export function generateNonce(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  window.crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomValues[i] % chars.length);
  }
  
  return result;
}

/**
 * 规范化排序对象键值
 * 确保签名前所有对象以相同顺序排列键值
 * @param {Object} obj - 需要规范化的对象
 * @returns {Object} 规范化后的对象
 */
export function normalizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeObject(item));
  }
  
  // 对对象的键进行排序
  const sortedKeys = Object.keys(obj).sort();
  const result = {};
  
  for (const key of sortedKeys) {
    result[key] = normalizeObject(obj[key]);
  }
  
  return result;
}

/**
 * 生成请求签名
 * @param {Object} params - 请求参数
 * @param {string} [secret] - 签名密钥，默认使用DEFAULT_SECRET
 * @returns {Object} 包含签名的请求参数
 */
export function generateSignature(params, secret = DEFAULT_SECRET) {
  // 获取当前时间戳
  const timestamp = Date.now();
  
  // 生成nonce随机字符串
  const nonce = generateNonce();
  
  // 获取用户token（如果有）
  const token = getToken();
  
  // 合并数据
  const dataToSign = {
    ...params,
    timestamp,
    nonce,
    token: token || ''
  };
  
  // 规范化数据
  const normalizedData = normalizeObject(dataToSign);
  
  // 转换为JSON字符串
  const jsonData = JSON.stringify(normalizedData);
  
  // 使用HMAC-SHA256生成签名
  const signature = CryptoJS.HmacSHA256(jsonData, secret).toString(CryptoJS.enc.Hex);
  
  // 返回包含签名的数据
  return {
    ...params,
    timestamp,
    nonce,
    signature
  };
}

/**
 * 生成请求头签名
 * 专门用于API请求头中的签名
 * @param {Object} [additionalParams] - 额外参数
 * @returns {Object} 包含签名的请求头对象
 */
export function generateRequestHeaders(additionalParams = {}) {
  // 获取当前时间戳
  const timestamp = Date.now();
  
  // 生成nonce随机字符串
  const nonce = generateNonce();
  
  // 获取用户token（如果有）
  const token = getToken();
  
  // 合并数据
  const dataToSign = {
    ...additionalParams,
    timestamp,
    nonce,
    token: token || ''
  };
  
  // 规范化数据
  const normalizedData = normalizeObject(dataToSign);
  
  // 转换为JSON字符串
  const jsonData = JSON.stringify(normalizedData);
  
  // 使用HMAC-SHA256生成签名
  const signature = CryptoJS.HmacSHA256(jsonData, DEFAULT_SECRET).toString(CryptoJS.enc.Hex);
  
  // 返回Headers对象
  return {
    'X-Game-Signature': signature,
    'X-Game-Timestamp': timestamp.toString(),
    'X-Game-Nonce': nonce
  };
}

/**
 * 生成WebSocket消息签名
 * @param {Object} message - WebSocket消息对象
 * @returns {Object} 包含签名的WebSocket消息
 */
export function signWebSocketMessage(message) {
  return generateSignature(message);
}

/**
 * 加密数据
 * @param {Object|string} data - 要加密的数据
 * @param {string} [key] - 加密密钥，默认使用DEFAULT_SECRET
 * @returns {string} 加密后的字符串
 */
export function encryptData(data, key = DEFAULT_SECRET) {
  const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
  return CryptoJS.AES.encrypt(dataStr, key).toString();
}

/**
 * 解密数据
 * @param {string} encryptedData - 加密的数据字符串
 * @param {string} [key] - 解密密钥，默认使用DEFAULT_SECRET
 * @returns {string|Object} 解密后的数据
 */
export function decryptData(encryptedData, key = DEFAULT_SECRET) {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, key);
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
    
    // 尝试解析JSON
    try {
      return JSON.parse(decryptedStr);
    } catch (e) {
      // 不是JSON，返回字符串
      return decryptedStr;
    }
  } catch (error) {
    console.error('解密失败', error);
    return null;
  }
}

/**
 * 验证签名
 * @param {Object} data - 带签名的数据
 * @param {string} [secret] - 签名密钥，默认使用DEFAULT_SECRET
 * @returns {boolean} 签名是否有效
 */
export function verifySignature(data, secret = DEFAULT_SECRET) {
  if (!data.signature || !data.timestamp || !data.nonce) {
    return false;
  }
  
  // 提取签名
  const { signature, ...restData } = data;
  
  // 规范化数据
  const normalizedData = normalizeObject(restData);
  
  // 转换为JSON字符串
  const jsonData = JSON.stringify(normalizedData);
  
  // 使用HMAC-SHA256生成签名
  const calculatedSignature = CryptoJS.HmacSHA256(jsonData, secret).toString(CryptoJS.enc.Hex);
  
  // 比较签名
  return signature === calculatedSignature;
}

export default {
  generateNonce,
  normalizeObject,
  generateSignature,
  generateRequestHeaders,
  signWebSocketMessage,
  encryptData,
  decryptData,
  verifySignature
}; 