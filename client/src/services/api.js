/**
 * API服务
 * 处理与后端的所有API通信
 */
import axios from 'axios';
import { getToken } from '../utils/auth';
import { generateSignature } from '../utils/security';

// 创建axios实例
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000
});

// 请求拦截器
api.interceptors.request.use(
  config => {
    // 添加token到请求头
    const token = getToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // 添加签名（如果需要）
    if (config.needsSignature !== false) {
      const timestamp = Date.now();
      const nonce = Math.random().toString(36).substring(2, 15);
      
      // 获取请求数据
      const data = config.method === 'get' ? config.params : config.data;
      
      // 生成签名
      const { signature } = generateSignature(data, timestamp, nonce);
      
      // 添加签名信息到请求头
      config.headers['X-Signature'] = signature;
      config.headers['X-Timestamp'] = timestamp;
      config.headers['X-Nonce'] = nonce;
    }
    
    return config;
  },
  error => {
    console.error('请求错误', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  response => {
    // 直接返回响应数据
    return response.data;
  },
  error => {
    const { response } = error;
    
    // 错误处理
    if (response) {
      switch (response.status) {
        case 401:
          // 未认证，清理token并重定向到登录页
          console.error('未授权访问，请重新登录');
          // 清理token
          localStorage.removeItem('token');
          // 跳转到登录页
          window.location.href = '/login';
          break;
          
        case 403:
          console.error('无权限访问该资源');
          break;
          
        case 429:
          console.error('请求过于频繁，请稍后再试');
          break;
          
        default:
          console.error(`请求错误: ${response.status}`, response.data);
      }
    } else {
      // 网络错误
      console.error('网络错误，请检查网络连接');
    }
    
    return Promise.reject(error);
  }
);

// API方法
export default {
  // 认证相关
  auth: {
    login: (credentials) => api.post('/auth/login', credentials),
    register: (userData) => api.post('/auth/register', userData),
    logout: () => api.post('/auth/logout'),
    refreshToken: () => api.post('/auth/refresh'),
    requestVerification: () => api.post('/auth/request-verification-code'),
    verifyCode: (code) => api.post('/auth/verify', { code })
  },
  
  // 用户相关
  user: {
    getProfile: () => api.get('/user/profile'),
    updateProfile: (data) => api.put('/user/profile', data),
    changePassword: (data) => api.post('/user/change-password', data)
  },
  
  // 游戏相关
  game: {
    // 战斗
    getBattleList: () => api.get('/game/battles'),
    getBattleDetails: (battleId) => api.get(`/game/battle/${battleId}`),
    startBattle: (data) => api.post('/game/battle/start', data),
    submitBattleAction: (battleId, action) => api.post(`/game/battle/${battleId}/action`, action),
    
    // 角色
    getCharacters: () => api.get('/game/characters'),
    getCharacterDetails: (characterId) => api.get(`/game/character/${characterId}`),
    updateCharacter: (characterId, data) => api.put(`/game/character/${characterId}`, data),
    
    // 道具
    getItems: () => api.get('/game/items'),
    useItem: (itemId, data) => api.post(`/game/item/${itemId}/use`, data)
  },
  
  // 公会相关
  guild: {
    getGuilds: () => api.get('/guild/list'),
    getGuildDetails: (guildId) => api.get(`/guild/${guildId}`),
    createGuild: (data) => api.post('/guild/create', data),
    joinGuild: (guildId) => api.post(`/guild/${guildId}/join`),
    leaveGuild: (guildId) => api.post(`/guild/${guildId}/leave`)
  },
  
  // 支付相关
  payment: {
    getProducts: () => api.get('/payment/products'),
    createOrder: (data) => api.post('/payment/create', data),
    getOrderStatus: (orderId) => api.get(`/payment/order/${orderId}`),
    getTransactions: () => api.get('/payment/transactions')
  },
  
  // 文件上传
  upload: {
    uploadFile: (file, type = 'common') => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      
      return api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
    }
  }
}; 