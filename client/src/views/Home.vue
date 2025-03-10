<template>
  <div class="home-container">
    <!-- 游戏宣传部分 -->
    <section class="hero">
      <div class="hero-content">
        <h2>欢迎来到《跃升之路》</h2>
        <p>一场战略与智慧的较量，登上巅峰之路</p>
        <div class="action-buttons">
          <el-button type="primary" size="large" @click="startGame" v-if="isLoggedIn">
            开始游戏
          </el-button>
          <el-button type="success" size="large" @click="goToLogin" v-else>
            登录账号
          </el-button>
          <el-button plain size="large" @click="goToRegister" v-if="!isLoggedIn">
            注册账号
          </el-button>
        </div>
      </div>
    </section>
    
    <!-- 游戏特色介绍 -->
    <section class="features">
      <h3>游戏特色</h3>
      <div class="feature-list">
        <div class="feature-item">
          <el-icon><Avatar /></el-icon>
          <h4>英雄阵容</h4>
          <p>多样化的英雄选择，打造专属战斗阵容</p>
        </div>
        <div class="feature-item">
          <el-icon><Star /></el-icon>
          <h4>策略对决</h4>
          <p>灵活多变的战术布局，赢取胜利</p>
        </div>
        <div class="feature-item">
          <el-icon><Trophy /></el-icon>
          <h4>排位赛季</h4>
          <p>挑战高手，登上排行榜顶端</p>
        </div>
        <div class="feature-item">
          <el-icon><GoldMedal /></el-icon>
          <h4>奖励系统</h4>
          <p>丰厚的游戏奖励，不断升级成长</p>
        </div>
      </div>
    </section>
    
    <!-- 游戏公告 -->
    <section class="announcements">
      <h3>最新公告</h3>
      <div class="announcement-list">
        <div class="announcement-item" v-for="(item, index) in announcements" :key="index">
          <h4>{{ item.title }}</h4>
          <p class="announcement-date">{{ item.date }}</p>
          <p>{{ item.content }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  name: 'HomePage',
  data() {
    return {
      isLoggedIn: false, // 登录状态
      announcements: [
        {
          title: '游戏上线公告',
          date: '2023-11-01',
          content: '《跃升之路》正式上线，邀请所有玩家加入这场策略之战！'
        },
        {
          title: '首届排位赛季开启',
          date: '2023-11-10',
          content: '首届排位赛季"星辰之路"现已开启，冲击最强王者！'
        },
        {
          title: '新英雄登场',
          date: '2023-11-15',
          content: '全新英雄"星光守护者"加入战场，带来全新战斗体验！'
        }
      ]
    };
  },
  mounted() {
    // 检查用户是否已登录
    const token = localStorage.getItem('token');
    this.isLoggedIn = !!token;
  },
  methods: {
    // 开始游戏
    startGame() {
      this.$router.push('/game');
    },
    // 前往登录页
    goToLogin() {
      this.$router.push('/login');
    },
    // 前往注册页
    goToRegister() {
      this.$router.push('/register');
    }
  }
};
</script>

<style scoped>
.home-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.hero {
  background: url('../assets/images/hero-bg.jpg') center/cover;
  height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: white;
  border-radius: 12px;
  margin-bottom: 3rem;
  position: relative;
}

.hero::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 12px;
}

.hero-content {
  position: relative;
  z-index: 1;
}

.hero h2 {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.hero p {
  font-size: 1.5rem;
  margin-bottom: 2rem;
}

.action-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.features {
  margin-bottom: 3rem;
}

.features h3, .announcements h3 {
  text-align: center;
  font-size: 2rem;
  margin-bottom: 2rem;
  color: #333;
}

.feature-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2rem;
}

.feature-item {
  text-align: center;
  padding: 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s;
}

.feature-item:hover {
  transform: translateY(-5px);
}

.feature-item i {
  font-size: 3rem;
  color: #667eea;
  margin-bottom: 1rem;
}

.feature-item h4 {
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
  color: #333;
}

.announcement-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
}

.announcement-item {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.announcement-item h4 {
  font-size: 1.2rem;
  color: #333;
  margin-bottom: 0.5rem;
}

.announcement-date {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

@media (max-width: 992px) {
  .feature-list, .announcement-list {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .feature-list, .announcement-list {
    grid-template-columns: 1fr;
  }
}
</style> 