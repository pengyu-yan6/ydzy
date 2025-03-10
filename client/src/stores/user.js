/**
 * 用户状态管理
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/services/api';
import { setToken, setRefreshToken, setUserInfo, removeToken, removeRefreshToken, removeUserInfo } from '@/utils/auth';
import { handleError } from '@/utils/errorHandler';

export const useUserStore = defineStore('user', () => {
  // 状态
  const userId = ref('');
  const userName = ref('');
  const userEmail = ref('');
  const userAvatar = ref('');
  const userRole = ref('');
  const userLevel = ref(1);
  const userExp = ref(0);
  const userRegTime = ref('');
  const userLastLogin = ref('');
  const loading = ref(false);
  const initialized = ref(false);

  // 计算属性
  const isLoggedIn = computed(() => !!userId.value);
  const isAdmin = computed(() => userRole.value === 'admin');
  const isModerator = computed(() => userRole.value === 'moderator' || userRole.value === 'admin');
  
  // 下一级所需经验
  const nextLevelExp = computed(() => {
    return Math.floor(100 * Math.pow(1.5, userLevel.value - 1));
  });
  
  // 经验百分比
  const expPercentage = computed(() => {
    return Math.floor((userExp.value / nextLevelExp.value) * 100);
  });

  // 方法
  // 登录
  async function login(credentials) {
    loading.value = true;
    try {
      const response = await api.auth.login(credentials);
      const { token, refreshToken, user } = response.data;
      
      // 保存令牌和用户信息
      setToken(token);
      setRefreshToken(refreshToken);
      setUserInfo(user);
      
      // 更新状态
      updateUserState(user);
      
      return response.data;
    } catch (error) {
      handleError(error, {
        onNotification: (err) => {
          // 可以在这里处理通知显示
          console.error('登录失败', err.message);
        }
      });
      throw error;
    } finally {
      loading.value = false;
    }
  }
  
  // 注册
  async function register(userData) {
    loading.value = true;
    try {
      const response = await api.auth.register(userData);
      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      loading.value = false;
    }
  }
  
  // 登出
  async function logout() {
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('登出请求失败', error);
    } finally {
      // 无论如何都清除本地状态
      clearUserState();
    }
  }
  
  // 获取用户信息
  async function getUserInfo() {
    loading.value = true;
    try {
      const response = await api.auth.getUserInfo();
      const user = response.data;
      
      // 更新状态
      updateUserState(user);
      
      // 标记为已初始化
      initialized.value = true;
      
      return user;
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      loading.value = false;
    }
  }
  
  // 更新用户信息
  async function updateProfile(profileData) {
    loading.value = true;
    try {
      const response = await api.user.updateProfile(profileData);
      const user = response.data;
      
      // 更新状态
      updateUserState(user);
      
      return user;
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      loading.value = false;
    }
  }
  
  // 更新头像
  async function updateAvatar(file) {
    loading.value = true;
    try {
      const response = await api.upload.uploadFile(file, 'avatar');
      const avatarUrl = response.data.url;
      
      // 更新头像URL
      userAvatar.value = avatarUrl;
      
      // 更新本地存储的用户信息
      const userInfo = JSON.parse(localStorage.getItem('game_user_info') || '{}');
      userInfo.avatar = avatarUrl;
      setUserInfo(userInfo);
      
      return avatarUrl;
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      loading.value = false;
    }
  }
  
  // 修改密码
  async function changePassword(passwordData) {
    loading.value = true;
    try {
      const response = await api.user.changePassword(passwordData);
      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      loading.value = false;
    }
  }
  
  // 刷新令牌
  async function refreshToken() {
    try {
      const response = await api.auth.refreshToken();
      const { token, refreshToken } = response.data;
      
      // 更新令牌
      setToken(token);
      setRefreshToken(refreshToken);
      
      return response.data;
    } catch (error) {
      // 如果刷新失败，清除用户状态
      clearUserState();
      throw error;
    }
  }
  
  // 更新用户状态
  function updateUserState(user) {
    userId.value = user.id;
    userName.value = user.username;
    userEmail.value = user.email;
    userAvatar.value = user.avatar;
    userRole.value = user.role;
    userLevel.value = user.level || 1;
    userExp.value = user.exp || 0;
    userRegTime.value = user.registeredAt;
    userLastLogin.value = user.lastLoginAt;
  }
  
  // 清除用户状态
  function clearUserState() {
    userId.value = '';
    userName.value = '';
    userEmail.value = '';
    userAvatar.value = '';
    userRole.value = '';
    userLevel.value = 1;
    userExp.value = 0;
    userRegTime.value = '';
    userLastLogin.value = '';
    
    // 清除存储的令牌和用户信息
    removeToken();
    removeRefreshToken();
    removeUserInfo();
  }
  
  // 初始化
  async function initialize() {
    if (initialized.value) return;
    
    try {
      await getUserInfo();
    } catch (error) {
      console.error('初始化用户状态失败', error);
      clearUserState();
    }
  }

  return {
    // 状态
    userId,
    userName,
    userEmail,
    userAvatar,
    userRole,
    userLevel,
    userExp,
    userRegTime,
    userLastLogin,
    loading,
    initialized,
    
    // 计算属性
    isLoggedIn,
    isAdmin,
    isModerator,
    nextLevelExp,
    expPercentage,
    
    // 方法
    login,
    register,
    logout,
    getUserInfo,
    updateProfile,
    updateAvatar,
    changePassword,
    refreshToken,
    initialize
  };
}); 