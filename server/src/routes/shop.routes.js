/**
 * 商城和支付路由
 */

const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shop.controller');
const paymentController = require('../controllers/payment.controller');
const { verifyToken, checkAdmin } = require('../middlewares/auth.middleware');
const { verifyPaymentSource, verifyPaymentTimestamp } = require('../middlewares/payment.middleware');
const { checkPaymentRisk } = require('../middlewares/payment-risk.middleware');

// 获取商品列表 - GET /api/shop（公开）
router.get('/', shopController.getProducts);

// 获取商品详情 - GET /api/shop/:id（公开）
router.get('/:id', shopController.getProductById);

// 创建支付订单 - POST /api/shop/payment（需要认证）
router.post('/payment', verifyToken, checkPaymentRisk, paymentController.createOrder);

// 查询订单状态 - GET /api/shop/payment/:orderId（需要认证）
router.get('/payment/:orderId', verifyToken, paymentController.queryOrderStatus);

// 获取订单历史 - GET /api/shop/payment/history（需要认证）
router.get('/payment/history', verifyToken, paymentController.getOrderHistory);

// 支付回调接口 - POST /api/shop/payment/callback（第三方支付平台调用）
router.post('/payment/callback', 
  verifyPaymentSource, 
  verifyPaymentTimestamp, 
  paymentController.handlePaymentCallback
);

// 以下路由仅管理员可用

// 创建商品 - POST /api/shop（需要管理员权限）
router.post('/', verifyToken, checkAdmin, shopController.createProduct);

// 更新商品 - PUT /api/shop/:id（需要管理员权限）
router.put('/:id', verifyToken, checkAdmin, shopController.updateProduct);

// 删除商品 - DELETE /api/shop/:id（需要管理员权限）
router.delete('/:id', verifyToken, checkAdmin, shopController.deleteProduct);

module.exports = router; 