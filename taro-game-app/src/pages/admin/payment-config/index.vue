<template>
  <view class="payment-config-container">
    <!-- 顶部导航栏 -->
    <view class="top-bar">
      <view class="back-button" @tap="navigateBack">
        <text class="back-icon">←</text>
        <text>返回</text>
      </view>
      <view class="page-title">支付密钥管理</view>
      <view class="placeholder"></view>
    </view>

    <!-- 主内容区域 -->
    <view class="main-content">
      <!-- 密钥配置表单 -->
      <view class="config-form">
        <view class="form-title">API密钥配置</view>
        
        <!-- 支付渠道选择 -->
        <view class="form-item">
          <view class="form-label">支付渠道</view>
          <view class="form-input-group">
            <view 
              v-for="channel in paymentChannels" 
              :key="channel.value"
              :class="['channel-option', selectedChannel === channel.value ? 'active' : '']"
              @tap="selectChannel(channel.value)"
            >
              <text>{{ channel.label }}</text>
            </view>
          </view>
        </view>

        <!-- 环境选择 -->
        <view class="form-item">
          <view class="form-label">环境选择</view>
          <view class="form-input-group">
            <view 
              v-for="env in environments" 
              :key="env.value"
              :class="['env-option', selectedEnv === env.value ? 'active' : '']"
              @tap="selectEnv(env.value)"
            >
              <text>{{ env.label }}</text>
            </view>
          </view>
        </view>

        <!-- 密钥表单 -->
        <view class="form-item">
          <view class="form-label">App ID</view>
          <input class="form-input" v-model="configForm.appId" placeholder="请输入App ID" />
        </view>

        <view class="form-item">
          <view class="form-label">App Secret</view>
          <view class="secret-input-group">
            <input 
              class="form-input" 
              :type="showSecret ? 'text' : 'password'" 
              v-model="configForm.appSecret" 
              placeholder="请输入App Secret" 
            />
            <text class="toggle-visibility" @tap="toggleSecretVisibility">{{ showSecret ? '隐藏' : '显示' }}</text>
          </view>
        </view>

        <view class="form-item">
          <view class="form-label">API Base URL</view>
          <input class="form-input" v-model="configForm.apiBaseUrl" placeholder="请输入API基础URL" />
        </view>

        <view class="form-item">
          <view class="form-label">签名有效期(分钟)</view>
          <input class="form-input" type="number" v-model="configForm.signatureExpireTime" placeholder="请输入签名有效期" />
        </view>

        <!-- 保存按钮 -->
        <view class="form-actions">
          <view class="button primary" @tap="saveConfig">保存配置</view>
          <view class="button secondary" @tap="testConfig">测试连接</view>
        </view>
      </view>

      <!-- 密钥列表 -->
      <view class="config-list">
        <view class="list-title">已保存的配置</view>
        <view class="list-header">
          <text class="header-cell">渠道</text>
          <text class="header-cell">环境</text>
          <text class="header-cell">App ID</text>
          <text class="header-cell">状态</text>
          <text class="header-cell">操作</text>
        </view>
        <view class="list-body">
          <view v-if="savedConfigs.length === 0" class="empty-list">
            <text>暂无已保存的配置</text>
          </view>
          <view 
            v-for="(config, index) in savedConfigs" 
            :key="index"
            class="list-row"
          >
            <text class="list-cell">{{ getChannelLabel(config.channel) }}</text>
            <text class="list-cell">{{ getEnvLabel(config.env) }}</text>
            <text class="list-cell">{{ config.appId }}</text>
            <text :class="['list-cell', 'status', config.status === 'active' ? 'active' : 'inactive']">{{ config.status === 'active' ? '正常' : '异常' }}</text>
            <view class="list-cell actions">
              <text class="action-btn edit" @tap="editConfig(index)">编辑</text>
              <text class="action-btn delete" @tap="deleteConfig(index)">删除</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 测试结果弹窗 -->
    <view v-if="showTestResult" class="modal-overlay">
      <view class="modal-content">
        <view class="modal-header">
          <text>测试结果</text>
          <text class="close-btn" @tap="closeTestResult">×</text>
        </view>
        <view class="modal-body">
          <view :class="['test-result', testSuccess ? 'success' : 'error']">
            <text>{{ testResultMessage }}</text>
          </view>
          <view v-if="testDetails" class="test-details">
            <text>{{ testDetails }}</text>
          </view>
        </view>
        <view class="modal-footer">
          <view class="button primary" @tap="closeTestResult">确定</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { ref, reactive, onMounted } from 'vue';
import Taro from '@tarojs/taro';
import { PaymentChannel } from '../../../services/PaymentService';

