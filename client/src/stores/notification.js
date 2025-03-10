/**
 * 通知状态管理
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useNotificationStore = defineStore('notification', () => {
  // 通知ID计数器
  let notificationIdCounter = 0;
  
  // 通知列表
  const notifications = ref([]);
  
  // 计算属性
  // 成功通知
  const successNotifications = computed(() => {
    return notifications.value.filter(notification => notification.type === 'success');
  });
  
  // 错误通知
  const errorNotifications = computed(() => {
    return notifications.value.filter(notification => notification.type === 'error');
  });
  
  // 警告通知
  const warningNotifications = computed(() => {
    return notifications.value.filter(notification => notification.type === 'warning');
  });
  
  // 信息通知
  const infoNotifications = computed(() => {
    return notifications.value.filter(notification => notification.type === 'info');
  });
  
  // 方法
  // 添加通知
  function addNotification(notification) {
    // 生成唯一ID
    const id = ++notificationIdCounter;
    
    // 设置默认值
    const newNotification = {
      id,
      type: notification.type || 'info',
      message: notification.message,
      duration: notification.duration || 5000, // 默认显示5秒
      timestamp: Date.now()
    };
    
    // 添加到列表
    notifications.value.push(newNotification);
    
    // 如果设置了持续时间，自动移除
    if (newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }
    
    return id;
  }
  
  // 移除通知
  function removeNotification(id) {
    const index = notifications.value.findIndex(notification => notification.id === id);
    if (index !== -1) {
      notifications.value.splice(index, 1);
      return true;
    }
    return false;
  }
  
  // 清空所有通知
  function clearNotifications() {
    notifications.value = [];
  }
  
  // 清空特定类型的通知
  function clearNotificationsByType(type) {
    notifications.value = notifications.value.filter(notification => notification.type !== type);
  }
  
  // 添加成功通知
  function addSuccessNotification(message, duration) {
    return addNotification({
      type: 'success',
      message,
      duration
    });
  }
  
  // 添加错误通知
  function addErrorNotification(message, duration) {
    return addNotification({
      type: 'error',
      message,
      duration
    });
  }
  
  // 添加警告通知
  function addWarningNotification(message, duration) {
    return addNotification({
      type: 'warning',
      message,
      duration
    });
  }
  
  // 添加信息通知
  function addInfoNotification(message, duration) {
    return addNotification({
      type: 'info',
      message,
      duration
    });
  }

  return {
    // 状态
    notifications,
    
    // 计算属性
    successNotifications,
    errorNotifications,
    warningNotifications,
    infoNotifications,
    
    // 方法
    addNotification,
    removeNotification,
    clearNotifications,
    clearNotificationsByType,
    addSuccessNotification,
    addErrorNotification,
    addWarningNotification,
    addInfoNotification
  };
}); 