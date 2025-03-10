<template>
  <div class="login-container">
    <div class="login-content">
      <div class="login-header">
        <img src="@/assets/logo.png" alt="Logo" class="logo" />
        <h2 class="title">游戏登录</h2>
      </div>
      
      <el-form 
        ref="loginForm" 
        :model="loginForm" 
        :rules="loginRules" 
        class="login-form"
        size="large"
      >
        <el-form-item prop="username">
          <el-input 
            v-model="loginForm.username" 
            placeholder="用户名/邮箱"
            prefix-icon="User"
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input 
            v-model="loginForm.password" 
            type="password" 
            placeholder="密码"
            prefix-icon="Lock"
            show-password
          />
        </el-form-item>
        
        <div class="remember-forgot">
          <el-checkbox v-model="loginForm.remember">记住我</el-checkbox>
          <router-link to="/forgot-password" class="forgot-link">忘记密码?</router-link>
        </div>
        
        <el-form-item>
          <el-button 
            type="primary" 
            :loading="loading" 
            class="login-button"
            @click="handleLogin"
          >
            登录
          </el-button>
        </el-form-item>
        
        <div class="register-link">
          还没有账号? <router-link to="/register">立即注册</router-link>
        </div>
      </el-form>
      
      <div class="login-divider">
        <span>或使用以下方式登录</span>
      </div>
      
      <div class="social-login">
        <el-button class="social-button wechat">
          <i class="social-icon wechat-icon"></i>
          微信登录
        </el-button>
        
        <el-button class="social-button qq">
          <i class="social-icon qq-icon"></i>
          QQ登录
        </el-button>
      </div>
    </div>
    
    <div class="login-footer">
      <p>© {{ currentYear }} 游戏名称 版权所有</p>
      <div class="footer-links">
        <router-link to="/about">关于我们</router-link>
        <router-link to="/terms">服务条款</router-link>
        <router-link to="/privacy">隐私政策</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { useNotificationStore } from '@/stores/notification';
import { decryptData } from '@/utils/security/signature';

// 路由和状态
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const notificationStore = useNotificationStore();

// 表单引用
const loginForm = ref(null);

// 表单数据
const loginData = reactive({
  username: '',
  password: '',
  remember: false
});

// 表单验证规则
const loginRules = {
  username: [
    { required: true, message: '请输入用户名或邮箱', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6个字符', trigger: 'blur' }
  ]
};

// 加载状态
const loading = computed(() => userStore.loading);

// 当前年份
const currentYear = new Date().getFullYear();

// 处理登录
const handleLogin = async () => {
  if (!loginForm.value) return;
  
  try {
    // 表单验证
    await loginForm.value.validate();
    
    // 调用登录API
    await userStore.login({
      username: loginData.username,
      password: loginData.password,
      remember: loginData.remember
    });
    
    // 登录成功通知
    notificationStore.addSuccessNotification('登录成功，欢迎回来！');
    
    // 如果有重定向参数，解密并跳转
    if (route.query.redirect) {
      try {
        const redirectPath = decryptData(route.query.redirect);
        router.push(redirectPath);
      } catch (error) {
        // 解密失败，跳转到默认页面
        router.push('/game');
      }
    } else {
      // 默认跳转到游戏大厅
      router.push('/game');
    }
  } catch (error) {
    console.error('登录失败', error);
  }
};

// 尝试从localStorage恢复用户名
onMounted(() => {
  const savedUsername = localStorage.getItem('saved_username');
  if (savedUsername) {
    loginData.username = savedUsername;
    loginData.remember = true;
  }
});
</script>

<style scoped>
.login-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: url('@/assets/bg/login-bg.jpg') no-repeat center center;
  background-size: cover;
  position: relative;
}

.login-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1;
}

.login-content {
  position: relative;
  z-index: 2;
  width: 400px;
  margin: 100px auto 0;
  padding: 30px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.logo {
  width: 80px;
  height: auto;
  margin-bottom: 15px;
}

.title {
  font-size: 24px;
  color: #333;
  margin: 0;
}

.login-form {
  margin-bottom: 20px;
}

.remember-forgot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.forgot-link {
  color: #409eff;
  text-decoration: none;
  font-size: 14px;
}

.login-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
}

.register-link {
  text-align: center;
  font-size: 14px;
  color: #606266;
  margin-top: 15px;
}

.register-link a {
  color: #409eff;
  text-decoration: none;
}

.login-divider {
  display: flex;
  align-items: center;
  margin: 20px 0;
  color: #909399;
  font-size: 14px;
}

.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #dcdfe6;
}

.login-divider span {
  padding: 0 15px;
}

.social-login {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.social-button {
  flex: 1;
  margin: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.social-button:first-child {
  margin-left: 0;
}

.social-button:last-child {
  margin-right: 0;
}

.social-icon {
  display: inline-block;
  width: 20px;
  height: 20px;
  margin-right: 8px;
  background-size: contain;
  background-repeat: no-repeat;
}

.wechat-icon {
  background-image: url('@/assets/icons/wechat.png');
}

.qq-icon {
  background-image: url('@/assets/icons/qq.png');
}

.wechat {
  background-color: #07c160;
  border-color: #07c160;
  color: white;
}

.qq {
  background-color: #12b7f5;
  border-color: #12b7f5;
  color: white;
}

.login-footer {
  position: relative;
  z-index: 2;
  margin-top: auto;
  text-align: center;
  padding: 20px;
  color: rgba(255, 255, 255, 0.8);
}

.footer-links {
  margin-top: 10px;
}

.footer-links a {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  margin: 0 10px;
  font-size: 14px;
}

.footer-links a:hover {
  color: white;
  text-decoration: underline;
}

/* 响应式调整 */
@media (max-width: 480px) {
  .login-content {
    width: 90%;
    padding: 20px;
  }
  
  .social-login {
    flex-direction: column;
  }
  
  .social-button {
    margin: 5px 0;
  }
}
</style> 