export default {
  name: 'PaymentConfig',
  
  setup() {
    // 支付渠道选项
    const paymentChannels = [
      { label: '微信支付', value: PaymentChannel.WECHAT },
      { label: '支付宝', value: PaymentChannel.ALIPAY }
    ];
    
    // 环境选项
    const environments = [
      { label: '开发环境', value: 'development' },
      { label: '测试环境', value: 'test' },
      { label: '生产环境', value: 'production' }
    ];
    
    // 表单数据
    const selectedChannel = ref(PaymentChannel.WECHAT);
    const selectedEnv = ref('development');
    const showSecret = ref(false);
    const configForm = reactive({
      appId: '',
      appSecret: '',
      apiBaseUrl: '',
      signatureExpireTime: '5'
    });
    
    // 已保存的配置列表
    const savedConfigs = ref([]);
    
    // 测试结果相关
    const showTestResult = ref(false);
    const testSuccess = ref(false);
    const testResultMessage = ref('');
    const testDetails = ref('');
    
    // 选择支付渠道
    const selectChannel = (channel) => {
      selectedChannel.value = channel;
    };
    
    // 选择环境
    const selectEnv = (env) => {
      selectedEnv.value = env;
    };
    
    // 切换密钥可见性
    const toggleSecretVisibility = () => {
      showSecret.value = !showSecret.value;
    };
    
    // 获取渠道标签
    const getChannelLabel = (channelValue) => {
      const channel = paymentChannels.find(ch => ch.value === channelValue);
      return channel ? channel.label : channelValue;
    };
    
    // 获取环境标签
    const getEnvLabel = (envValue) => {
      const env = environments.find(e => e.value === envValue);
      return env ? env.label : envValue;
    };
    
    // 保存配置
    const saveConfig = () => {
      // 表单验证
      if (!configForm.appId || !configForm.appSecret || !configForm.apiBaseUrl) {
        Taro.showToast({
          title: '请填写完整的配置信息',
          icon: 'none'
        });
        return;
      }
      
      // 构建配置对象
      const config = {
        channel: selectedChannel.value,
        env: selectedEnv.value,
        appId: configForm.appId,
        appSecret: configForm.appSecret,
        apiBaseUrl: configForm.apiBaseUrl,
        signatureExpireTime: parseInt(configForm.signatureExpireTime) || 5,
        status: 'active',
        createdAt: Date.now()
      };
      
      // 检查是否已存在相同渠道和环境的配置
      const existingIndex = savedConfigs.value.findIndex(
        item => item.channel === config.channel && item.env === config.env
      );
      
      if (existingIndex >= 0) {
        // 更新已有配置
        savedConfigs.value[existingIndex] = config;
      } else {
        // 添加新配置
        savedConfigs.value.push(config);
      }
      
      // 保存到本地存储
      Taro.setStorageSync('payment_configs', savedConfigs.value);
      
      // 显示成功提示
      Taro.showToast({
        title: '配置保存成功',
        icon: 'success'
      });
      
      // 重置表单
      resetForm();
    };
    
    // 测试配置
    const testConfig = async () => {
      // 表单验证
      if (!configForm.appId || !configForm.appSecret || !configForm.apiBaseUrl) {
        Taro.showToast({
          title: '请填写完整的配置信息',
          icon: 'none'
        });
        return;
      }
      
      // 显示加载提示
      Taro.showLoading({
        title: '测试连接中...'
      });
      
      try {
        // 模拟API测试请求
        // 实际项目中应该调用真实的API测试接口
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // 模拟测试成功
        testSuccess.value = true;
        testResultMessage.value = '连接测试成功';
        testDetails.value = `成功连接到 ${configForm.apiBaseUrl}\n验证密钥有效性：通过\n响应时间：120ms`;
        
        // 随机模拟失败情况用于测试
        if (Math.random() > 0.7) {
          testSuccess.value = false;
          testResultMessage.value = '连接测试失败';
          testDetails.value = `无法连接到 ${configForm.apiBaseUrl}\n错误信息：API密钥无效或已过期\n请检查配置信息是否正确`;
        }
      } catch (error) {
        // 处理测试失败
        testSuccess.value = false;
        testResultMessage.value = '连接测试失败';
        testDetails.value = `错误信息：${error.message || '未知错误'}`;
      } finally {
        // 隐藏加载提示
        Taro.hideLoading();
        // 显示测试结果
        showTestResult.value = true;
      }
    };
    
    // 关闭测试结果弹窗
    const closeTestResult = () => {
      showTestResult.value = false;
    };
    
    // 编辑配置
    const editConfig = (index) => {
      const config = savedConfigs.value[index];
      selectedChannel.value = config.channel;
      selectedEnv.value = config.env;
      configForm.appId = config.appId;
      configForm.appSecret = config.appSecret;
      configForm.apiBaseUrl = config.apiBaseUrl;
      configForm.signatureExpireTime = config.signatureExpireTime.toString();
      
      // 滚动到表单顶部
      Taro.pageScrollTo({
        scrollTop: 0,
        duration: 300
      });
    };
    
    // 删除配置
    const deleteConfig = (index) => {
      Taro.showModal({
        title: '确认删除',
        content: '确定要删除此配置吗？删除后无法恢复。',
        success: (res) => {
          if (res.confirm) {
            savedConfigs.value.splice(index, 1);
            // 保存到本地存储
            Taro.setStorageSync('payment_configs', savedConfigs.value);
            
            Taro.showToast({
              title: '删除成功',
              icon: 'success'
            });
          }
        }
      });
    };
    
    // 重置表单
    const resetForm = () => {
      configForm.appId = '';
      configForm.appSecret = '';
      configForm.apiBaseUrl = '';
      configForm.signatureExpireTime = '5';
      selectedChannel.value = PaymentChannel.WECHAT;
      selectedEnv.value = 'development';
    };
    
    // 返回上一页
    const navigateBack = () => {
      Taro.navigateBack();
    };
    
    // 组件挂载时加载已保存的配置
    onMounted(() => {
      try {
        const configs = Taro.getStorageSync('payment_configs');
        if (configs && Array.isArray(configs)) {
          savedConfigs.value = configs;
        }
      } catch (error) {
        console.error('Failed to load saved configs:', error);
      }
    });
    
    return {
      paymentChannels,
      environments,
      selectedChannel,
      selectedEnv,
      configForm,
      showSecret,
      savedConfigs,
      showTestResult,
      testSuccess,
      testResultMessage,
      testDetails,
      selectChannel,
      selectEnv,
      toggleSecretVisibility,
      getChannelLabel,
      getEnvLabel,
      saveConfig,
      testConfig,
      closeTestResult,
      editConfig,
      deleteConfig,
      navigateBack
    };
  }
};
</script>

