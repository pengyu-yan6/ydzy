/**
 * 主应用程序入口
 * 配置Express框架和各种中间件
 */

// 导入必要的依赖
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

// 导入路由模块
const authRoutes = require('./routes/auth.routes');
const gameRoutes = require('./routes/game.routes');
const shopRoutes = require('./routes/shop.routes');
const cdkRoutes = require('./cdk/routes/cdkRoutes');
const adminRoutes = require('./routes/admin.routes');

// 导入中间件
const { verifyToken } = require('./middlewares/auth.middleware');
const { errorHandler, notFound } = require('./middlewares/error.middleware');
const logger = require('./utils/logger');

// 导入Socket.io控制器
const socketController = require('./controllers/socket.controller');

// 导入配置
const config = require('./config');

// 导入支付模块
const initPaymentModule = require('./payment');

// 加载环境变量
dotenv.config();

// 创建Express应用
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: config.security?.cors || {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 掩盖MongoDB URI中的敏感信息
function maskMongoUri(uri) {
  if (!uri) return '';
  return uri.replace(/(mongodb:\/\/|mongodb\+srv:\/\/)(.*):(.*)@/, '$1****:****@');
}

// 连接数据库
mongoose.connect(config.database.uri, config.database.options)
  .then(() => {
    const maskedUri = maskMongoUri(config.database.uri);
    logger.info('数据库连接成功', { uri: maskedUri });
  })
  .catch(err => {
    logger.error('数据库连接失败', { error: err.message });
    process.exit(1);
  });

// 中间件配置
app.use(cors(config.security?.cors));  // 允许跨域请求
app.use(helmet());  // 安全HTTP头
app.use(express.json({ limit: '10kb' }));  // 解析JSON请求体，限制大小
app.use(express.urlencoded({ extended: true, limit: '10kb' }));  // 解析URL编码的请求体
app.use(morgan('dev'));  // 请求日志记录

// API请求日志
app.use(logger.apiLogger);

// 添加安全响应头
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// 限流器配置
const apiLimiter = rateLimit(config.security?.rateLimit || {
  windowMs: 15 * 60 * 1000,  // 15分钟
  max: 100,  // 每个IP 15分钟内最多100个请求
  standardHeaders: true,
  legacyHeaders: false,
  message: '请求过于频繁，请稍后再试'
});

// 应用限流器到所有API路由
app.use('/api', apiLimiter);

// 静态文件服务
app.use(express.static(path.join(__dirname, '../public')));

// API路由
app.use('/api/auth', authRoutes);  // 用户认证相关路由
app.use('/api/game', verifyToken, gameRoutes);  // 游戏数据相关路由
app.use('/api/shop', verifyToken, shopRoutes);  // 商城相关路由
app.use('/api/cdk', cdkRoutes);  // CDK相关路由
app.use('/api/admin', verifyToken, adminRoutes);  // 管理员相关路由

// 初始化支付模块
const paymentModule = initPaymentModule(app);

// 全局对象，方便其他模块访问支付API
app.locals.payment = paymentModule;

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: '服务正常运行',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 处理未匹配的路由
app.use('*', notFound);

// 错误处理中间件
app.use(errorHandler);

// 设置Socket.io
socketController(io);

// 启动服务器
const PORT = config.server.port || process.env.PORT || 3000;
const HOST = config.server.host || 'localhost';

server.listen(PORT, HOST, () => {
  logger.info(`服务器运行在 ${HOST}:${PORT}`, {
    env: config.server.env,
    nodeVersion: process.version
  });
});

// 优雅关闭函数
async function gracefulShutdown(signal) {
  logger.info(`收到 ${signal} 信号，开始优雅关闭...`);
  
  try {
    // 关闭HTTP服务器
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info('HTTP服务器已关闭');
    
    // 关闭数据库连接
    await mongoose.connection.close();
    logger.info('数据库连接已关闭');
    
    process.exit(0);
  } catch (error) {
    logger.error('关闭过程中发生错误', { error });
    process.exit(1);
  }
}

// 处理进程信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 处理未捕获的异常
process.on('uncaughtException', (err) => {
  logger.error('未捕获的异常', {
    error: err.message,
    stack: err.stack,
    fatal: true
  });
  
  // 给日志一些时间写入
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    fatal: false
  });
});

module.exports = { app, server };