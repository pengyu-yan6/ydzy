/**
 * 用户认证路由
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken, refreshToken } = require('../middlewares/auth.middleware');

// 用户注册 - POST /api/auth/register
router.post('/register', authController.register);

// 用户登录 - POST /api/auth/login
router.post('/login', authController.login);

// 获取当前用户信息 - GET /api/auth/me（需要认证）
router.get('/me', verifyToken, authController.getMe);

// 修改密码 - PUT /api/auth/change-password（需要认证）
router.put('/change-password', verifyToken, authController.changePassword);

// 忘记密码（请求重置链接）- POST /api/auth/forgot-password
router.post('/forgot-password', authController.forgotPassword);

// 重置密码 - POST /api/auth/reset-password
router.post('/reset-password', authController.resetPassword);

// 刷新令牌 - POST /api/auth/refresh-token
router.post('/refresh-token', refreshToken);

// 注销登录 - POST /api/auth/logout（需要认证）
router.post('/logout', verifyToken, authController.logout);

module.exports = router; 