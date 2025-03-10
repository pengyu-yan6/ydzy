/**
 * UUID生成工具
 * 用于生成唯一标识符，主要用于支付模块的nonce生成
 */

/**
 * 生成UUID v4
 * @returns UUID字符串
 */
export function generateUUID(): string {
  // 实现RFC4122版本4的UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 生成指定长度的随机字符串
 * @param length 字符串长度
 * @returns 随机字符串
 */
export function generateRandomString(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 生成带时间戳的唯一ID
 * 适合用于订单ID等需要包含时间信息的场景
 * @returns 带时间戳的唯一ID
 */
export function generateTimeBasedId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomPart}`;
}