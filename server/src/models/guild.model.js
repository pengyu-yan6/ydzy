const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * 公会公告 Schema
 */
const announcementSchema = new Schema({
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  postedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  postedAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * 公会申请 Schema
 */
const applicationSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    trim: true,
    maxlength: 500
  },
  appliedAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * 公会 Schema
 */
const guildSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 20
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },
  emblem: {
    type: String,
    default: 'default_guild_emblem.png'
  },
  leader: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  officers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  level: {
    type: Number,
    default: 1,
    min: 1,
    max: 100
  },
  experience: {
    type: Number,
    default: 0,
    min: 0
  },
  funds: {
    type: Number,
    default: 0,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  announcements: [announcementSchema],
  applications: [applicationSchema],
  settings: {
    joinRequiresApproval: {
      type: Boolean,
      default: true
    },
    minLevelToJoin: {
      type: Number,
      default: 1,
      min: 1
    },
    memberLimit: {
      type: Number,
      default: 50,
      min: 10,
      max: 100
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段：成员数量
guildSchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// 虚拟字段：下一级所需经验
guildSchema.virtual('nextLevelExperience').get(function() {
  // 自定义公式计算下一级所需的总经验
  return Math.floor(1000 * Math.pow(1.5, this.level - 1));
});

// 方法：增加公会经验
guildSchema.methods.addExperience = async function(experienceAmount) {
  this.experience += experienceAmount;
  
  let levelsGained = 0;
  let nextLevelExp = this.nextLevelExperience;
  
  // 检查是否可以升级
  while (this.experience >= nextLevelExp && this.level < 100) {
    this.level += 1;
    levelsGained += 1;
    this.experience -= nextLevelExp;
    nextLevelExp = Math.floor(1000 * Math.pow(1.5, this.level - 1));
  }
  
  await this.save();
  return levelsGained;
};

// 方法：检查成员是否为干部或会长
guildSchema.methods.isOfficerOrLeader = function(userId) {
  const userIdStr = userId.toString();
  return this.leader.toString() === userIdStr || 
         this.officers.some(id => id.toString() === userIdStr);
};

// 索引
guildSchema.index({ name: 1 }, { unique: true });
guildSchema.index({ level: -1 });
guildSchema.index({ createdAt: -1 });

const Guild = mongoose.model('Guild', guildSchema);

module.exports = Guild; 