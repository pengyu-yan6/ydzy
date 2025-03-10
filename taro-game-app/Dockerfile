# 多阶段构建 - 构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建应用
RUN npm run build:h5

# 多阶段构建 - 生产阶段
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 安装生产依赖
COPY package*.json ./
RUN npm ci --only=production

# 从构建阶段复制构建产物
COPY --from=builder /app/dist /app/dist

# 创建证书目录
RUN mkdir -p /app/certs/wechat
RUN mkdir -p /app/certs/alipay

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# 启动应用
CMD ["node", "dist/server.js"]