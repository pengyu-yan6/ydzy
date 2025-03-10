/**
 * 认证工具
 * 用于管理用户Token和登录状态
 */

// Token存储键名
const TOKEN_KEY = 'game_token';
const REFRESH_TOKEN_KEY = 'game_refresh_token';
const USER_INFO_KEY = 'game_user_info';

// JWT解析
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('JWT解析失败', error);
    return null;
  }
}

/**
 * 获取Token
 * @returns {string|null} JWT Token
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 设置Token
 * @param {string} token - JWT Token
 */
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * 移除Token
 */
export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * 获取刷新Token
 * @returns {string|null} Refresh Token
 */
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * 设置刷新Token
 * @param {string} refreshToken - 刷新Token
 */
export function setRefreshToken(refreshToken) {
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/**
 * 移除刷新Token
 */
export function removeRefreshToken() {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * 保存用户信息
 * @param {Object} userInfo - 用户信息对象
 */
export function setUserInfo(userInfo) {
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
}

/**
 * 获取用户信息
 * @returns {Object|null} 用户信息对象
 */
export function getUserInfo() {
  const userInfo = localStorage.getItem(USER_INFO_KEY);
  return userInfo ? JSON.parse(userInfo) : null;
}

/**
 * 移除用户信息
 */
export function removeUserInfo() {
  localStorage.removeItem(USER_INFO_KEY);
}

/**
 * 检查是否已登录
 * @returns {boolean} 是否已登录
 */
export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;
  
  // 解析Token检查是否过期
  try {
    const decodedToken = parseJwt(token);
    const currentTime = Date.now() / 1000;
    
    return decodedToken && decodedToken.exp > currentTime;
  } catch (error) {
    return false;
  }
}

/**
 * 检查Token是否即将过期（10分钟内）
 * @returns {boolean} 是否即将过期
 */
export function isTokenExpiringSoon() {
  const token = getToken();
  if (!token) return false;
  
  try {
    const decodedToken = parseJwt(token);
    const currentTime = Date.now() / 1000;
    
    // 如果Token在10分钟内过期，返回true
    return decodedToken && 
           decodedToken.exp > currentTime && 
           decodedToken.exp - currentTime < 600; // 10分钟 = 600秒
  } catch (error) {
    return false;
  }
}

/**
 * 完全登出（清理所有状态）
 */
export function logout() {
  removeToken();
  removeRefreshToken();
  removeUserInfo();
  
  // 可以添加其他清理逻辑，如WebSocket连接断开等
}

/**
 * 获取用户角色
 * @returns {string|null} 用户角色
 */
export function getUserRole() {
  const userInfo = getUserInfo();
  return userInfo ? userInfo.role : null;
}

/**
 * 检查用户是否有特定角色
 * @param {string|Array<string>} roles - 角色或角色数组
 * @returns {boolean} 是否拥有指定角色
 */
export function hasRole(roles) {
  const userRole = getUserRole();
  
  if (!userRole) return false;
  
  if (Array.isArray(roles)) {
    return roles.includes(userRole);
  }
  
  return roles === userRole;
}

// 导出所有函数
export default {
  getToken,
  setToken,
  removeToken,
  getRefreshToken,
  setRefreshToken,
  removeRefreshToken,
  setUserInfo,
  getUserInfo,
  removeUserInfo,
  isLoggedIn,
  isTokenExpiringSoon,
  logout,
  getUserRole,
  hasRole,
  parseJwt
}; 