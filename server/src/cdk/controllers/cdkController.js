/**
 * CDK控制器
 * 实现CDK生命周期管理和验证接口
 */

const { CDK, CDK_STATUS, CDK_TYPES, CDK_MODES } = require('../models/CDK');
const CDKBatch = require('../models/CDKBatch');
const cdkGenerator = require('../services/cdkGenerator');
const excelExporter = require('../services/excelExporter');
const twoFactorAuth = require('../services/twoFactorAuth');
const auditService = require('../services/auditService');
const logger = require('../../utils/logger');
const config = require('../../config');

/**
 * 创建CDK批次
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function createBatch(req, res) {
  try {
    const userId = req.user.id;
    const batchData = req.body;
    
    // 验证必填字段
    if (!batchData.name || !batchData.cdkType || !batchData.quantity || !batchData.value) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }
    
    // 验证数量限制
    if (batchData.quantity <= 0 || batchData.quantity > 1000000) {
      return res.status(400).json({
        success: false,
        message: '生成数量必须在1到1,000,000之间',
        code: 'INVALID_QUANTITY'
      });
    }
    
    // 验证CDK类型
    if (!Object.values(CDK_TYPES).includes(batchData.cdkType)) {
      return res.status(400).json({
        success: false,
        message: '无效的CDK类型',
        code: 'INVALID_CDK_TYPE'
      });
    }
    
    // 处理过期时间
    if (!batchData.expiresAt && !batchData.validityDays) {
      return res.status(400).json({
        success: false,
        message: '必须设置过期时间或有效期天数',
        code: 'MISSING_EXPIRY_INFO'
      });
    }
    
    // 如果提供了有效期天数，计算过期时间
    if (batchData.validityDays && !batchData.expiresAt) {
      const validityDays = parseInt(batchData.validityDays);
      if (isNaN(validityDays) || validityDays <= 0) {
        return res.status(400).json({
          success: false,
          message: '有效期天数必须是正整数',
          code: 'INVALID_VALIDITY_DAYS'
        });
      }
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validityDays);
      batchData.expiresAt = expiresAt;
    }
    
    // 检查是否为干运行（只显示示例，不实际生成）
    const dryRun = req.query.dryRun === 'true';
    
    // 异步生成大批量CDK，返回任务ID
    if (!dryRun && batchData.quantity > 1000) {
      const result = await cdkGenerator.generateCDKsAsync(batchData, {
        userId,
        checkCollision: true
      });
      
      // 记录审计
      await auditService.logBatchAudit(
        result.batchId,
        auditService.AUDIT_EVENTS.BATCH_CREATE,
        userId,
        {
          quantity: batchData.quantity,
          cdkType: batchData.cdkType,
          value: JSON.stringify(batchData.value),
          ip: req.ip
        }
      );
      
      return res.status(202).json({
        success: true,
        message: '已创建大批量CDK生成任务，正在后台处理',
        data: result
      });
    }
    
    // 同步生成小批量CDK
    const result = await cdkGenerator.generateCDKs(batchData, {
      userId,
      dryRun,
      checkCollision: true
    });
    
    // 如果不是干运行，记录审计
    if (!dryRun) {
      await auditService.logBatchAudit(
        result.batchId,
        auditService.AUDIT_EVENTS.BATCH_CREATE,
        userId,
        {
          quantity: batchData.quantity,
          cdkType: batchData.cdkType,
          value: JSON.stringify(batchData.value),
          ip: req.ip
        }
      );
    }
    
    return res.status(dryRun ? 200 : 201).json({
      success: true,
      message: dryRun ? '干运行成功，生成CDK示例' : 'CDK批次创建成功',
      data: result
    });
  } catch (error) {
    logger.error('创建CDK批次失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      body: req.body
    });
    
    return res.status(500).json({
      success: false,
      message: '创建CDK批次失败',
      error: error.message
    });
  }
}

/**
 * 获取批次列表
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function getBatchList(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      cdkType,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search
    } = req.query;
    
    // 构建查询条件
    const query = {};
    
    // 按状态筛选
    if (status) {
      query.status = status;
    }
    
    // 按CDK类型筛选
    if (cdkType) {
      query.cdkType = cdkType;
    }
    
    // 搜索功能
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { batchId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // 计算分页参数
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // 查询总数
    const total = await CDKBatch.countDocuments(query);
    
    // 查询批次列表
    const batches = await CDKBatch.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-auditTrail') // 排除大型审计数据
      .populate('createdBy', 'username');
    
    // 返回结果
    return res.status(200).json({
      success: true,
      data: {
        batches,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('获取CDK批次列表失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      query: req.query
    });
    
    return res.status(500).json({
      success: false,
      message: '获取CDK批次列表失败',
      error: error.message
    });
  }
}

/**
 * 获取批次详情
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function getBatchDetail(req, res) {
  try {
    const { batchId } = req.params;
    
    // 查询批次
    const batch = await CDKBatch.findOne({ batchId })
      .populate('createdBy', 'username');
    
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: '未找到批次',
        code: 'BATCH_NOT_FOUND'
      });
    }
    
    // 统计批次中各状态的CDK数量
    const statusCounts = await CDK.aggregate([
      { $match: { batchId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // 格式化状态计数
    const counts = {};
    statusCounts.forEach(item => {
      counts[item._id] = item.count;
    });
    
    // 添加使用率
    const usageRate = batch.quantity > 0 
      ? ((batch.usedCount / batch.quantity) * 100).toFixed(2) + '%'
      : '0%';
    
    // 返回结果
    return res.status(200).json({
      success: true,
      data: {
        ...batch.toObject(),
        statusCounts: counts,
        usageRate
      }
    });
  } catch (error) {
    logger.error('获取CDK批次详情失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      batchId: req.params.batchId
    });
    
    return res.status(500).json({
      success: false,
      message: '获取CDK批次详情失败',
      error: error.message
    });
  }
}

/**
 * 获取批次中的CDK列表
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function getBatchCDKs(req, res) {
  try {
    const { batchId } = req.params;
    const {
      page = 1,
      limit = 50,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // 检查批次是否存在
    const batchExists = await CDKBatch.exists({ batchId });
    if (!batchExists) {
      return res.status(404).json({
        success: false,
        message: '未找到批次',
        code: 'BATCH_NOT_FOUND'
      });
    }
    
    // 构建查询条件
    const query = { batchId };
    
    // 按状态筛选
    if (status) {
      query.status = status;
    }
    
    // 计算分页参数
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // 查询总数
    const total = await CDK.countDocuments(query);
    
    // 查询CDK列表，敏感字段限制
    const cdks = await CDK.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select('code status createdAt activatedAt usedAt expiresAt usageCount maxUsageCount')
      .lean();
    
    // 返回结果
    return res.status(200).json({
      success: true,
      data: {
        cdks,
        batchId,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('获取批次CDK列表失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      batchId: req.params.batchId
    });
    
    return res.status(500).json({
      success: false,
      message: '获取批次CDK列表失败',
      error: error.message
    });
  }
}

/**
 * 激活一个CDK
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function activateCDK(req, res) {
  try {
    const { cdkId } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;
    
    // 查询CDK
    const cdk = await CDK.findById(cdkId);
    
    if (!cdk) {
      return res.status(404).json({
        success: false,
        message: 'CDK不存在',
        code: 'CDK_NOT_FOUND'
      });
    }
    
    // 尝试激活CDK
    try {
      await cdk.activate(userId, {
        ip: req.ip,
        reason
      });
      
      // 记录审计
      await auditService.logCDKAudit(
        cdk._id,
        auditService.AUDIT_EVENTS.ACTIVATE,
        userId,
        {
          ip: req.ip,
          reason
        }
      );
      
      // 更新批次状态计数
      const batch = await CDKBatch.findOne({ batchId: cdk.batchId });
      if (batch) {
        await batch.updateStatusCounts();
      }
      
      return res.status(200).json({
        success: true,
        message: 'CDK激活成功',
        data: {
          code: cdk.code,
          status: cdk.status,
          activatedAt: cdk.activatedAt
        }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: 'ACTIVATION_FAILED'
      });
    }
  } catch (error) {
    logger.error('激活CDK失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      cdkId: req.params.cdkId
    });
    
    return res.status(500).json({
      success: false,
      message: '激活CDK失败',
      error: error.message
    });
  }
}

/**
 * 作废一个CDK
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function revokeCDK(req, res) {
  try {
    const { cdkId } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;
    
    // 查询CDK
    const cdk = await CDK.findById(cdkId);
    
    if (!cdk) {
      return res.status(404).json({
        success: false,
        message: 'CDK不存在',
        code: 'CDK_NOT_FOUND'
      });
    }
    
    // 尝试作废CDK
    try {
      await cdk.revoke(userId, reason);
      
      // 记录审计
      await auditService.logCDKAudit(
        cdk._id,
        auditService.AUDIT_EVENTS.REVOKE,
        userId,
        {
          ip: req.ip,
          reason
        }
      );
      
      // 更新批次状态计数
      const batch = await CDKBatch.findOne({ batchId: cdk.batchId });
      if (batch) {
        await batch.updateStatusCounts();
      }
      
      return res.status(200).json({
        success: true,
        message: 'CDK作废成功',
        data: {
          code: cdk.code,
          status: cdk.status,
          revokedAt: cdk.revokedAt,
          revokeReason: cdk.revokeReason
        }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: 'REVOCATION_FAILED'
      });
    }
  } catch (error) {
    logger.error('作废CDK失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      cdkId: req.params.cdkId
    });
    
    return res.status(500).json({
      success: false,
      message: '作废CDK失败',
      error: error.message
    });
  }
}

/**
 * 作废整个批次
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function revokeBatch(req, res) {
  try {
    const { batchId } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;
    
    // 查询批次
    const batch = await CDKBatch.findOne({ batchId });
    
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: '未找到批次',
        code: 'BATCH_NOT_FOUND'
      });
    }
    
    // 尝试作废批次
    try {
      await batch.revokeBatch(userId, reason);
      
      // 记录审计
      await auditService.logBatchAudit(
        batchId,
        auditService.AUDIT_EVENTS.BATCH_REVOKE,
        userId,
        {
          ip: req.ip,
          reason,
          revokedAt: new Date()
        }
      );
      
      return res.status(200).json({
        success: true,
        message: '批次作废成功',
        data: {
          batchId: batch.batchId,
          status: batch.status,
          revokedCount: batch.revokedCount
        }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
        code: 'BATCH_REVOCATION_FAILED'
      });
    }
  } catch (error) {
    logger.error('作废批次失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      batchId: req.params.batchId
    });
    
    return res.status(500).json({
      success: false,
      message: '作废批次失败',
      error: error.message
    });
  }
}

/**
 * 获取CDK详情
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function getCDKDetail(req, res) {
  try {
    const { cdkId } = req.params;
    
    // 查询CDK
    const cdk = await CDK.findById(cdkId)
      .populate('createdBy', 'username')
      .populate('usedBy', 'username')
      .populate('revokedBy', 'username');
    
    if (!cdk) {
      return res.status(404).json({
        success: false,
        message: 'CDK不存在',
        code: 'CDK_NOT_FOUND'
      });
    }
    
    // 返回CDK详情，排除敏感字段
    const cdkData = cdk.toObject();
    
    // 如果请求中包含审计标记，获取审计记录
    if (req.query.includeAudit === 'true') {
      const auditTrail = await auditService.getCDKAuditTrail(cdk._id);
      cdkData.auditTrail = auditTrail;
    }
    
    return res.status(200).json({
      success: true,
      data: cdkData
    });
  } catch (error) {
    logger.error('获取CDK详情失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      cdkId: req.params.cdkId
    });
    
    return res.status(500).json({
      success: false,
      message: '获取CDK详情失败',
      error: error.message
    });
  }
}

/**
 * 导出批次到Excel
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function exportBatchToExcel(req, res) {
  try {
    const { batchId } = req.params;
    const userId = req.user.id;
    const {
      includeUsed = false,
      includeExpired = false,
      includeRevoked = false,
      showSensitiveInfo = false,
      password
    } = req.body;
    
    // 查询批次是否存在
    const batch = await CDKBatch.findOne({ batchId });
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: '未找到批次',
        code: 'BATCH_NOT_FOUND'
      });
    }
    
    // 导出Excel
    const result = await excelExporter.exportBatchToExcel(batchId, {
      includeUsed: includeUsed === 'true' || includeUsed === true,
      includeExpired: includeExpired === 'true' || includeExpired === true,
      includeRevoked: includeRevoked === 'true' || includeRevoked === true,
      showSensitiveInfo: showSensitiveInfo === 'true' || showSensitiveInfo === true,
      password,
      adminId: userId
    });
    
    // 记录审计
    await auditService.logBatchAudit(
      batchId,
      auditService.AUDIT_EVENTS.EXPORT,
      userId,
      {
        ip: req.ip,
        fileName: result.fileName,
        recordCount: result.recordCount,
        includeUsed,
        includeExpired,
        includeRevoked,
        hasPassword: !!password
      }
    );
    
    // 返回导出结果
    return res.status(200).json({
      success: true,
      message: 'Excel导出成功',
      data: {
        fileName: result.fileName,
        recordCount: result.recordCount,
        expiresIn: result.expiresIn
      }
    });
  } catch (error) {
    logger.error('导出批次到Excel失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      batchId: req.params.batchId
    });
    
    return res.status(500).json({
      success: false,
      message: '导出批次到Excel失败',
      error: error.message
    });
  }
}

/**
 * 验证并使用CDK（给用户使用）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function redeemCDK(req, res) {
  try {
    const userId = req.user.id;
    const { code, twoFactorCode } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: '缺少CDK码',
        code: 'MISSING_CODE'
      });
    }
    
    // 查找CDK
    const cdk = await CDK.validateCDK(code);
    
    if (!cdk) {
      return res.status(404).json({
        success: false,
        message: 'CDK不存在或无效',
        code: 'INVALID_CDK'
      });
    }
    
    // 准备额外信息
    const extraData = {
      ip: req.ip,
      deviceInfo: req.headers['user-agent'] || '未知设备'
    };
    
    // 检查CDK是否需要2FA验证
    if (cdk.requires2FA) {
      try {
        const user = await req.user.populate('twoFactorAuth');
        
        // 验证2FA代码
        await twoFactorAuth.validateSecureCDKUsage(user, cdk, twoFactorCode);
      } catch (error) {
        // 记录访问拒绝
        await auditService.logAccessDenied(cdk._id, userId, error.message, extraData);
        
        return res.status(401).json({
          success: false,
          message: error.message,
          code: 'TWO_FACTOR_REQUIRED',
          requires2FA: true
        });
      }
    }
    
    // 尝试使用CDK
    try {
      const value = await cdk.redeem(userId, extraData);
      
      // 记录审计
      await auditService.logCDKAudit(
        cdk._id,
        auditService.AUDIT_EVENTS.USE,
        userId,
        extraData
      );
      
      // 更新批次状态计数
      const batch = await CDKBatch.findOne({ batchId: cdk.batchId });
      if (batch) {
        batch.usedCount += 1;
        await batch.save();
      }
      
      return res.status(200).json({
        success: true,
        message: 'CDK使用成功',
        data: {
          cdkType: cdk.type,
          value
        }
      });
    } catch (error) {
      // 记录访问拒绝
      await auditService.logAccessDenied(cdk._id, userId, error.message, extraData);
      
      return res.status(400).json({
        success: false,
        message: error.message,
        code: 'REDEMPTION_FAILED'
      });
    }
  } catch (error) {
    logger.error('使用CDK失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      code: req.body.code
    });
    
    return res.status(500).json({
      success: false,
      message: '使用CDK失败',
      error: error.message
    });
  }
}

/**
 * 检查CDK状态（无需认证，供前端验证用）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function checkCDKStatus(req, res) {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: '缺少CDK码',
        code: 'MISSING_CODE'
      });
    }
    
    // 查找CDK
    const cdk = await CDK.validateCDK(code);
    
    if (!cdk) {
      return res.status(404).json({
        success: false,
        message: 'CDK不存在或无效',
        code: 'INVALID_CDK'
      });
    }
    
    // 返回基本状态（不包含敏感信息）
    return res.status(200).json({
      success: true,
      data: {
        valid: cdk.status === CDK_STATUS.GENERATED || cdk.status === CDK_STATUS.ACTIVATED,
        status: cdk.status,
        type: cdk.type,
        requires2FA: cdk.requires2FA,
        expiresAt: cdk.expiresAt
      }
    });
  } catch (error) {
    logger.error('检查CDK状态失败', {
      error: error.message,
      stack: error.stack,
      code: req.params.code
    });
    
    return res.status(500).json({
      success: false,
      message: '检查CDK状态失败',
      error: error.message
    });
  }
}

/**
 * 获取批次使用分析
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function getBatchAnalytics(req, res) {
  try {
    const { batchId } = req.params;
    
    // 检查批次是否存在
    const batch = await CDKBatch.findOne({ batchId });
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: '未找到批次',
        code: 'BATCH_NOT_FOUND'
      });
    }
    
    // 获取使用分析
    const analytics = await auditService.analyzeBatchUsage(batchId);
    
    // 检测异常使用模式
    const anomalies = await auditService.detectAnomalousUsage(batchId);
    
    return res.status(200).json({
      success: true,
      data: {
        usage: analytics,
        anomalies
      }
    });
  } catch (error) {
    logger.error('获取批次分析失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      batchId: req.params.batchId
    });
    
    return res.status(500).json({
      success: false,
      message: '获取批次分析失败',
      error: error.message
    });
  }
}

/**
 * 获取批次审计记录
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
async function getBatchAuditTrail(req, res) {
  try {
    const { batchId } = req.params;
    
    // 检查批次是否存在
    const batch = await CDKBatch.findOne({ batchId });
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: '未找到批次',
        code: 'BATCH_NOT_FOUND'
      });
    }
    
    // 获取审计记录
    const auditTrail = await auditService.getBatchAuditTrail(batchId);
    
    return res.status(200).json({
      success: true,
      data: auditTrail
    });
  } catch (error) {
    logger.error('获取批次审计记录失败', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      batchId: req.params.batchId
    });
    
    return res.status(500).json({
      success: false,
      message: '获取批次审计记录失败',
      error: error.message
    });
  }
}

module.exports = {
  createBatch,
  getBatchList,
  getBatchDetail,
  getBatchCDKs,
  activateCDK,
  revokeCDK,
  revokeBatch,
  getCDKDetail,
  exportBatchToExcel,
  redeemCDK,
  checkCDKStatus,
  getBatchAnalytics,
  getBatchAuditTrail
}; 