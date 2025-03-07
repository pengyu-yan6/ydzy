/**
 * SoundAdapter.ts
 * 游戏音频适配器，提供统一的音频接口和随机音效生成功能
 * 支持多平台（微信、抖音、支付宝等小程序）
 */
import Taro from '@tarojs/taro';

/**
 * 音频类型枚举
 */
export enum SoundType {
  BACKGROUND = 'background', // 背景音乐
  EFFECT = 'effect',        // 音效
  UI = 'ui',                // UI交互音效
  VOICE = 'voice'           // 语音
}

/**
 * 音频事件类型
 */
export type SoundEventType = 
  | 'canplay'
  | 'play'
  | 'pause'
  | 'stop'
  | 'ended'
  | 'timeupdate'
  | 'error';

/**
 * 音频事件处理函数
 */
export type SoundEventHandler = (event: any) => void;

/**
 * 音频配置选项
 */
export interface SoundOptions {
  src: string;              // 音频资源路径
  loop?: boolean;           // 是否循环播放
  volume?: number;          // 音量 0-1
  autoplay?: boolean;       // 是否自动播放
  obeyMuteSwitch?: boolean; // 是否遵循系统静音开关
}

/**
 * 随机音效参数
 */
export interface RandomSoundParams {
  baseSound: string;        // 基础音效路径
  pitchRange?: [number, number]; // 音调范围 [最小值, 最大值]
  volumeRange?: [number, number]; // 音量范围 [最小值, 最大值]
  count?: number;          // 变种数量
}

/**
 * 音频状态
 */
export enum SoundStatus {
  INITIAL = 'initial',
  LOADING = 'loading',
  READY = 'ready',
  PLAYING = 'playing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error'
}

/**
 * 音频适配器接口
 */
export interface ISoundAdapter {
  // 初始化音频
  init(options: SoundOptions): Promise<void>;
  // 加载音频
  load(): Promise<void>;
  // 播放音频
  play(): Promise<void>;
  // 暂停音频
  pause(): void;
  // 停止音频
  stop(): void;
  // 设置音量
  setVolume(volume: number): void;
  // 设置播放位置
  seek(position: number): void;
  // 获取音频当前播放位置
  getCurrentTime(): number;
  // 获取音频总时长
  getDuration(): number;
  // 绑定事件
  on(eventType: SoundEventType, handler: SoundEventHandler): void;
  // 解绑事件
  off(eventType: SoundEventType, handler?: SoundEventHandler): void;
  // 获取音频状态
  getStatus(): SoundStatus;
  // 销毁音频实例
  destroy(): void;
}

/**
 * 基础音频适配器抽象类
 */
export abstract class BaseSoundAdapter implements ISoundAdapter {
  protected soundInstance: any = null;
  protected status: SoundStatus = SoundStatus.INITIAL;
  protected eventHandlers: Record<SoundEventType, SoundEventHandler[]> = {
    canplay: [],
    play: [],
    pause: [],
    stop: [],
    ended: [],
    timeupdate: [],
    error: []
  };

  /**
   * 初始化音频
   * @param options 音频配置选项
   */
  abstract init(options: SoundOptions): Promise<void>;

  /**
   * 加载音频
   */
  abstract load(): Promise<void>;

  /**
   * 播放音频
   */
  abstract play(): Promise<void>;

  /**
   * 暂停音频
   */
  abstract pause(): void;

  /**
   * 停止音频
   */
  abstract stop(): void;

  /**
   * 设置音量
   * @param volume 音量值 0-1
   */
  abstract setVolume(volume: number): void;

  /**
   * 设置播放位置
   * @param position 播放位置（秒）
   */
  abstract seek(position: number): void;

  /**
   * 获取音频当前播放位置
   */
  abstract getCurrentTime(): number;

  /**
   * 获取音频总时长
   */
  abstract getDuration(): number;

  /**
   * 绑定事件
   * @param eventType 事件类型
   * @param handler 事件处理函数
   */
  on(eventType: SoundEventType, handler: SoundEventHandler): void {
    if (!this.eventHandlers[eventType]) {
      this.eventHandlers[eventType] = [];
    }
    this.eventHandlers[eventType].push(handler);
  }

  /**
   * 解绑事件
   * @param eventType 事件类型
   * @param handler 事件处理函数，如果不传则解绑该类型的所有事件
   */
  off(eventType: SoundEventType, handler?: SoundEventHandler): void {
    if (!handler) {
      // 解绑该类型的所有事件
      this.eventHandlers[eventType] = [];
    } else {
      // 解绑特定的事件处理函数
      const index = this.eventHandlers[eventType].indexOf(handler);
      if (index !== -1) {
        this.eventHandlers[eventType].splice(index, 1);
      }
    }
  }

  /**
   * 获取音频状态
   */
  getStatus(): SoundStatus {
    return this.status;
  }

  /**
   * 销毁音频实例
   */
  abstract destroy(): void;

  /**
   * 触发事件
   * @param eventType 事件类型
   * @param data 事件数据
   */
  protected triggerEvent(eventType: SoundEventType, data: any): void {
    if (this.eventHandlers[eventType]) {
      this.eventHandlers[eventType].forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`事件处理器错误: ${eventType}`, error);
        }
      });
    }
  }
}

/**
 * 微信小程序音频适配器
 */
