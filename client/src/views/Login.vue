<template>
  <div class="login-container">
    <div class="login-form-wrapper">
      <h2>账号登录</h2>
      <el-form
        ref="loginForm"
        :model="loginForm"
        :rules="rules"
        label-position="top"
        class="login-form"
      >
        <el-form-item label="用户名/邮箱" prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="请输入用户名或邮箱"
            prefix-icon="User"
          ></el-input>
        </el-form-item>
        
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="请输入密码"
            prefix-icon="Lock"
            show-password
          ></el-input>
        </el-form-item>
        
        <div class="login-options">
          <el-checkbox v-model="loginForm.remember">记住我</el-checkbox>
          <router-link to="/forgot-password" class="forgot-password">
            忘记密码？
          </router-link>
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
          还没有账号？
          <router-link to="/register">立即注册</router-link>
        </div>
        
        <div class="other-login-methods">
          <div class="divider">
            <span>其他登录方式</span>
          </div>
          <div class="social-login">
            <el-button circle class="social-btn">
              <el-icon><icon-wechat /></el-icon>
            </el-button>
            <el-button circle class="social-btn">
              <el-icon><icon-qq /></el-icon>
            </el-button>
            <el-button circle class="social-btn">
              <el-icon><icon-weibo /></el-icon>
            </el-button>
          </div>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'LoginPage',
  data() {
    return {
      // 登录表单数据
      loginForm: {
        username: '',
        password: '',
        remember: false
      },
      // 表单验证规则
      rules: {
        username: [
          { required: true, message: '请输入用户名或邮箱', trigger: 'blur' }
        ],
        password: [
          { required: true, message: '请输入密码', trigger: 'blur' },
          { min: 6, message: '密码不能少于6个字符', trigger: 'blur' }
        ]
      },
      loading: false, // 加载状态
    };
  },
  methods: {
    // 处理登录
    handleLogin() {
      // 表单验证
      this.$refs.loginForm.validate(async (valid) => {
        if (valid) {
          this.loading = true;
          try {
            // 发送登录请求
            const response = await axios.post('/api/auth/login', {
              username: this.loginForm.username,
              password: this.loginForm.password
            });
            
            // 存储token和用户信息
            const { token, user } = response.data;
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            
            // 显示登录成功消息
            this.$message.success('登录成功');
            
            // 获取重定向地址（如有）或默认跳转到首页
            const redirectPath = this.$route.query.redirect || '/';
            this.$router.push(redirectPath);
          } catch (error) {
            // 处理登录错误
            this.$message.error(error.response?.data?.message || '登录失败，请检查用户名和密码');
          } finally {
            this.loading = false;
          }
        }
      });
    }
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 200px);
  padding: 2rem;
}

.login-form-wrapper {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  border-radius: 12px;
  background-color: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.login-form-wrapper h2 {
  text-align: center;
  margin-bottom: 2rem;
  color: #333;
}

.login-form {
  margin-top: 1rem;
}

.login-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.forgot-password {
  font-size: 14px;
  color: #666;
  text-decoration: none;
}

.forgot-password:hover {
  color: #409EFF;
}

.login-button {
  width: 100%;
  padding: 12px;
  font-size: 16px;
}

.register-link {
  margin-top: 1rem;
  text-align: center;
  font-size: 14px;
  color: #666;
}

.register-link a {
  color: #409EFF;
  text-decoration: none;
}

.register-link a:hover {
  text-decoration: underline;
}

.other-login-methods {
  margin-top: 2rem;
}

.divider {
  display: flex;
  align-items: center;
  margin: 1rem 0;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #eee;
}

.divider span {
  padding: 0 10px;
  font-size: 14px;
  color: #999;
}

.social-login {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 1rem;
}

.social-btn {
  font-size: 20px;
}
</style> 