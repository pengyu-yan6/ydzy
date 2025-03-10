/**
 * WebSocket服务模块
 * 提供实时游戏通信功能
 */

const WebSocket = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../../utils/logger');
const config = require('../../config');
const { verifySignature } = require('../security/signature');
const battleManager = require('../battle/battleManager');
const securityManager = require('../security/securityManager');
const socketNonceStore = require('../security/socketNonceStore');
const rateLimiter = require('../security/rateLimiter');

// 活跃连接管理
const activeConnections = new Map();
// 房间管理
const battleRooms = new Map();
// 消息队列 - 用于限制消息处理速率
const messageQueue = [];
// 消息处理速率（毫秒）
const MESSAGE_THROTTLE = 50;

/**
 * 初始化WebSocket服务
 * @param {Object} server - HTTP服务器实例
 * @returns {Object} Socket.IO实例
 */
function initSocketServer(server) {
  const io = WebSocket(server, {
    cors: {
      origin: config.corsOrigins || "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 20000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
  });

  // 中间件 - 身份验证
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('认证失败 - 未提供令牌'));
      }
      
      try {
        // 验证Token
        const decoded = jwt.verify(token, config.security.jwtSecret, {
          algorithms: ['HS256'] // 明确指定算法，防止算法替换攻击
        });
        
        // 验证签名 (防止重放攻击)
        const signature = socket.handshake.auth.signature || socket.handshake.query.signature;
        const timestamp = socket.handshake.auth.timestamp || socket.handshake.query.timestamp;
        const nonce = socket.handshake.auth.nonce || socket.handshake.query.nonce;
        
        if (!signature || !timestamp || !nonce) {
          throw new Error('认证失败 - 签名参数缺失');
        }
        
        // 使用改进的签名验证方法
        const payload = {
          userId: decoded.userId,
          timestamp,
          nonce
        };
        
        // 使用通用安全层的签名验证
        const isValidSignature = await require('../../security').GameSecurity.createSignature(
          payload, 
          timestamp, 
          nonce, 
          config.security.battleSecretKey
        ) === signature;
        
        if (!isValidSignature) {
          logger.security('WebSocket非法签名尝试', {
            userId: decoded.userId,
            ip: socket.handshake.address
          });
          throw new Error('认证失败 - 签名无效');
        }
        
        // 检查timestamp是否在允许范围内（防止重放攻击）
        const currentTime = Math.floor(Date.now() / 1000);
        const timestampNum = parseInt(timestamp, 10);
        
        if (isNaN(timestampNum) || 
            timestampNum > currentTime || 
            currentTime - timestampNum > config.security.signatureTimeWindow) {
          logger.security('WebSocket时间戳无效', {
            userId: decoded.userId,
            ip: socket.handshake.address,
            timestamp
          });
          throw new Error('认证失败 - 时间戳无效');
        }
        
        // 检查nonce是否重复使用（防止重放攻击）
        if (await socketNonceStore.isNonceUsed(nonce)) {
          logger.security('WebSocket nonce重复使用', {
            userId: decoded.userId,
            ip: socket.handshake.address,
            nonce
          });
          throw new Error('认证失败 - nonce已使用');
        }
        
        // 记录nonce
        await socketNonceStore.markNonceAsUsed(nonce, timestampNum);
        
        // 保存用户信息到socket
        socket.user = {
          id: decoded.userId,
          role: decoded.role,
          username: decoded.username
        };
        
        // 检查用户是否已被封禁
        const isBanned = await securityManager.isUserBanned(decoded.userId);
        if (isBanned) {
          logger.security('已封禁用户尝试连接', {
            userId: decoded.userId,
            ip: socket.handshake.address
          });
          throw new Error('账号已被封禁');
        }
        
        // 记录连接信息
        logger.info('WebSocket用户已连接', {
          userId: decoded.userId,
          ip: socket.handshake.address,
          transport: socket.conn.transport.name
        });
        
        // 更新活跃连接，使用Map存储连接信息，便于管理
        if (activeConnections.has(decoded.userId)) {
          // 存储之前的连接对象
          const oldConnection = activeConnections.get(decoded.userId);
          
          // 如果策略是允许单一设备登录，则断开旧连接
          if (config.socketSingleDeviceLogin) {
            oldConnection.socket.emit('forced_disconnect', { 
              reason: '您的账号在其他设备登录' 
            });
            oldConnection.socket.disconnect(true);
          }
        }
        
        // 保存新连接
        activeConnections.set(decoded.userId, {
          socket,
          connectedAt: new Date(),
          deviceInfo: socket.handshake.headers['user-agent'],
          ip: socket.handshake.address
        });
        
        next();
      } catch (tokenError) {
        logger.warn('WebSocket认证失败', {
          error: tokenError.message,
          ip: socket.handshake.address
        });
        return next(new Error('认证失败 - ' + tokenError.message));
      }
    } catch (error) {
      logger.error('WebSocket连接错误', {
        error: error.message,
        ip: socket.handshake.address
      });
      return next(new Error('连接错误'));
    }
  });

  // 连接事件处理
  io.on('connection', (socket) => {
    const userId = socket.user.id;
    
    // 加入用户频道
    socket.join(`user:${userId}`);
    
    // 客户端请求加入战斗
    socket.on('join_battle', async (data) => {
      try {
        const { battleId } = data;
        
        // 防止频繁请求攻击
        const isRateLimited = securityManager.checkRateLimit(userId, 'join_battle');
        if (isRateLimited) {
          socket.emit('error', { message: '操作过于频繁，请稍后再试' });
          return;
        }
        
        // 验证用户是否有权限加入此战斗
        const canJoin = await battleManager.canJoinBattle(userId, battleId);
        if (!canJoin) {
          socket.emit('error', { message: '无权加入此战斗' });
          return;
        }
        
        // 加入战斗房间
        socket.join(`battle:${battleId}`);
        
        // 更新战斗状态
        await battleManager.playerJoinedBattle(battleId, userId);
        
        // 广播玩家加入消息
        io.to(`battle:${battleId}`).emit('player_joined', {
          userId,
          username: socket.user.username,
          timestamp: Date.now()
        });
        
        // 发送战斗初始状态
        const battleState = await battleManager.getBattleState(battleId);
        socket.emit('battle_state', battleState);
        
        logger.info('玩家加入战斗', { 
          userId, 
          battleId 
        });
      } catch (error) {
        logger.error('加入战斗失败', { 
          error: error.message, 
          userId, 
          battleId: data.battleId 
        });
        
        socket.emit('error', { message: '加入战斗失败: ' + error.message });
      }
    });
    
    // 处理战斗行动
    socket.on('battle_action', (data) => {
      // 使用消息队列进行节流控制
      messageQueue.push({
        type: 'battle_action',
        userId,
        socketId: socket.id,
        data,
        timestamp: Date.now()
      });
    });
    
    // 离开战斗
    socket.on('leave_battle', async (data) => {
      try {
        const { battleId } = data;
        
        // 离开战斗房间
        socket.leave(`battle:${battleId}`);
        
        // 更新战斗状态
        await battleManager.playerLeftBattle(battleId, userId);
        
        // 广播玩家离开消息
        io.to(`battle:${battleId}`).emit('player_left', {
          userId,
          username: socket.user.username,
          timestamp: Date.now()
        });
        
        logger.info('玩家离开战斗', { 
          userId, 
          battleId 
        });
      } catch (error) {
        logger.error('离开战斗失败', { 
          error: error.message, 
          userId, 
          battleId: data.battleId 
        });
      }
    });
    
    // 处理断开连接
    socket.on('disconnect', async () => {
      try {
        // 从活跃连接中移除
        if (activeConnections.get(userId) === socket) {
          activeConnections.delete(userId);
        }
        
        // 处理所有战斗相关清理
        const playerBattles = await battleManager.getActiveBattlesForPlayer(userId);
        for (const battleId of playerBattles) {
          await battleManager.playerLeftBattle(battleId, userId);
          
          // 广播玩家离开消息
          io.to(`battle:${battleId}`).emit('player_left', {
            userId,
            username: socket.user.username,
            timestamp: Date.now(),
            reason: 'disconnected'
          });
        }
        
        logger.info('WebSocket用户已断开连接', { 
          userId, 
          reason: socket.disconnectReason 
        });
      } catch (error) {
        logger.error('处理断开连接时出错', { 
          error: error.message, 
          userId 
        });
      }
    });
  });

  // 启动消息处理器
  startMessageProcessor(io);
  
  logger.info('WebSocket服务器已初始化');
  
  return io;
}

