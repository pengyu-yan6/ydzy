/**
 * 加密工具类
 * 提供各种加密算法，用于支付模块的签名生成和验证
 */

import * as CryptoJS from 'crypto-js';
import { SHA256, HmacSHA256, MD5, AES, enc, lib } from 'crypto-js';

/**
 * 计算字符串的SHA256哈希值
 * @param data 需要计算哈希的字符串
 * @returns SHA256哈希值（十六进制字符串）
 */
export function sha256(data: string): string {
  return SHA256(data).toString();
}

/**
 * 计算HMAC-SHA256
 * @param data 需要计算的数据
 * @param key 密钥
 * @returns HMAC-SHA256哈希值（十六进制字符串）
 */
export function hmacSha256(data: string, key: string): string {
  return HmacSHA256(data, key).toString();
}

/**
 * 生成指定长度的随机字节数组
 * @param length 字节数组长度
 * @returns 十六进制表示的随机字节字符串
 */
export function randomBytes(length: number): string {
  // 使用crypto-js的WordArray.random生成安全的随机字节
  const words = lib.WordArray.random(length);
  return words.toString();
}

/**
 * MD5哈希函数
 * @param data 需要计算哈希的字符串
 * @returns MD5哈希值（十六进制字符串）
 */
export function md5(data: string): string {
  return MD5(data).toString();
}

/**
 * AES加密
 * @param data 需要加密的数据
 * @param key 加密密钥
 * @returns 加密后的数据（Base64编码字符串）
 */
export function aesEncrypt(data: string, key: string): string {
  // 使用crypto-js的AES加密，并返回Base64编码的字符串
  return AES.encrypt(data, key).toString();
}

/**
 * AES解密
 * @param encryptedData 加密后的数据（Base64编码字符串）
 * @param key 解密密钥
 * @returns 解密后的数据
 */
export function aesDecrypt(encryptedData: string, key: string): string {
  // 使用crypto-js的AES解密，并将结果转换为UTF-8字符串
  const bytes = AES.decrypt(encryptedData, key);
  return bytes.toString(enc.Utf8);
}

/**
 * 生成安全的随机盐值
 * @param length 盐值长度
 * @returns 随机盐值（十六进制字符串）
 */
export function generateSalt(length: number = 16): string {
  return lib.WordArray.random(length).toString();
}

/**
 * 使用PBKDF2（密码基础密钥派生函数2）进行密钥派生
 * @param password 原始密码
 * @param salt 盐值
 * @param iterations 迭代次数（推荐至少10000次）
 * @param keySize 生成的密钥长度（以字节为单位）
 * @returns 派生的密钥（十六进制字符串）
 */
export function deriveKey(password: string, salt: string, iterations: number = 10000, keySize: number = 32): string {
  // 使用crypto-js的PBKDF2函数
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: keySize / 4, // keySize以32位字为单位，需要除以4转换为字节
    iterations: iterations
  });
  return key.toString();
}

/**
 * 安全比较两个字符串（防止时序攻击）
 * @param a 第一个字符串
 * @param b 第二个字符串
 * @returns 是否相等
 */
export function secureCompare(a: string, b: string): boolean {
  // 如果长度不同，直接返回false
  if (a.length !== b.length) return false;
  
  // 使用常量时间比较算法，防止时序攻击
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}