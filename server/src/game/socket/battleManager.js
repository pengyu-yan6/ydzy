const WebSocket = require('ws');
const { verifyMessage, signMessage, logSecurityEvent } = require('../../security/middleware');
const { validateBattleAction } = require('../battle/algorithms');
const AntiCheatSystem = require('../../security/antiCheat');

/**
 * 战斗管理器 - 处理WebSocket连接和战斗消息
 */
class BattleManager {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.connections = new Map(); // playerId -> websocket
    this.battleSessions = new Map(); // sessionId -> [playerIds]
    
    this.setupWebSocketServer();
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      // 获取玩家ID和验证令牌
      const playerId = req.headers['x-player-id'];
      const token = req.headers['x-auth-token'];
      
      // 安全验证
      if (!this.verifyConnection(playerId, token, req)) {
        ws.close(1008, '连接验证失败');
        return;
      }
      
      // 保存连接
      this.connections.set(playerId, ws);
      
      // 设置消息处理
      ws.on('message', (data) => this.handleBattleMessage(playerId, data));
      ws.on('close', () => this.handleDisconnect(playerId));
      ws.on('error', (error) => this.handleError(playerId, error));
      
      // 发送连接成功消息
      ws.send(JSON.stringify(signMessage({ type: 'CONNECTED', playerId })));
    });
  }

  verifyConnection(playerId, token, req) {
    // 检查DDoS攻击
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!this.checkRateLimit(ip)) {
      logSecurityEvent('RATE_LIMIT_EXCEEDED', { ip, playerId });
      return false;
    }
    
    // 验证玩家身份
    try {
      // 这里应该调用认证服务验证token
      return true; // 简化示例，实际应该验证token
    } catch (error) {
      logSecurityEvent('AUTH_FAILED', { playerId, error: error.message });
      return false;
    }
  }

  checkRateLimit(ip) {
    // 简单的速率限制实现
    const now = Date.now();
    const key = `ratelimit:${ip}`;
    
    // 实际项目中应使用Redis等实现分布式速率限制
    return true; // 简化示例
  }

  async handleBattleMessage(playerId, rawData) {
    try {
      // 消息安全验证
      const { isValid, message } = verifyMessage(rawData);
      if (!isValid) {
        logSecurityEvent('INVALID_MESSAGE', { playerId });
        return;
      }
      
      // 防作弊检测
      if (AntiCheatSystem.detectAnomaly(playerId, message)) {
        this.connections.get(playerId).send(JSON.stringify(signMessage({
          type: 'ERROR',
          code: 'CHEAT_DETECTED',
          message: '检测到异常行为'
        })));
        logSecurityEvent('CHEAT_DETECTED', { playerId, action: message });
        return;
      }
      
      // 处理不同类型的战斗消息
      switch (message.type) {
        case 'JOIN_BATTLE':
          await this.handleJoinBattle(playerId, message);
          break;
        case 'BATTLE_ACTION':
          await this.handleBattleAction(playerId, message);
          break;
        case 'LEAVE_BATTLE':
          await this.handleLeaveBattle(playerId, message);
          break;
        default:
          this.connections.get(playerId).send(JSON.stringify(signMessage({
            type: 'ERROR',
            code: 'UNKNOWN_MESSAGE_TYPE',
            message: '未知消息类型'
          })));
      }
    } catch (error) {
      logSecurityEvent('BATTLE_ERROR', { playerId, error: error.message });
      
      // 发送错误消息给客户端
      const ws = this.connections.get(playerId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(signMessage({
          type: 'ERROR',
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误'
        })));
      }
    }
  }

  async handleJoinBattle(playerId, message) {
    const { battleId } = message;
    
    // 获取或创建战斗会话
    let sessionPlayers = this.battleSessions.get(battleId) || [];
    sessionPlayers.push(playerId);
    this.battleSessions.set(battleId, sessionPlayers);
    
    // 通知所有会话玩家
    this.broadcastToBattle(battleId, {
      type: 'PLAYER_JOINED',
      playerId,
      battleId,
      players: sessionPlayers
    });
  }

  async handleBattleAction(playerId, message) {
    const { battleId, action } = message;
    
    // 验证战斗动作
    const result = await validateBattleAction(playerId, battleId, action);
    if (!result.valid) {
      this.connections.get(playerId).send(JSON.stringify(signMessage({
        type: 'ACTION_REJECTED',
        reason: result.reason
      })));
      return;
    }
    
    // 广播动作结果
    this.broadcastToBattle(battleId, {
      type: 'ACTION_RESULT',
      playerId,
      action,
      result: result.data
    });
  }

  async handleLeaveBattle(playerId, message) {
    const { battleId } = message;
    
    // 从战斗会话中移除玩家
    const sessionPlayers = this.battleSessions.get(battleId) || [];
    const updatedPlayers = sessionPlayers.filter(id => id !== playerId);
    
    if (updatedPlayers.length === 0) {
      // 如果没有玩家了，删除会话
      this.battleSessions.delete(battleId);
    } else {
      this.battleSessions.set(battleId, updatedPlayers);
      
      // 通知其他玩家
      this.broadcastToBattle(battleId, {
        type: 'PLAYER_LEFT',
        playerId,
        battleId,
        players: updatedPlayers
      });
    }
  }

  handleDisconnect(playerId) {
    // 清理玩家连接
    this.connections.delete(playerId);
    
    // 从所有战斗会话中移除玩家
    for (const [battleId, players] of this.battleSessions.entries()) {
      if (players.includes(playerId)) {
        const updatedPlayers = players.filter(id => id !== playerId);
        
        if (updatedPlayers.length === 0) {
          this.battleSessions.delete(battleId);
        } else {
          this.battleSessions.set(battleId, updatedPlayers);
          
          // 通知其他玩家
          this.broadcastToBattle(battleId, {
            type: 'PLAYER_DISCONNECTED',
            playerId,
            battleId,
            players: updatedPlayers
          });
        }
      }
    }
  }

  handleError(playerId, error) {
    logSecurityEvent('WS_ERROR', { playerId, error: error.message });
    this.connections.delete(playerId);
  }

  broadcastToBattle(battleId, data) {
    const players = this.battleSessions.get(battleId) || [];
    const signedData = signMessage(data);
    const message = JSON.stringify(signedData);
    
    for (const playerId of players) {
      const ws = this.connections.get(playerId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}

module.exports = BattleManager; 