/**
 * CDK Excel导出服务
 * 支持将CDK批次导出为Excel文件
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { CDK } = require('../models/CDK');
const CDKBatch = require('../models/CDKBatch');
const logger = require('../../utils/logger');
const config = require('../../config');
const { maskSensitiveData } = require('../../payment/utils/payment-utils');

// 创建导出目录（如果不存在）
const exportDir = path.join(process.cwd(), 'exports');
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

// 临时文件清理时间（毫秒）
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24小时

/**
 * 格式化日期时间
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的日期时间字符串
 */
function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 对象值格式化为字符串
 * @param {any} value - 要格式化的值
 * @returns {string} 格式化的字符串
 */
function formatValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }
  
  return String(value);
}

/**
 * 导出单个批次的CDK到Excel
 * @param {string} batchId - 批次ID
 * @param {Object} options - 导出选项
 * @returns {Promise<Object>} 导出结果
 */
async function exportBatchToExcel(batchId, options = {}) {
  const {
    includeUsed = false,
    includeExpired = false,
    includeRevoked = false,
    showSensitiveInfo = false,
    password = null,
    exportPath = null,
    adminId = null
  } = options;
  
  try {
    // 获取批次信息
    const batch = await CDKBatch.findOne({ batchId });
    if (!batch) {
      throw new Error(`批次不存在: ${batchId}`);
    }
    
    // 构建查询条件
    const query = { batchId };
    
    // 如果不包括特定状态的CDK，则排除它们
    const excludeStatuses = [];
    if (!includeUsed) excludeStatuses.push('used');
    if (!includeExpired) excludeStatuses.push('expired');
    if (!includeRevoked) excludeStatuses.push('revoked');
    
    if (excludeStatuses.length > 0) {
      query.status = { $nin: excludeStatuses };
    }
    
    // 查询CDK记录
    const cdks = await CDK.find(query).sort({ _id: 1 });
    
    if (cdks.length === 0) {
      throw new Error('没有找到符合条件的CDK');
    }
    
    // 创建工作簿
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '跃升之路-CDK管理系统';
    workbook.created = new Date();
    
    // 添加批次信息工作表
    const infoSheet = workbook.addWorksheet('批次信息');
    infoSheet.columns = [
      { header: '项目', key: 'item', width: 20 },
      { header: '值', key: 'value', width: 50 }
    ];
    
    // 添加批次信息
    const batchInfo = [
      { item: '批次ID', value: batch.batchId },
      { item: '批次名称', value: batch.name },
      { item: '批次描述', value: batch.description || '' },
      { item: 'CDK类型', value: batch.cdkType },
      { item: 'CDK模式', value: batch.cdkMode },
      { item: '创建时间', value: formatDateTime(batch.createdAt) },
      { item: '过期时间', value: formatDateTime(batch.expiresAt) },
      { item: '总数量', value: batch.quantity },
      { item: '已生成数量', value: batch.generatedCount },
      { item: '已使用数量', value: batch.usedCount },
      { item: '已激活数量', value: batch.activatedCount },
      { item: '已过期数量', value: batch.expiredCount },
      { item: '已作废数量', value: batch.revokedCount },
      { item: '批次状态', value: batch.status }
    ];
    
    // 添加价值信息（可能敏感）
    if (showSensitiveInfo) {
      batchInfo.push({ 
        item: 'CDK价值',
        value: formatValue(batch.value)
      });
    }
    
    // 将信息添加到工作表
    infoSheet.addRows(batchInfo);
    
    // 设置样式
    infoSheet.getColumn('item').font = { bold: true };
    infoSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.font = { bold: true };
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD3D3D3' }
        };
      }
    });
    
    // 添加CDK列表工作表
    const cdkSheet = workbook.addWorksheet('CDK列表');
    
    // 定义列
    const columns = [
      { header: 'CDK码', key: 'code', width: 40 },
      { header: '状态', key: 'status', width: 12 },
      { header: '创建时间', key: 'createdAt', width: 20 },
      { header: '激活时间', key: 'activatedAt', width: 20 },
      { header: '使用时间', key: 'usedAt', width: 20 },
      { header: '过期时间', key: 'expiresAt', width: 20 }
    ];
    
    // 如果显示敏感信息，添加更多列
    if (showSensitiveInfo) {
      columns.push(
        { header: '使用者ID', key: 'usedBy', width: 30 },
        { header: '价值', key: 'value', width: 30 },
        { header: '使用次数', key: 'usageCount', width: 12 },
        { header: '最大使用次数', key: 'maxUsageCount', width: 12 }
      );
    }
    
    cdkSheet.columns = columns;
    
    // 添加CDK数据
    const cdkRows = cdks.map(cdk => {
      // 基本非敏感数据
      const row = {
        code: cdk.code,
        status: cdk.status,
        createdAt: formatDateTime(cdk.createdAt),
        activatedAt: formatDateTime(cdk.activatedAt),
        usedAt: formatDateTime(cdk.usedAt),
        expiresAt: formatDateTime(cdk.expiresAt)
      };
      
      // 敏感数据（仅在需要时添加）
      if (showSensitiveInfo) {
        row.usedBy = cdk.usedBy ? cdk.usedBy.toString() : '';
        row.value = formatValue(cdk.value);
        row.usageCount = cdk.usageCount;
        row.maxUsageCount = cdk.maxUsageCount;
      }
      
      return row;
    });
    
    cdkSheet.addRows(cdkRows);
    
    // 设置标题行样式
    cdkSheet.getRow(1).font = { bold: true };
    cdkSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };
    
    // 根据状态设置行颜色
    cdkSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const status = row.getCell('status').value;
        
        switch(status) {
          case 'used':
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFE0E0' } // 浅红色
            };
            break;
          case 'expired':
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFD700' } // 浅黄色
            };
            break;
          case 'revoked':
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFD3D3D3' } // 灰色
            };
            break;
          case 'activated':
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFE0FFE0' } // 浅绿色
            };
            break;
        }
      }
    });
    
    // 生成输出文件名
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/g, '');
    const salt = crypto.randomBytes(4).toString('hex');
    const fileName = `cdk_${batch.batchId}_${timestamp}_${salt}.xlsx`;
    
    // 文件路径
    const filePath = exportPath 
      ? path.resolve(exportPath, fileName)
      : path.join(exportDir, fileName);
    
    // 如果提供了密码，设置密码保护
    if (password) {
      workbook.properties.password = password;
    }
    
    // 写入文件
    await workbook.xlsx.writeFile(filePath);
    
    // 添加导出记录到批次审计
    if (adminId) {
      await CDKBatch.updateOne(
        { batchId },
        {
          $push: {
            auditTrail: {
              action: 'export_excel',
              performedBy: adminId,
              timestamp: new Date(),
              details: {
                fileName,
                includeUsed,
                includeExpired,
                includeRevoked,
                recordCount: cdks.length,
                isPasswordProtected: !!password
              }
            }
          }
        }
      );
    }
    
    // 设置定时删除文件
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info('临时导出文件已删除', { filePath });
        }
      } catch (error) {
        logger.error('删除临时导出文件失败', {
          error: error.message,
          filePath
        });
      }
    }, CLEANUP_INTERVAL);
    
    // 返回结果
    return {
      success: true,
      fileName,
      filePath,
      recordCount: cdks.length,
      batchId: batch.batchId,
      expiresIn: '24小时'
    };
  } catch (error) {
    logger.error('导出批次到Excel失败', {
      error: error.message,
      stack: error.stack,
      batchId
    });
    
    throw error;
  }
}

/**
 * 定期清理过期的导出文件
 */
function cleanupExportedFiles() {
  try {
    // 获取导出目录中的所有文件
    const files = fs.readdirSync(exportDir);
    const now = Date.now();
    
    // 检查每个文件
    for (const file of files) {
      if (file.startsWith('cdk_') && file.endsWith('.xlsx')) {
        const filePath = path.join(exportDir, file);
        const stats = fs.statSync(filePath);
        
        // 检查文件是否超过清理间隔
        if (now - stats.mtimeMs > CLEANUP_INTERVAL) {
          fs.unlinkSync(filePath);
          logger.info('已清理过期导出文件', { file });
        }
      }
    }
  } catch (error) {
    logger.error('清理过期导出文件失败', {
      error: error.message,
      stack: error.stack
    });
  }
}

// 定期执行清理，每6小时一次
setInterval(cleanupExportedFiles, 6 * 60 * 60 * 1000);

// 立即执行一次清理
cleanupExportedFiles();

module.exports = {
  exportBatchToExcel
}; 