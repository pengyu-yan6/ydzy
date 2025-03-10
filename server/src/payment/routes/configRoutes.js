/**
 * 支付配置管理路由
 */

const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { verifyToken, verifyAdmin } = require('../../middlewares/auth.middleware');

// 添加权限验证中间件
router.use(verifyToken, verifyAdmin);

// 支付配置管理路由
router.get('/', configController.getAllConfigs);
router.get('/:id', configController.getConfigById);
router.post('/', configController.createConfig);
router.put('/:id', configController.updateConfig);
router.delete('/:id', configController.deleteConfig);
router.post('/:id/test', configController.testConfig);

// 退款手续费设置路由
router.put('/:id/refund-fee', configController.updateRefundFeeSettings);
router.post('/calculate-refund-fee', configController.calculateRefundFee);

// 公开访问的支付方式列表路由（不需要管理员权限）
router.get('/public/methods', configController.getAvailablePaymentMethods);

module.exports = router; 