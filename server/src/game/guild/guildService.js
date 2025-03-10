const mongoose = require('mongoose');
const Guild = require('../../models/guild.model');
const User = require('../../models/user.model');
const { createNotification } = require('../../utils/notification');
const logger = require('../../utils/logger');

/**
 * 公会管理系统 - 处理公会相关的所有业务逻辑
 */
class GuildService {
  /**
   * 创建新公会
   * @param {Object} guildData - 公会基础信息
   * @param {String} userId - 创建者ID
   * @returns {Object} - 创建的公会信息
   */
  async createGuild(guildData, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // 检查用户是否已经在公会中
      const userInfo = await User.findById(userId);
      if (userInfo.guildId) {
        throw new Error('用户已经加入公会，无法创建新公会');
      }
      
      // 检查公会名称是否已存在
      const existingGuild = await Guild.findOne({ name: guildData.name });
      if (existingGuild) {
        throw new Error('公会名称已存在');
      }
      
      // 创建公会
      const guild = new Guild({
        name: guildData.name,
        description: guildData.description,
        emblem: guildData.emblem,
        leader: userId,
        officers: [],
        members: [userId],
        level: 1,
        experience: 0,
        funds: 0,
        createdAt: new Date(),
        announcements: [],
        applications: []
      });
      
      await guild.save({ session });
      
      // 更新用户的公会信息
      await User.findByIdAndUpdate(userId, {
        guildId: guild._id,
        guildRole: 'leader'
      }, { session });
      
      await session.commitTransaction();
      
      logger.info(`公会创建成功: ${guild.name}, 创建者: ${userId}`);
      return guild;
    } catch (error) {
      await session.abortTransaction();
      logger.error(`公会创建失败: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * 申请加入公会
   * @param {String} guildId - 公会ID
   * @param {String} userId - 申请者ID
   * @param {String} message - 申请消息
   */
  async applyToGuild(guildId, userId, message) {
    const user = await User.findById(userId);
    if (user.guildId) {
      throw new Error('您已经加入了公会，请先退出当前公会');
    }
    
    const guild = await Guild.findById(guildId);
    if (!guild) {
      throw new Error('公会不存在');
    }
    
    // 检查是否已经申请过
    const existingApplication = guild.applications.find(
      app => app.userId.toString() === userId
    );
    
    if (existingApplication) {
      throw new Error('您已经申请过该公会，请等待审核');
    }
    
    await Guild.findByIdAndUpdate(guildId, {
      $push: {
        applications: {
          userId,
          message,
          appliedAt: new Date()
        }
      }
    });
    
    // 通知公会管理员
    await createNotification({
      type: 'guild_application',
      targetUsers: [guild.leader, ...guild.officers],
      content: `玩家 ${user.username} 申请加入公会`,
      metadata: { guildId, userId }
    });
    
    logger.info(`用户 ${userId} 申请加入公会 ${guildId}`);
  }
  
  /**
   * 处理公会申请
   * @param {String} guildId - 公会ID
   * @param {String} applicantId - 申请者ID
   * @param {Boolean} approved - 是否批准
   * @param {String} operatorId - 处理人ID
   */
  async handleApplication(guildId, applicantId, approved, operatorId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const guild = await Guild.findById(guildId);
      if (!guild) {
        throw new Error('公会不存在');
      }
      
      // 验证操作者权限
      const isLeaderOrOfficer = 
        guild.leader.toString() === operatorId || 
        guild.officers.some(id => id.toString() === operatorId);
      
      if (!isLeaderOrOfficer) {
        throw new Error('您没有权限处理公会申请');
      }
      
      // 查找申请
      const applicationIndex = guild.applications.findIndex(
        app => app.userId.toString() === applicantId
      );
      
      if (applicationIndex === -1) {
        throw new Error('未找到该申请');
      }
      
      // 移除申请
      guild.applications.splice(applicationIndex, 1);
      await guild.save({ session });
      
      if (approved) {
        // 检查用户是否已加入其他公会
        const user = await User.findById(applicantId);
        if (user.guildId) {
          throw new Error('该用户已加入其他公会');
        }
        
        // 将用户添加到公会
        await Guild.findByIdAndUpdate(guildId, {
          $push: { members: applicantId }
        }, { session });
        
        // 更新用户的公会信息
        await User.findByIdAndUpdate(applicantId, {
          guildId: guildId,
          guildRole: 'member'
        }, { session });
        
        // 通知申请者
        await createNotification({
          type: 'guild_application_approved',
          targetUsers: [applicantId],
          content: `您已成功加入公会 ${guild.name}`,
          metadata: { guildId }
        });
      } else {
        // 通知申请者
        await createNotification({
          type: 'guild_application_rejected',
          targetUsers: [applicantId],
          content: `您加入公会 ${guild.name} 的申请已被拒绝`,
          metadata: { guildId }
        });
      }
      
      await session.commitTransaction();
      logger.info(`公会申请处理完成: ${approved ? '接受' : '拒绝'}, 公会: ${guildId}, 申请者: ${applicantId}`);
    } catch (error) {
      await session.abortTransaction();
      logger.error(`处理公会申请失败: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * 离开公会
   * @param {String} userId - 用户ID
   */
  async leaveGuild(userId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const user = await User.findById(userId);
      if (!user.guildId) {
        throw new Error('您不在任何公会中');
      }
      
      const guild = await Guild.findById(user.guildId);
      if (!guild) {
        // 异常情况：用户有公会ID但公会不存在，清理用户数据
        await User.findByIdAndUpdate(userId, {
          $unset: { guildId: "", guildRole: "" }
        }, { session });
        await session.commitTransaction();
        return;
      }
      
      // 公会会长不能直接离开
      if (guild.leader.toString() === userId) {
        throw new Error('公会会长不能直接离开公会，请先转让会长职位或解散公会');
      }
      
      // 从公会成员和官员列表中移除
      await Guild.findByIdAndUpdate(user.guildId, {
        $pull: { members: userId, officers: userId }
      }, { session });
      
      // 清除用户的公会信息
      await User.findByIdAndUpdate(userId, {
        $unset: { guildId: "", guildRole: "" }
      }, { session });
      
      await session.commitTransaction();
      logger.info(`用户 ${userId} 离开公会 ${user.guildId}`);
    } catch (error) {
      await session.abortTransaction();
      logger.error(`离开公会失败: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * 提升会员为公会干部
   * @param {String} guildId - 公会ID
   * @param {String} memberId - 成员ID
   * @param {String} operatorId - 操作者ID
   */
  async promoteMember(guildId, memberId, operatorId) {
    const guild = await Guild.findById(guildId);
    if (!guild) {
      throw new Error('公会不存在');
    }
    
    // 验证操作者是否为会长
    if (guild.leader.toString() !== operatorId) {
      throw new Error('只有公会会长才能提升成员为干部');
    }
    
    // 验证成员是否在公会中
    if (!guild.members.some(id => id.toString() === memberId)) {
      throw new Error('该成员不在公会中');
    }
    
    // 验证成员是否已经是干部
    if (guild.officers.some(id => id.toString() === memberId)) {
      throw new Error('该成员已经是公会干部');
    }
    
    // 提升为干部
    await Guild.findByIdAndUpdate(guildId, {
      $push: { officers: memberId }
    });
    
    // 更新用户角色
    await User.findByIdAndUpdate(memberId, {
      guildRole: 'officer'
    });
    
    // 通知成员
    await createNotification({
      type: 'guild_promoted',
      targetUsers: [memberId],
      content: `您在公会 ${guild.name} 中被提升为干部`,
      metadata: { guildId }
    });
    
    logger.info(`用户 ${memberId} 被提升为公会 ${guildId} 的干部`);
  }
  
  /**
   * 公会会长转让
   * @param {String} guildId - 公会ID
   * @param {String} newLeaderId - 新会长ID
   * @param {String} currentLeaderId - 当前会长ID
   */
  async transferLeadership(guildId, newLeaderId, currentLeaderId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const guild = await Guild.findById(guildId);
      
      // 验证操作者是否为会长
      if (guild.leader.toString() !== currentLeaderId) {
        throw new Error('只有公会会长才能转让会长职位');
      }
      
      // 验证新会长是否在公会中
      if (!guild.members.some(id => id.toString() === newLeaderId)) {
        throw new Error('新会长不在公会中');
      }
      
      // 更新公会信息
      guild.leader = newLeaderId;
      
      // 如果新会长是干部，从干部列表移除
      const officerIndex = guild.officers.findIndex(
        id => id.toString() === newLeaderId
      );
      
      if (officerIndex !== -1) {
        guild.officers.splice(officerIndex, 1);
      }
      
      // 将前任会长添加为干部
      guild.officers.push(currentLeaderId);
      
      await guild.save({ session });
      
      // 更新新旧会长的角色
      await User.findByIdAndUpdate(newLeaderId, {
        guildRole: 'leader'
      }, { session });
      
      await User.findByIdAndUpdate(currentLeaderId, {
        guildRole: 'officer'
      }, { session });
      
      // 通知新会长
      await createNotification({
        type: 'guild_leadership_received',
        targetUsers: [newLeaderId],
        content: `您已成为公会 ${guild.name} 的新会长`,
        metadata: { guildId }
      });
      
      // 通知所有公会成员
      await createNotification({
        type: 'guild_leadership_changed',
        targetUsers: guild.members.filter(id => id.toString() !== newLeaderId),
        content: `公会 ${guild.name} 的会长已更换`,
        metadata: { guildId, newLeaderId }
      });
      
      await session.commitTransaction();
      logger.info(`公会 ${guildId} 会长从 ${currentLeaderId} 转让给 ${newLeaderId}`);
    } catch (error) {
      await session.abortTransaction();
      logger.error(`会长转让失败: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * 解散公会
   * @param {String} guildId - 公会ID
   * @param {String} leaderId - 会长ID
   */
  async disbandGuild(guildId, leaderId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const guild = await Guild.findById(guildId);
      
      // 验证操作者是否为会长
      if (guild.leader.toString() !== leaderId) {
        throw new Error('只有公会会长才能解散公会');
      }
      
      // 保存所有成员ID，用于后续通知和数据更新
      const allMembers = [...guild.members];
      
      // 删除公会
      await Guild.findByIdAndDelete(guildId, { session });
      
      // 更新所有成员的公会信息
      await User.updateMany(
        { _id: { $in: allMembers } },
        { $unset: { guildId: "", guildRole: "" } },
        { session }
      );
      
      // 通知所有成员
      await createNotification({
        type: 'guild_disbanded',
        targetUsers: allMembers,
        content: `公会 ${guild.name} 已被解散`,
        metadata: { guildName: guild.name }
      });
      
      await session.commitTransaction();
      logger.info(`公会 ${guildId} 已被会长 ${leaderId} 解散`);
    } catch (error) {
      await session.abortTransaction();
      logger.error(`解散公会失败: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * 发布公会公告
   * @param {String} guildId - 公会ID
   * @param {String} announcement - 公告内容
   * @param {String} operatorId - 发布者ID
   */
  async postAnnouncement(guildId, announcement, operatorId) {
    const guild = await Guild.findById(guildId);
    
    // 验证操作者权限
    const isLeaderOrOfficer = 
      guild.leader.toString() === operatorId || 
      guild.officers.some(id => id.toString() === operatorId);
    
    if (!isLeaderOrOfficer) {
      throw new Error('只有公会会长和干部才能发布公告');
    }
    
    // 添加公告
    await Guild.findByIdAndUpdate(guildId, {
      $push: {
        announcements: {
          content: announcement,
          postedBy: operatorId,
          postedAt: new Date()
        }
      }
    });
    
    // 通知所有成员
    await createNotification({
      type: 'guild_announcement',
      targetUsers: guild.members,
      content: `公会 ${guild.name} 有新公告`,
      metadata: { guildId, announcementId: guild.announcements.length }
    });
    
    logger.info(`公会 ${guildId} 发布了新公告`);
  }
  
  /**
   * 获取公会详情
   * @param {String} guildId - 公会ID
   * @returns {Object} - 公会详细信息
   */
  async getGuildDetails(guildId) {
    const guild = await Guild.findById(guildId)
      .populate('leader', 'username avatar level')
      .populate('officers', 'username avatar level')
      .populate('members', 'username avatar level lastActive');
      
    if (!guild) {
      throw new Error('公会不存在');
    }
    
    return guild;
  }
  
  /**
   * 获取公会列表
   * @param {Object} filter - 筛选条件
   * @param {Number} page - 页码
   * @param {Number} limit - 每页数量
   * @returns {Array} - 公会列表
   */
  async listGuilds(filter = {}, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    const query = {};
    if (filter.name) {
      query.name = { $regex: filter.name, $options: 'i' };
    }
    
    if (filter.minLevel) {
      query.level = { $gte: filter.minLevel };
    }
    
    const guilds = await Guild.find(query)
      .select('name emblem level memberCount description')
      .skip(skip)
      .limit(limit)
      .lean();
      
    const total = await Guild.countDocuments(query);
    
    return {
      guilds,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = new GuildService(); 