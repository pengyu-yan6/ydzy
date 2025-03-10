import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// Vite配置文件
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'), // 设置@别名指向src目录
    },
  },
  server: {
    proxy: {
      // 配置API请求代理
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}); 