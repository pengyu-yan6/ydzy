/**
 * TTVideoAdAdapter.ts
 * 抖音小程序视频广告接入方案
 * 封装抖音小程序视频广告API，提供统一的接口
 */

/**
 * 广告事件类型
 */
export type AdEventType = 
  | 'load' 
  | 'error' 
  | 'close' 
  | 'play' 
  | 'pause' 
  | 'ended' 
  | 'timeupdate' 
  | 'click';

/**
 * 广告事件处理函数
 */
export type AdEventHandler = (event: any) => void;

/**
 * 广告配置选项
 */
export interface VideoAdOptions {
  adUnitId: string;  // 广告单元ID
  autoplay?: boolean; // 是否自动播放
  muted?: boolean;   // 是否静音播放
  rewardAmount?: number; // 奖励数量
  rewardName?: string;  // 奖励名称
}

/**
 * 广告状态
 */
export enum AdStatus {
  INITIAL = 'initial',
  LOADING = 'loading',
  READY = 'ready',
  PLAYING = 'playing',
  PAUSED = 'paused',
  ERROR = 'error',
  CLOSED = 'closed'
}

/**
 * 抖音视频广告适配器接口
 */
export interface IVideoAdAdapter {
  // 初始化广告
  init(options: VideoAdOptions): Promise<void>;
  // 加载广告
  load(): Promise<void>;
  // 显示广告
  show(): Promise<void>;
  // 隐藏广告
  hide(): void;
  // 销毁广告
  destroy(): void;
  // 绑定事件
  on(eventType: AdEventType, handler: AdEventHandler): void;
  // 解绑事件
  off(eventType: AdEventType, handler?: AdEventHandler): void;
  // 获取广告状态
  getStatus(): AdStatus;
}

/**
 * 抖音小程序视频广告适配器
 */
export class TTVideoAdAdapter implements IVideoAdAdapter {
  private adInstance: any = null;
  // 存储初始化选项，但当前未使用
  // private options: VideoAdOptions | null = null;
  private status: AdStatus = AdStatus.INITIAL;
  private eventHandlers: Record<AdEventType, AdEventHandler[]> = {
    load: [],
    error: [],
    close: [],
    play: [],
    pause: [],
    ended: [],
    timeupdate: [],
    click: []
  };

  /**
   * 初始化广告
   * @param options 广告配置选项
   */
  async init(options: VideoAdOptions): Promise<void> {
    // 不再存储options，直接使用
    this.status = AdStatus.INITIAL;

    // 检查环境是否为抖音小程序
    if (process.env.TARO_ENV !== 'tt') {
      console.error('TTVideoAdAdapter 只能在抖音小程序环境中使用');
      this.status = AdStatus.ERROR;
      this.triggerEvent('error', { errMsg: 'TTVideoAdAdapter 只能在抖音小程序环境中使用' });
      return;
    }

    try {
      // 创建抖音激励视频广告实例
      // @ts-ignore - 抖音小程序API
      this.adInstance = tt.createRewardedVideoAd({
        adUnitId: options.adUnitId
      });

      // 监听广告加载事件
      this.adInstance.onLoad(() => {
        this.status = AdStatus.READY;
        this.triggerEvent('load', {});
      });

      // 监听广告错误事件
      this.adInstance.onError((err: any) => {
        this.status = AdStatus.ERROR;
        this.triggerEvent('error', err);
      });

      // 监听广告关闭事件
      this.adInstance.onClose((res: any) => {
        this.status = AdStatus.CLOSED;
        // 根据返回参数判断是否播放完成
        if (res && res.isEnded) {
          // 播放完成，可以发放奖励
          this.triggerEvent('ended', { isEnded: true });
        } else {
          // 播放中途退出，不应发放奖励
          this.triggerEvent('close', { isEnded: false });
        }
      });

      await this.load();
    } catch (error) {
      this.status = AdStatus.ERROR;
      this.triggerEvent('error', error);
      throw error;
    }
  }

  /**
   * 加载广告
   */
  async load(): Promise<void> {
    if (!this.adInstance) {
      throw new Error('广告实例未初始化');
    }

    this.status = AdStatus.LOADING;
    try {
      await this.adInstance.load();
      this.status = AdStatus.READY;
    } catch (error) {
      this.status = AdStatus.ERROR;
      this.triggerEvent('error', error);
      throw error;
    }
  }

  /**
   * 显示广告
   */
  async show(): Promise<void> {
    if (!this.adInstance) {
      throw new Error('广告实例未初始化');
    }

    if (this.status !== AdStatus.READY) {
      // 如果广告未准备好，尝试重新加载
      await this.load();
    }

    try {
      await this.adInstance.show();
      this.status = AdStatus.PLAYING;
      this.triggerEvent('play', {});
    } catch (error) {
      this.status = AdStatus.ERROR;
      this.triggerEvent('error', error);
      throw error;
    }
  }

  /**
   * 隐藏广告（抖音激励视频广告不支持隐藏，只能关闭）
   */
  hide(): void {
    // 抖音激励视频广告不支持隐藏操作
    console.warn('抖音激励视频广告不支持隐藏操作');
  }

  /**
   * 销毁广告实例
   */
  destroy(): void {
    if (this.adInstance) {
      // 移除所有事件监听
      this.adInstance.offLoad();
      this.adInstance.offError();
      this.adInstance.offClose();
      
      // 清空事件处理器
      Object.keys(this.eventHandlers).forEach(key => {
        this.eventHandlers[key as AdEventType] = [];
      });
      
      this.adInstance = null;
      this.status = AdStatus.INITIAL;
    }
  }

  /**
   * 绑定事件
   * @param eventType 事件类型
   * @param handler 事件处理函数
   */
  on(eventType: AdEventType, handler: AdEventHandler): void {
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
  off(eventType: AdEventType, handler?: AdEventHandler): void {
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
   * 获取广告状态
   */
  getStatus(): AdStatus {
    return this.status;
  }

  /**
   * 触发事件
   * @param eventType 事件类型
   * @param data 事件数据
   */
  private triggerEvent(eventType: AdEventType, data: any): void {
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
 * 创建抖音视频广告适配器实例
 */
export function createTTVideoAd(options: VideoAdOptions): IVideoAdAdapter {
  const adapter = new TTVideoAdAdapter();
  adapter.init(options).catch(error => {
    console.error('初始化抖音视频广告失败', error);
  });
  return adapter;
}

/**
 * 使用示例：
 * 
 * // 初始化广告
 * const videoAd = createTTVideoAd({
 *   adUnitId: 'your-ad-unit-id',
 *   autoplay: false
 * });
 * 
 * // 监听广告事件
 * videoAd.on('load', () => {
 *   console.log('广告加载成功');
 * });
 * 
 * videoAd.on('error', (err) => {
 *   console.error('广告加载失败', err);
 * });
 * 
 * videoAd.on('ended', (res) => {
 *   if (res.isEnded) {
 *     // 播放完成，发放奖励
 *     giveReward();
 *   }
 * });
 * 
 * // 显示广告
 * function showAd() {
 *   videoAd.show().catch(err => {
 *     console.error('显示广告失败', err);
 *   });
 * }
 * 
 * // 在组件销毁时清理
 * function cleanup() {
 *   videoAd.destroy();
 * }
 */