/**
 * 启动消息处理器 - 用于控制消息处理速率
 * @param {Object} io - Socket.IO实例
 */
function startMessageProcessor(io) {
  setInterval(() => {
    if (messageQueue.length === 0) return;
    
    // 处理队列中的第一条消息
    const message = messageQueue.shift();
    
    // 忽略过时的消息 (超过5秒)
    if (Date.now() - message.timestamp > 5000) {
      return;
    }
    
    try {
      // 根据消息类型处理
      switch (message.type) {
        case 'battle_action':
          processBattleAction(io, message);
          break;
        default:
          logger.warn('未知的消息类型', { type: message.type });
      }
    } catch (error) {
      logger.error('处理消息时出错', { 
        error: error.message, 
        messageType: message.type 
      });
    }
  }, MESSAGE_THROTTLE);
}

/**
 * 处理战斗动作
 * @param {Object} io - Socket.IO实例
 * @param {Object} message - 消息对象
 */
async function processBattleAction(io, message) {
  const { userId, data, socketId } = message;
  
  try {
    // 增加防篡改验证 - 校验消息签名
    if (!data || !data.signature || !data.timestamp || !data.nonce) {
      logger.warn('战斗操作缺少签名信息', {
        userId,
        socketId
      });
      
      io.to(socketId).emit('action_rejected', {
        reason: 'missing_signature'
      });
      return;
    }
    
    // 验证消息签名
    const { battleId, actionType, actionData, signature, timestamp, nonce } = data;
    
    // 检查时间戳是否在允许范围内（防止重放攻击）
    const currentTime = Math.floor(Date.now() / 1000);
    const timestampNum = parseInt(timestamp, 10);
    
    if (isNaN(timestampNum) || 
        timestampNum > currentTime || 
        currentTime - timestampNum > config.security.actionSignatureTimeWindow) {
      
      logger.security('战斗操作时间戳无效', {
        userId,
        battleId,
        timestamp,
        currentTime
      });
      
      io.to(socketId).emit('action_rejected', {
        actionType,
        reason: 'invalid_timestamp'
      });
      return;
    }
    
    // 检查nonce是否重复使用（防止重放攻击）
    const actionNonceKey = `battle:${battleId}:${nonce}`;
    if (await socketNonceStore.isNonceUsed(actionNonceKey)) {
      logger.security('战斗操作nonce重复使用', {
        userId,
        battleId,
        nonce
      });
      
      io.to(socketId).emit('action_rejected', {
        actionType,
        reason: 'nonce_reused'
      });
      return;
    }
    
    // 准备签名验证payload
    const signaturePayload = {
      userId,
      battleId,
      actionType,
      actionData,
      timestamp,
      nonce
    };
    
    // 计算预期签名
    const expectedSignature = await require('../../security').GameSecurity.createSignature(
      signaturePayload, 
      timestamp, 
      nonce, 
      config.security.battleSecretKey
    );
    
    // 验证签名
    if (signature !== expectedSignature) {
      // 记录可疑活动
      securityManager.detectSuspiciousActivity(
        userId, 
        'invalid_battle_signature', 
        { battleId, actionType }
      );
      
      logger.security('战斗操作签名无效', {
        userId,
        battleId,
        actionType
      });
      
      io.to(socketId).emit('action_rejected', {
        actionType,
        reason: 'invalid_signature'
      });
      return;
    }
    
    // 记录nonce为已使用
    await socketNonceStore.markNonceAsUsed(actionNonceKey, timestampNum);
    
    // 是否具有执行该操作的权限（是否在战斗中）
    const hasPermission = await battleManager.checkUserInBattle(battleId, userId);
    if (!hasPermission) {
      logger.warn('用户尝试在不属于自己的战斗中执行操作', {
        userId,
        battleId,
        actionType
      });
      
      io.to(socketId).emit('action_rejected', {
        actionType,
        reason: 'not_in_battle'
      });
      return;
    }
    
    // 验证操作速率（防止操作频率过高）
    const isRateLimited = await rateLimiter.isActionRateLimited(userId, actionType);
    if (isRateLimited) {
      logger.warn('用户操作频率超限', {
        userId,
        battleId,
        actionType
      });
      
      io.to(socketId).emit('action_rejected', {
        actionType,
        reason: 'rate_limited'
      });
      return;
    }
  
    // 验证动作是否合法
    const validationResult = await battleManager.validateAction(
      battleId, 
      userId, 
      actionType, 
      actionData
    );
    
    if (!validationResult.valid) {
      // 非法操作检测
      const isSuspicious = securityManager.detectSuspiciousActivity(
        userId, 
        'invalid_battle_action', 
        { 
          battleId, 
          actionType, 
          reason: validationResult.reason
        }
      );
      
      if (isSuspicious) {
        logger.security('检测到可疑战斗操作', {
          userId,
          battleId,
          actionType,
          reason: validationResult.reason
        });
      }
      
      // 通知客户端操作无效
      io.to(socketId).emit('action_rejected', {
        actionType,
        reason: validationResult.reason
      });
      
      return;
    }
    
    // 执行动作
    const actionResult = await battleManager.executeAction(
      battleId, 
      userId, 
      actionType, 
      actionData
    );
    
    // 广播动作结果给所有战斗参与者
    io.to(`battle:${battleId}`).emit('battle_update', {
      battleId,
      actionType,
      actionBy: userId,
      result: actionResult,
      timestamp: Date.now()
    });
    
    // 检查战斗是否结束
    if (actionResult.battleEnded) {
      // 广播战斗结束通知
      io.to(`battle:${battleId}`).emit('battle_ended', {
        battleId,
        winner: actionResult.winner,
        rewards: actionResult.rewards,
        statistics: actionResult.statistics,
        timestamp: Date.now()
      });
      
      // 清理战斗资源
      await battleManager.cleanupBattle(battleId);
    }
  } catch (error) {
    logger.error('处理战斗动作出错', { 
      error: error.message, 
      userId, 
      battleId, 
      actionType 
    });
    
    // 通知客户端发生错误
    io.to(socketId).emit('error', { 
      message: '执行动作时发生错误',
      actionType
    });
  }
}

