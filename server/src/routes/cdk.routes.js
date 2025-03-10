/**
 * CDK管理路由
 */

const express = require('express');
const router = express.Router();
const cdkController = require('../controllers/cdk.controller');
const { verifyToken, checkAdmin } = require('../middlewares/auth.middleware');

// 用户兑换CDK - POST /api/cdk/redeem（需要认证）
router.post('/redeem', verifyToken, cdkController.redeemCDK);

// 以下路由仅管理员可用

// 创建CDK - POST /api/cdk（需要管理员权限）
router.post('/', verifyToken, checkAdmin, cdkController.createCDK);

// 获取CDK列表 - GET /api/cdk（需要管理员权限）
router.get('/', verifyToken, checkAdmin, cdkController.getCDKs);

// 获取CDK详情 - GET /api/cdk/:id（需要管理员权限）
router.get('/:id', verifyToken, checkAdmin, cdkController.getCDKById);

// 更新CDK状态 - PATCH /api/cdk/:id/status（需要管理员权限）
router.patch('/:id/status', verifyToken, checkAdmin, cdkController.updateCDKStatus);

// 删除CDK - DELETE /api/cdk/:id（需要管理员权限）
router.delete('/:id', verifyToken, checkAdmin, cdkController.deleteCDK);

module.exports = router; 