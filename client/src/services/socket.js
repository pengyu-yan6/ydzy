/**
 * WebSocket服务
 * 用于实时游戏通信
 */

import { getToken } from '../utils/auth';
import { signWebSocketMessage, generateNonce } from '../utils/security/signature';
import EventEmitter from 'events';

class GameSocket extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 基础配置
    this.baseUrl = options.baseUrl || 'wss://api.yourgame.com/game';
    this.autoReconnect = options.autoReconnect !== false;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.pingInterval = options.pingInterval || 30000;
    
    // 状态变量
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.reconnectAttempts = 0;
    this.pingTimer = null;
    this.messageQueue = [];
    this.pendingResponses = new Map();
    this.lastMessageId = 0;
    
    // 绑定方法
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.send = this.send.bind(this);
    this._handleOpen = this._handleOpen.bind(this);
    this._handleMessage = this._handleMessage.bind(this);
    this._handleError = this._handleError.bind(this);
    this._handleClose = this._handleClose.bind(this);
    this._ping = this._ping.bind(this);
    this._reconnect = this._reconnect.bind(this);
    this._processQueue = this._processQueue.bind(this);
    
    // 自动连接
    if (options.autoConnect !== false) {
      this.connect();
    }
  }
  
  /**
   * 连接到WebSocket服务器
   * @returns {Promise<void>} 连接完成的Promise
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }
      
      if (this.connecting) {
        this.once('connected', resolve);
        this.once('connect_error', reject);
        return;
      }
      
      this.connecting = true;
      
      // 获取认证Token
      const token = getToken();
      if (!token) {
        const error = new Error('未授权：缺少认证Token');
        this.emit('error', error);
        this.connecting = false;
        reject(error);
        return;
      }
      
      // 构建连接URL
      const nonce = generateNonce();
      const timestamp = Date.now();
      const url = `${this.baseUrl}?token=${token}&nonce=${nonce}&timestamp=${timestamp}`;
      
      try {
        this.socket = new WebSocket(url);
        
        this.socket.onopen = (event) => {
          this._handleOpen(event);
          resolve();
        };
        
        this.socket.onmessage = this._handleMessage;
        this.socket.onerror = (error) => {
          this._handleError(error);
          reject(error);
        };
        
        this.socket.onclose = this._handleClose;
      } catch (error) {
        this.connecting = false;
        this.emit('error', error);
        reject(error);
      }
    });
  }
  
  /**
   * 断开WebSocket连接
   * @param {number} [code=1000] - 关闭代码
   * @param {string} [reason=''] - 关闭原因
   */
  disconnect(code = 1000, reason = '') {
    if (this.socket) {
      // 清理定时器
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      
      // 标记为不自动重连
      this.autoReconnect = false;
      
      // 关闭连接
      try {
        this.socket.close(code, reason);
      } catch (error) {
        console.error('关闭WebSocket连接失败', error);
      }
      
      this.socket = null;
      this.connected = false;
      this.connecting = false;
    }
  }
  
  /**
   * 发送消息到服务器
   * @param {string} type - 消息类型
   * @param {Object} data - 消息数据
   * @param {Object} [options] - 发送选项
   * @param {boolean} [options.queue=true] - 是否在断开连接时加入队列
   * @param {boolean} [options.requireResponse=false] - 是否需要等待响应
   * @param {number} [options.timeout=10000] - 等待响应超时时间(ms)
   * @returns {Promise<any>} 如果requireResponse为true，返回响应数据
   */
  send(type, data = {}, options = {}) {
    const { queue = true, requireResponse = false, timeout = 10000 } = options;
    
    // 生成消息ID
    const messageId = ++this.lastMessageId;
    
    // 构建消息对象
    const message = {
      id: messageId,
      type,
      data
    };
    
    // 添加签名
    const signedMessage = signWebSocketMessage(message);
    
    // 如果需要响应，创建Promise
    let responsePromise = null;
    if (requireResponse) {
      responsePromise = new Promise((resolve, reject) => {
        // 设置超时
        const timeoutId = setTimeout(() => {
          this.pendingResponses.delete(messageId);
          reject(new Error(`WebSocket请求 ${type} 超时`));
        }, timeout);
        
        // 存储响应处理函数
        this.pendingResponses.set(messageId, {
          resolve,
          reject,
          timeoutId
        });
      });
    }
    
    // 如果已连接，直接发送
    if (this.connected) {
      try {
        this.socket.send(JSON.stringify(signedMessage));
      } catch (error) {
        if (queue) {
          // 发送失败，加入队列
          this.messageQueue.push(signedMessage);
        }
        
        if (requireResponse) {
          const pending = this.pendingResponses.get(messageId);
          if (pending) {
            clearTimeout(pending.timeoutId);
            this.pendingResponses.delete(messageId);
            pending.reject(error);
          }
          return Promise.reject(error);
        }
      }
    } else if (queue) {
      // 未连接，加入队列
      this.messageQueue.push(signedMessage);
      
      // 尝试重连
      if (!this.connecting && this.autoReconnect) {
        this._reconnect();
      }
    } else if (requireResponse) {
      // 未连接且不加入队列，直接拒绝Promise
      return Promise.reject(new Error('WebSocket未连接'));
    }
    
    return requireResponse ? responsePromise : Promise.resolve();
  }
  
  /**
   * 请求服务器动作
   * @param {string} action - 动作名称
   * @param {Object} params - 动作参数
   * @param {number} [timeout=10000] - 超时时间(ms)
   * @returns {Promise<any>} 服务器响应
   */
  request(action, params = {}, timeout = 10000) {
    return this.send('request', { action, params }, {
      requireResponse: true,
      timeout
    });
  }
  
  /**
   * 发送战斗动作
   * @param {string} battleId - 战斗ID
   * @param {string} actionType - 动作类型
   * @param {Object} actionData - 动作数据
   * @returns {Promise<any>} 服务器确认
   */
  sendBattleAction(battleId, actionType, actionData = {}) {
    return this.send('battle_action', {
      battleId,
      action: actionType,
      ...actionData
    }, { requireResponse: true });
  }
  
  /**
   * 加入战斗
   * @param {string} battleId - 战斗ID
   * @returns {Promise<any>} 战斗信息
   */
  joinBattle(battleId) {
    return this.send('join_battle', { battleId }, { requireResponse: true });
  }
  
  /**
   * 离开战斗
   * @param {string} battleId - 战斗ID
   * @returns {Promise<void>} 确认离开
   */
  leaveBattle(battleId) {
    return this.send('leave_battle', { battleId }, { requireResponse: true });
  }
  
  /**
   * 加入聊天频道
   * @param {string} channelId - 频道ID
   * @returns {Promise<any>} 频道信息
   */
  joinChannel(channelId) {
    return this.send('join_channel', { channelId }, { requireResponse: true });
  }
  
  /**
   * 发送聊天消息
   * @param {string} channelId - 频道ID
   * @param {string} content - 消息内容
   * @param {Object} [extra={}] - 额外数据
   * @returns {Promise<any>} 消息确认
   */
  sendChatMessage(channelId, content, extra = {}) {
    return this.send('chat_message', {
      channelId,
      content,
      ...extra
    });
  }
  
  /**
   * 处理连接打开事件
   * @private
   */
  _handleOpen(event) {
    this.connected = true;
    this.connecting = false;
    this.reconnectAttempts = 0;
    
    // 发送队列中的消息
    this._processQueue();
    
    // 启动ping定时器
    this._startPing();
    
    // 触发连接事件
    this.emit('connected', event);
  }
  
  /**
   * 处理接收消息事件
   * @private
   */
  _handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      
      // 检查是否是响应消息
      if (message.id && this.pendingResponses.has(message.id)) {
        const { resolve, reject, timeoutId } = this.pendingResponses.get(message.id);
        
        // 清除超时定时器
        clearTimeout(timeoutId);
        this.pendingResponses.delete(message.id);
        
        // 处理响应
        if (message.error) {
          reject(new Error(message.error));
        } else {
          resolve(message.data);
        }
        return;
      }
      
      // 检查是否是服务器事件
      if (message.type === 'event') {
        this.emit(message.event, message.data);
        return;
      }
      
      // 检查是否是心跳响应
      if (message.type === 'pong') {
        this.emit('pong', message.data);
        return;
      }
      
      // 其他消息类型
      this.emit('message', message);
      
      // 特定消息类型的事件
      if (message.type) {
        this.emit(`message:${message.type}`, message.data);
      }
    } catch (error) {
      console.error('处理WebSocket消息失败', error);
      this.emit('error', error);
    }
  }
  
  /**
   * 处理错误事件
   * @private
   */
  _handleError(event) {
    this.emit('error', event);
  }
  
  /**
   * 处理连接关闭事件
   * @private
   */
  _handleClose(event) {
    this.connected = false;
    this.connecting = false;
    
    // 清理定时器
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    
    // 拒绝所有待处理的响应
    for (const [id, { reject, timeoutId }] of this.pendingResponses.entries()) {
      clearTimeout(timeoutId);
      reject(new Error('WebSocket连接已关闭'));
      this.pendingResponses.delete(id);
    }
    
    // 触发关闭事件
    this.emit('disconnected', event);
    
    // 如果需要自动重连
    if (this.autoReconnect) {
      this._reconnect();
    }
  }
  
  /**
   * 开始发送ping
   * @private
   */
  _startPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }
    
    this.pingTimer = setInterval(this._ping, this.pingInterval);
  }
  
  /**
   * 发送ping消息
   * @private
   */
  _ping() {
    if (this.connected) {
      this.send('ping', { time: Date.now() }, { queue: false });
    }
  }
  
  /**
   * 重新连接
   * @private
   */
  _reconnect() {
    if (this.connecting || this.connected) {
      return;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect_failed', { attempts: this.reconnectAttempts });
      return;
    }
    
    this.reconnectAttempts++;
    
    // 触发重连事件
    this.emit('reconnecting', { attempts: this.reconnectAttempts });
    
    // 延迟重连，使用指数退避
    const delay = Math.min(
      this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1),
      30000 // 最大30秒
    );
    
    setTimeout(() => {
      if (!this.connected && !this.connecting) {
        this.connect()
          .catch(error => {
            this.emit('reconnect_error', error);
          });
      }
    }, delay);
  }
  
  /**
   * 处理消息队列
   * @private
   */
  _processQueue() {
    if (!this.connected || this.messageQueue.length === 0) {
      return;
    }
    
    // 获取队列的副本并清空原队列
    const queue = [...this.messageQueue];
    this.messageQueue = [];
    
    // 发送队列中的消息
    for (const message of queue) {
      try {
        this.socket.send(JSON.stringify(message));
      } catch (error) {
        // 如果发送失败，重新加入队列
        this.messageQueue.push(message);
        console.error('从队列发送消息失败', error);
        
        // 如果连接已关闭，停止处理
        if (!this.connected) {
          break;
        }
      }
    }
  }
}

// 导出单例实例
let gameSocketInstance = null;

/**
 * 获取GameSocket实例
 * @param {Object} [options] - 配置选项
 * @returns {GameSocket} GameSocket实例
 */
export function getGameSocket(options = {}) {
  if (!gameSocketInstance) {
    gameSocketInstance = new GameSocket(options);
  }
  return gameSocketInstance;
}

/**
 * 重置GameSocket实例
 * 用于切换账号或测试
 */
export function resetGameSocket() {
  if (gameSocketInstance) {
    gameSocketInstance.disconnect();
    gameSocketInstance = null;
  }
}

export default {
  getGameSocket,
  resetGameSocket
}; 