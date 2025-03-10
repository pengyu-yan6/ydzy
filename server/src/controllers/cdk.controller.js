/**
 * CDK控制器
 * 处理CDK的创建、兑换和管理功能
 */

const CDK = require('../models/cdk.model');
const User = require('../models/user.model');
const config = require('../config');
const mongoose = require('mongoose');

/**
 * 兑换CDK码
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.redeemCDK = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user._id;
    
    // 验证必填字段
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'CDK码不能为空'
      });
    }
    
    // 格式化CDK码（删除连字符和空格，转为大写）
    const formattedCode = code.replace(/[-\s]/g, '').toUpperCase();
    
    // 查找CDK记录
    const cdk = await CDK.findOne({ code: formattedCode });
    
    // 检查CDK是否存在
    if (!cdk) {
      return res.status(404).json({
        success: false,
        message: '无效的CDK码'
      });
    }
    
    // 检查CDK是否有效
    if (!cdk.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'CDK码已过期或已被使用'
      });
    }
    
    // 检查用户是否已使用过此CDK（如果CDK是一次性的）
    if (cdk.usageLimit === 1 && cdk.isUsedByUser(userId)) {
      return res.status(400).json({
        success: false,
        message: '您已经使用过此CDK码'
      });
    }
    
    // 查找用户
    const user = await User.findById(userId);
    
    // 开始数据库事务
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // 记录CDK使用
      await cdk.useByUser(userId, req.ip);
      
      // 给用户添加奖励
      const rewards = cdk.rewards;
      
      // 添加金币奖励
      if (rewards.gold > 0) {
        user.gameProfile.gold += rewards.gold;
      }
      
      // 添加钻石奖励
      if (rewards.diamond > 0) {
        user.gameProfile.diamond += rewards.diamond;
      }
      
      // 添加物品奖励
      if (rewards.items && rewards.items.length > 0) {
        for (const item of rewards.items) {
          // 将物品ID添加到用户物品列表中
          user.gameProfile.items.push(item.itemId);
        }
      }
      
      // 添加英雄奖励
      if (rewards.heroes && rewards.heroes.length > 0) {
        for (const hero of rewards.heroes) {
          // 检查用户是否已拥有该英雄
          const hasHero = user.gameProfile.heroes.some(
            userHero => userHero.toString() === hero.heroId.toString()
          );
          
          // 如果没有，则添加
          if (!hasHero) {
            user.gameProfile.heroes.push(hero.heroId);
          }
        }
      }
      
      // 添加VIP奖励
      if (rewards.vip && rewards.vip.level > 0 && rewards.vip.days > 0) {
        // 更新VIP等级（取最高等级）
        user.paymentInfo.vipLevel = Math.max(user.paymentInfo.vipLevel, rewards.vip.level);
        
        // 更新VIP过期时间
        const now = new Date();
        const vipExpiry = user.paymentInfo.vipExpiry || now;
        
        // 如果VIP已过期，从现在开始计算
        const startDate = vipExpiry > now ? vipExpiry : now;
        
        // 添加天数
        user.paymentInfo.vipExpiry = new Date(startDate.getTime() + rewards.vip.days * 24 * 60 * 60 * 1000);
      }
      
      // 保存用户数据
      await user.save({ session });
      
      // 提交事务
      await session.commitTransaction();
      
      // 返回兑换结果和奖励信息
      res.status(200).json({
        success: true,
        message: 'CDK兑换成功',
        rewards: {
          gold: rewards.gold || 0,
          diamond: rewards.diamond || 0,
          items: rewards.items ? rewards.items.length : 0,
          heroes: rewards.heroes ? rewards.heroes.length : 0,
          vip: rewards.vip ? {
            level: rewards.vip.level,
            days: rewards.vip.days
          } : null
        }
      });
    } catch (error) {
      // 回滚事务
      await session.abortTransaction();
      throw error;
    } finally {
      // 结束会话
      session.endSession();
    }
  } catch (error) {
    console.error('CDK兑换错误:', error);
    res.status(500).json({
      success: false,
      message: '兑换CDK失败，请稍后再试',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 创建新的CDK码（仅管理员可用）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.createCDK = async (req, res) => {
  try {
    const {
      type,
      description,
      rewards,
      usageLimit,
      validUntil,
      quantity = 1 // 默认创建1个CDK
    } = req.body;
    
    // 验证必填字段
    if (!type || !description || !rewards) {
      return res.status(400).json({
        success: false,
        message: 'CDK类型、描述和奖励内容为必填项'
      });
    }
    
    // 验证CDK类型是否有效
    if (!Object.values(config.cdk.types).includes(type)) {
      return res.status(400).json({
        success: false,
        message: '无效的CDK类型'
      });
    }
    
    // 验证奖励内容
    if (!rewards.gold && !rewards.diamond && 
        (!rewards.items || rewards.items.length === 0) && 
        (!rewards.heroes || rewards.heroes.length === 0) && 
        (!rewards.vip || rewards.vip.level <= 0 || rewards.vip.days <= 0)) {
      return res.status(400).json({
        success: false,
        message: '奖励内容不能为空'
      });
    }
    
    // 创建指定数量的CDK
    const createdCDKs = [];
    for (let i = 0; i < quantity; i++) {
      // 生成唯一CDK码
      let isUnique = false;
      let code;
      
      while (!isUnique) {
        code = CDK.generateCode();
        // 检查生成的码是否已存在
        const existingCDK = await CDK.findOne({ code });
        isUnique = !existingCDK;
      }
      
      // 创建新CDK记录
      const newCDK = new CDK({
        code,
        type,
        description,
        rewards,
        usageLimit: usageLimit || 1,
        validUntil: validUntil ? new Date(validUntil) : undefined,
        createdBy: req.user._id
      });
      
      // 保存CDK记录
      await newCDK.save();
      createdCDKs.push({
        code: newCDK.code,
        type: newCDK.type,
        description: newCDK.description
      });
    }
    
    // 返回成功响应
    res.status(201).json({
      success: true,
      message: `成功创建 ${quantity} 个CDK码`,
      cdks: createdCDKs
    });
  } catch (error) {
    console.error('创建CDK错误:', error);
    res.status(500).json({
      success: false,
      message: '创建CDK失败，请稍后再试',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取CDK列表（仅管理员可用）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.getCDKs = async (req, res) => {
  try {
    // 分页参数
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // 筛选参数
    const filters = {};
    
    // 按类型筛选
    if (req.query.type) {
      filters.type = req.query.type;
    }
    
    // 按状态筛选
    if (req.query.active) {
      filters.isActive = req.query.active === 'true';
    }
    
    // 按创建者筛选
    if (req.query.createdBy) {
      filters.createdBy = req.query.createdBy;
    }
    
    // 查询总数
    const total = await CDK.countDocuments(filters);
    
    // 查询数据
    const cdks = await CDK.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'username nickname')
      .populate('usageHistory.userId', 'username nickname');
    
    // 返回响应
    res.status(200).json({
      success: true,
      count: cdks.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: cdks
    });
  } catch (error) {
    console.error('获取CDK列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取CDK列表失败，请稍后再试',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 获取CDK详情（仅管理员可用）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.getCDKById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 查找CDK
    const cdk = await CDK.findById(id)
      .populate('createdBy', 'username nickname')
      .populate('usageHistory.userId', 'username nickname');
    
    // 检查CDK是否存在
    if (!cdk) {
      return res.status(404).json({
        success: false,
        message: 'CDK不存在'
      });
    }
    
    // 返回响应
    res.status(200).json({
      success: true,
      data: cdk
    });
  } catch (error) {
    console.error('获取CDK详情错误:', error);
    res.status(500).json({
      success: false,
      message: '获取CDK详情失败，请稍后再试',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 更新CDK状态（仅管理员可用）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.updateCDKStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    // 验证必填字段
    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: '状态值为必填项'
      });
    }
    
    // 查找并更新CDK
    const cdk = await CDK.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );
    
    // 检查CDK是否存在
    if (!cdk) {
      return res.status(404).json({
        success: false,
        message: 'CDK不存在'
      });
    }
    
    // 返回响应
    res.status(200).json({
      success: true,
      message: `CDK状态已${isActive ? '启用' : '禁用'}`,
      data: cdk
    });
  } catch (error) {
    console.error('更新CDK状态错误:', error);
    res.status(500).json({
      success: false,
      message: '更新CDK状态失败，请稍后再试',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * 删除CDK（仅管理员可用）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
exports.deleteCDK = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 查找CDK
    const cdk = await CDK.findById(id);
    
    // 检查CDK是否存在
    if (!cdk) {
      return res.status(404).json({
        success: false,
        message: 'CDK不存在'
      });
    }
    
    // 检查CDK是否已被使用
    if (cdk.usedCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'CDK已被使用，无法删除'
      });
    }
    
    // 删除CDK
    await CDK.findByIdAndDelete(id);
    
    // 返回响应
    res.status(200).json({
      success: true,
      message: 'CDK已成功删除'
    });
  } catch (error) {
    console.error('删除CDK错误:', error);
    res.status(500).json({
      success: false,
      message: '删除CDK失败，请稍后再试',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}; 