/**
 * CDK路由
 * 实现CDK相关API接口和权限控制
 */

const express = require('express');
const router = express.Router();
const cdkController = require('../controllers/cdkController');
const twoFactorController = require('../controllers/twoFactorController');
const { authenticate } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const security = require('../middleware/security');

// 权限常量
const CDK_PERMISSIONS = {
  CREATE: 'cdk:create',
  READ: 'cdk:read',
  ACTIVATE: 'cdk:activate',
  REVOKE: 'cdk:revoke',
  EXPORT: 'cdk:export',
  ANALYTICS: 'cdk:analytics'
};

// 全局应用请求ID
router.use(security.addRequestId);

// 全局应用异常检测
router.use(security.anomalyDetection);

// ===== 批次管理接口 =====

// 创建CDK批次
router.post(
  '/batch',
  authenticate,
  checkPermission(CDK_PERMISSIONS.CREATE),
  security.batchCreateRateLimiter,
  security.batchCreationRules,
  security.validateRequest,
  cdkController.createBatch
);

// 获取批次列表
router.get(
  '/batch',
  authenticate,
  checkPermission(CDK_PERMISSIONS.READ),
  security.cdkListRules,
  security.validateRequest,
  cdkController.getBatchList
);

// 获取批次详情
router.get(
  '/batch/:batchId',
  authenticate,
  checkPermission(CDK_PERMISSIONS.READ),
  security.batchIdRules,
  security.validateRequest,
  cdkController.getBatchDetail
);

// 获取批次中的CDK列表
router.get(
  '/batch/:batchId/cdks',
  authenticate,
  checkPermission(CDK_PERMISSIONS.READ),
  security.batchIdRules,
  security.cdkListRules,
  security.validateRequest,
  cdkController.getBatchCDKs
);

// 作废整个批次
router.post(
  '/batch/:batchId/revoke',
  authenticate,
  checkPermission(CDK_PERMISSIONS.REVOKE),
  security.cdkManagementRateLimiter,
  security.batchIdRules,
  security.validateRequest,
  cdkController.revokeBatch
);

// 导出批次到Excel
router.post(
  '/batch/:batchId/export',
  authenticate,
  checkPermission(CDK_PERMISSIONS.EXPORT),
  security.exportRateLimiter,
  security.batchIdRules,
  security.exportRules,
  security.validateRequest,
  cdkController.exportBatchToExcel
);

// 获取批次使用分析
router.get(
  '/batch/:batchId/analytics',
  authenticate,
  checkPermission(CDK_PERMISSIONS.ANALYTICS),
  security.batchIdRules,
  security.validateRequest,
  cdkController.getBatchAnalytics
);

// 获取批次审计记录
router.get(
  '/batch/:batchId/audit',
  authenticate,
  checkPermission(CDK_PERMISSIONS.READ),
  security.batchIdRules,
  security.validateRequest,
  cdkController.getBatchAuditTrail
);

// ===== CDK管理接口 =====

// 获取CDK详情
router.get(
  '/cdk/:cdkId',
  authenticate,
  checkPermission(CDK_PERMISSIONS.READ),
  security.cdkIdRules,
  security.validateRequest,
  security.cdkIntegrityCheck,
  cdkController.getCDKDetail
);

// 激活CDK
router.post(
  '/cdk/:cdkId/activate',
  authenticate,
  checkPermission(CDK_PERMISSIONS.ACTIVATE),
  security.cdkManagementRateLimiter,
  security.cdkIdRules,
  security.validateRequest,
  security.cdkIntegrityCheck,
  cdkController.activateCDK
);

// 作废CDK
router.post(
  '/cdk/:cdkId/revoke',
  authenticate,
  checkPermission(CDK_PERMISSIONS.REVOKE),
  security.cdkManagementRateLimiter,
  security.cdkIdRules,
  security.validateRequest,
  security.cdkIntegrityCheck,
  cdkController.revokeCDK
);

// ===== 用户接口 =====

// 验证并使用CDK（用户兑换）
router.post(
  '/redeem',
  authenticate,
  security.redeemRateLimiter,
  security.redeemRules,
  security.validateRequest,
  cdkController.redeemCDK
);

// 检查CDK状态（供前端验证）
router.get(
  '/check/:code',
  security.cdkStatusRateLimiter,
  cdkController.checkCDKStatus
);

// ===== 双因素认证接口 =====

// 开始设置2FA（生成QR码）
router.post(
  '/2fa/setup',
  authenticate,
  security.cdkManagementRateLimiter,
  twoFactorController.setupTwoFactor
);

// 验证并激活2FA
router.post(
  '/2fa/verify',
  authenticate,
  security.cdkManagementRateLimiter,
  security.twoFactorRules,
  security.validateRequest,
  twoFactorController.verifyTwoFactor
);

// 禁用2FA
router.post(
  '/2fa/disable',
  authenticate,
  security.cdkManagementRateLimiter,
  security.twoFactorRules,
  security.validateRequest,
  twoFactorController.disableTwoFactor
);

// 检查2FA状态
router.get(
  '/2fa/status',
  authenticate,
  twoFactorController.checkTwoFactorStatus
);

// 验证登录2FA
router.post(
  '/2fa/verify-login',
  security.twoFactorRules,
  security.validateRequest,
  twoFactorController.verifyLoginCode
);

// ===== 错误处理 =====

// 捕获路由中的异步错误
router.use((err, req, res, next) => {
  logger.error('CDK路由错误', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.id,
    userId: req.user?.id || 'anonymous'
  });
  
  // 根据环境返回适当的错误信息
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(err.status || 500).json({
    success: false,
    message: isProduction ? '处理请求时出错' : err.message,
    code: err.code || 'SERVER_ERROR',
    requestId: req.id
  });
});

module.exports = router;