export class WechatSoundAdapter extends BaseSoundAdapter {
  /**
   * 初始化音频
   * @param options 音频配置选项
   */
  async init(options: SoundOptions): Promise<void> {
    this.status = SoundStatus.INITIAL;

    try {
      // 创建微信内部音频上下文
      // @ts-ignore - 微信小程序API
      this.soundInstance = Taro.createInnerAudioContext();
      
      // 设置音频属性
      this.soundInstance.src = options.src;
      this.soundInstance.loop = options.loop || false;
      this.soundInstance.volume = options.volume !== undefined ? options.volume : 1;
      this.soundInstance.autoplay = options.autoplay || false;
      this.soundInstance.obeyMuteSwitch = options.obeyMuteSwitch !== undefined ? options.obeyMuteSwitch : true;

      // 监听事件
      this.soundInstance.onCanplay(() => {
        this.status = SoundStatus.READY;
        this.triggerEvent('canplay', {});
      });

      this.soundInstance.onPlay(() => {
        this.status = SoundStatus.PLAYING;
        this.triggerEvent('play', {});
      });

      this.soundInstance.onPause(() => {
        this.status = SoundStatus.PAUSED;
        this.triggerEvent('pause', {});
      });

      this.soundInstance.onStop(() => {
        this.status = SoundStatus.STOPPED;
        this.triggerEvent('stop', {});
      });

      this.soundInstance.onEnded(() => {
        if (!options.loop) {
          this.status = SoundStatus.STOPPED;
        }
        this.triggerEvent('ended', {});
      });

      this.soundInstance.onTimeUpdate(() => {
        this.triggerEvent('timeupdate', {
          currentTime: this.soundInstance.currentTime,
          duration: this.soundInstance.duration
        });
      });

      this.soundInstance.onError((err: any) => {
        this.status = SoundStatus.ERROR;
        this.triggerEvent('error', err);
      });

      await this.load();
    } catch (error) {
      this.status = SoundStatus.ERROR;
      this.triggerEvent('error', error);
      throw error;
    }
  }

  /**
   * 加载音频
   */
  async load(): Promise<void> {
    if (!this.soundInstance) {
      throw new Error('音频实例未初始化');
    }

    this.status = SoundStatus.LOADING;
    
    return new Promise((resolve, reject) => {
      // 微信小程序的音频加载是自动的，监听canplay事件
      const onCanplay = () => {
        this.status = SoundStatus.READY;
        this.soundInstance.offCanplay(onCanplay);
        resolve();
      };

      const onError = (err: any) => {
        this.status = SoundStatus.ERROR;
        this.soundInstance.offError(onError);
        reject(err);
      };

      this.soundInstance.onCanplay(onCanplay);
      this.soundInstance.onError(onError);

      // 如果已经可以播放，直接解析
      if (this.soundInstance.paused === false) {
        this.status = SoundStatus.READY;
        resolve();
      }
    });
  }

  /**
   * 播放音频
   */
  async play(): Promise<void> {
    if (!this.soundInstance) {
      throw new Error('音频实例未初始化');
    }

    if (this.status !== SoundStatus.READY && 
        this.status !== SoundStatus.PAUSED && 
        this.status !== SoundStatus.STOPPED) {
      // 如果音频未准备好，尝试重新加载
      await this.load();
    }

    try {
      this.soundInstance.play();
      this.status = SoundStatus.PLAYING;
    } catch (error) {
      this.status = SoundStatus.ERROR;
      this.triggerEvent('error', error);
      throw error;
    }
  }

  /**
   * 暂停音频
   */
  pause(): void {
    if (!this.soundInstance) {
      throw new Error('音频实例未初始化');
    }

    if (this.status === SoundStatus.PLAYING) {
      this.soundInstance.pause();
      this.status = SoundStatus.PAUSED;
    }
  }

  /**
   * 停止音频
   */
  stop(): void {
    if (!this.soundInstance) {
      throw new Error('音频实例未初始化');
    }

    if (this.status === SoundStatus.PLAYING || this.status === SoundStatus.PAUSED) {
      this.soundInstance.stop();
      this.status = SoundStatus.STOPPED;
    }
  }

  /**
   * 设置音量
   * @param volume 音量值 0-1
   */
  setVolume(volume: number): void {
    if (!this.soundInstance) {
      throw new Error('音频实例未初始化');
    }

    // 确保音量在有效范围内
    const safeVolume = Math.max(0, Math.min(1, volume));
    this.soundInstance.volume = safeVolume;
  }

  /**
   * 设置播放位置
   * @param position 播放位置（秒）
   */
  seek(position: number): void {
    if (!this.soundInstance) {
      throw new Error('音频实例未初始化');
    }

    this.soundInstance.seek(position);
  }

  /**
   * 获取音频当前播放位置
   */
  getCurrentTime(): number {
    if (!this.soundInstance) {
      return 0;
    }
    return this.soundInstance.currentTime || 0;
  }

  /**
   * 获取音频总时长
   */
  getDuration(): number {
    if (!this.soundInstance) {
      return 0;
    }
    return this.soundInstance.duration || 0;
  }

  /**
   * 销毁音频实例
   */
  destroy(): void {
    if (this.soundInstance) {
      // 停止播放
      if (this.status === SoundStatus.PLAYING) {
        this.soundInstance.stop();
      }

      // 移除所有事件监听
      this.soundInstance.offCanplay();
      this.soundInstance.offPlay();
      this.soundInstance.offPause();
      this.soundInstance.offStop();
      this.soundInstance.offEnded();
      this.soundInstance.offTimeUpdate();
      this.soundInstance.offError();
      
      // 销毁实例
      this.soundInstance.destroy();
      this.soundInstance = null;
    }
  }
}