/**
 * 向特定用户发送消息
 * @param {string} userId - 用户ID
 * @param {string} event - 事件名称
 * @param {Object} data - 事件数据
 * @returns {boolean} 发送是否成功
 */
function sendToUser(userId, event, data) {
  try {
    const socket = activeConnections.get(userId);
    
    if (!socket || !socket.connected) {
      return false;
    }
    
    socket.emit(event, data);
    return true;
  } catch (error) {
    logger.error('向用户发送消息失败', {
      error: error.message,
      userId,
      event
    });
    return false;
  }
}

/**
 * 广播系统通知
 * @param {string} event - 事件名称
 * @param {Object} data - 事件数据
 * @param {string[]} userIds - 特定用户ID列表，如果为空则广播给所有用户
 */
function broadcastNotification(event, data, userIds = []) {
  try {
    if (userIds.length === 0) {
      // 广播给所有连接的用户
      global.io.emit(event, data);
    } else {
      // 广播给指定用户
      for (const userId of userIds) {
        sendToUser(userId, event, data);
      }
    }
  } catch (error) {
    logger.error('广播系统通知失败', {
      error: error.message,
      event,
      userCount: userIds.length || 'all'
    });
  }
}

module.exports = {
  initSocketServer,
  sendToUser,
  broadcastNotification,
  activeConnections
}; 