<style>
.payment-config-container {
  padding: 20px;
  background-color: #f5f7fa;
  min-height: 100vh;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.back-button {
  display: flex;
  align-items: center;
  font-size: 28px;
  color: #333;
}

.back-icon {
  margin-right: 5px;
}

.page-title {
  font-size: 32px;
  font-weight: bold;
  color: #333;
}

.placeholder {
  width: 60px;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-form, .config-list {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.form-title, .list-title {
  font-size: 30px;
  font-weight: bold;
  margin-bottom: 20px;
  color: #333;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.form-item {
  margin-bottom: 20px;
}

.form-label {
  font-size: 28px;
  color: #333;
  margin-bottom: 10px;
}

.form-input-group {
  display: flex;
  gap: 10px;
}

.channel-option, .env-option {
  padding: 10px 20px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 26px;
  color: #666;
}

.channel-option.active, .env-option.active {
  background-color: #1890ff;
  color: #fff;
  border-color: #1890ff;
}

.form-input {
  width: 100%;
  height: 80px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0 15px;
  font-size: 26px;
}

.secret-input-group {
  position: relative;
}

.toggle-visibility {
  position: absolute;
  right: 15px;
  top: 50%;
  transform: translateY(-50%);
  color: #1890ff;
  font-size: 26px;
}

.form-actions {
  display: flex;
  gap: 15px;
  margin-top: 30px;
}

.button {
  padding: 12px 25px;
  border-radius: 4px;
  font-size: 28px;
  text-align: center;
}

.primary {
  background-color: #1890ff;
  color: #fff;
}

.secondary {
  background-color: #f0f0f0;
  color: #666;
  border: 1px solid #ddd;
}

.list-header {
  display: flex;
  background-color: #f7f7f7;
  padding: 15px 10px;
  border-radius: 4px;
  margin-bottom: 10px;
  font-weight: bold;
  font-size: 26px;
  color: #333;
}

.list-row {
  display: flex;
  padding: 15px 10px;
  border-bottom: 1px solid #eee;
  font-size: 26px;
  color: #666;
}

.header-cell, .list-cell {
  flex: 1;
  display: flex;
  align-items: center;
}

.status {
  font-weight: bold;
}

.status.active {
  color: #52c41a;
}

.status.inactive {
  color: #f5222d;
}

.actions {
  display: flex;
  gap: 10px;
}

.action-btn {
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 24px;
}

.edit {
  color: #1890ff;
  border: 1px solid #1890ff;
}

.delete {
  color: #f5222d;
  border: 1px solid #f5222d;
}

.empty-list {
  padding: 30px 0;
  text-align: center;
  color: #999;
  font-size: 28px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  width: 80%;
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
}

.close-btn {
  font-size: 32px;
  color: #999;
}

.modal-body {
  padding: 20px;
}

.test-result {
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 15px;
  font-size: 28px;
}

.test-result.success {
  background-color: #f6ffed;
  border: 1px solid #b7eb8f;
  color: #52c41a;
}

.test-result.error {
  background-color: #fff2f0;
  border: 1px solid #ffccc7;
  color: #f5222d;
}

.test-details {
  background-color: #f5f5f5;
  padding: 15px;
  border-radius: 4px;
  font-size: 26px;
  color: #666;
  white-space: pre-line;
}

.modal-footer {
  padding: 15px 20px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
}
</style>