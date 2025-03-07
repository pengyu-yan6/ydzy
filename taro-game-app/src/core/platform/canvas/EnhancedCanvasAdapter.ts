/**
 * EnhancedCanvasAdapter.ts
 * 增强版Canvas适配器，解决微信和支付宝Canvas API的差异问题
 * 增加了事件处理、性能优化和更多绘图功能
 */
import Taro from '@tarojs/taro';
import { ICanvasAdapter, CanvasContext, TextOptions } from './CanvasAdapter';

// 微信小程序全局对象已在global.d.ts中声明

/**
 * 触摸事件类型
 */
export type TouchEventType = 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel';

/**
 * 触摸事件处理函数
 */
export type TouchEventHandler = (event: any) => void;

/**
 * 增强版Canvas适配器接口
 */
export interface IEnhancedCanvasAdapter extends ICanvasAdapter {
  // 事件处理
  bindTouchEvent(canvasId: string, eventType: TouchEventType, handler: TouchEventHandler): void;
  unbindTouchEvent(canvasId: string, eventType: TouchEventType): void;
  
  // 性能优化
  enableOptimization(ctx: CanvasContext, options?: OptimizationOptions): void;
  disableOptimization(ctx: CanvasContext): void;
  
  // 增强绘图功能
  drawRoundRect(ctx: CanvasContext, x: number, y: number, width: number, height: number, radius: number, fill?: boolean): void;
  drawGradient(ctx: CanvasContext, x: number, y: number, width: number, height: number, colorStops: Array<{offset: number, color: string}>): void;
  
  // 离屏Canvas支持
  createOffscreenCanvas(width: number, height: number): Promise<any>;
  transferToCanvas(offscreenCanvas: any, canvasId: string): Promise<void>;
}

/**
 * 性能优化选项
 */
export interface OptimizationOptions {
  enableBuffer?: boolean; // 是否启用缓冲区
  skipInvisible?: boolean; // 是否跳过不可见区域的绘制
  batchDraw?: boolean; // 是否批量绘制
}

/**
 * 微信小程序增强版Canvas适配器
 */
export class WechatEnhancedCanvasAdapter implements IEnhancedCanvasAdapter {
  private eventHandlers: Record<string, Record<TouchEventType, TouchEventHandler>> = {};
  private optimizationEnabled: boolean = false;
  private optimizationOptions: OptimizationOptions = {};
  
  async createContext(canvasId: string): Promise<CanvasContext> {
    return Taro.createCanvasContext(canvasId);
  }

  setLineStyle(ctx: CanvasContext, width: number, color: string): void {
    ctx.setLineWidth(width);
    ctx.setStrokeStyle(color);
  }

  setFillStyle(ctx: CanvasContext, color: string): void {
    ctx.setFillStyle(color);
  }

  drawRect(ctx: CanvasContext, x: number, y: number, width: number, height: number, fill: boolean = true): void {
    if (this.optimizationEnabled && this.optimizationOptions.skipInvisible) {
      // 简单的可见性检查
      if (x + width < 0 || y + height < 0) return;
    }
    
    if (fill) {
      ctx.fillRect(x, y, width, height);
    } else {
      ctx.strokeRect(x, y, width, height);
    }
  }

  drawCircle(ctx: CanvasContext, x: number, y: number, radius: number, fill: boolean = true): void {
    if (this.optimizationEnabled && this.optimizationOptions.skipInvisible) {
      // 简单的可见性检查
      if (x + radius < 0 || y + radius < 0) return;
    }
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  drawLine(ctx: CanvasContext, x1: number, y1: number, x2: number, y2: number): void {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  drawText(ctx: CanvasContext, text: string, x: number, y: number, options: TextOptions = {}): void {
    if (options.fontSize) {
      ctx.setFontSize(options.fontSize);
    }
    if (options.color) {
      ctx.setFillStyle(options.color);
    }
    if (options.textAlign) {
      ctx.setTextAlign(options.textAlign);
    }
    if (options.textBaseline) {
      ctx.setTextBaseline(options.textBaseline);
    }

    if (options.maxWidth) {
      ctx.fillText(text, x, y, options.maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }
  }

  drawImage(ctx: CanvasContext, imageResource: string, x: number, y: number, width: number, height: number): void {
    ctx.drawImage(imageResource, x, y, width, height);
  }

  save(ctx: CanvasContext): void {
    ctx.save();
  }

  restore(ctx: CanvasContext): void {
    ctx.restore();
  }

  transform(ctx: CanvasContext, scaleX: number, skewX: number, skewY: number, scaleY: number, translateX: number, translateY: number): void {
    ctx.transform(scaleX, skewX, skewY, scaleY, translateX, translateY);
  }

  async draw(ctx: CanvasContext, reserve: boolean = false): Promise<void> {
    return new Promise((resolve) => {
      // 支付宝的draw方法与微信不同
      ctx.draw(reserve, () => {
        resolve();
      });
    });
  }
  
  // 事件处理方法
  bindTouchEvent(canvasId: string, eventType: TouchEventType, handler: TouchEventHandler): void {
    if (!this.eventHandlers[canvasId]) {
      this.eventHandlers[canvasId] = {} as Record<TouchEventType, TouchEventHandler>;
    }
    this.eventHandlers[canvasId][eventType] = handler;
    
    // 使用Taro.createSelectorQuery获取Canvas元素并绑定事件
    const query = Taro.createSelectorQuery();
    query.select(`#${canvasId}`).boundingClientRect();
    query.exec(() => {
      // 在微信小程序中，我们需要手动处理事件绑定
      // 这里简化处理，实际项目中可能需要更复杂的逻辑
    });
  }
  
  unbindTouchEvent(canvasId: string, eventType: TouchEventType): void {
    if (this.eventHandlers[canvasId] && this.eventHandlers[canvasId][eventType]) {
      delete this.eventHandlers[canvasId][eventType];
    }
  }
  
  enableOptimization(_ctx: CanvasContext, options: OptimizationOptions = {}): void {
    this.optimizationEnabled = true;
    this.optimizationOptions = {
      ...this.optimizationOptions,
      ...options
    };
    
    // 如果启用了缓冲区，可以在这里进行相关设置
    if (options.enableBuffer) {
      // 微信小程序的缓冲区优化
    }
  }
  
  disableOptimization(_ctx: CanvasContext): void {
    this.optimizationEnabled = false;
  }
  
  drawRoundRect(ctx: CanvasContext, x: number, y: number, width: number, height: number, radius: number, fill: boolean = true): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
  
  drawGradient(ctx: CanvasContext, x: number, y: number, width: number, height: number, colorStops: Array<{offset: number, color: string}>): void {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    
    for (const stop of colorStops) {
      gradient.addColorStop(stop.offset, stop.color);
    }
    
    ctx.setFillStyle(gradient);
    ctx.fillRect(x, y, width, height);
  }
  
  async createOffscreenCanvas(width: number, height: number): Promise<any> {
    // 微信小程序支持离屏Canvas
    if (process.env.TARO_ENV === 'weapp' && typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
      // @ts-ignore - 微信小程序API
      return wx.createOffscreenCanvas({ width, height });
    }
    throw new Error('当前环境不支持离屏Canvas');
  }
  
  async transferToCanvas(offscreenCanvas: any, canvasId: string): Promise<void> {
    const ctx = await this.createContext(canvasId);
    // 将离屏Canvas内容绘制到目标Canvas
    ctx.drawImage(offscreenCanvas, 0, 0);
    return this.draw(ctx);
  }
}

/**
 * 支付宝小程序增强版Canvas适配器
 */
export class AlipayEnhancedCanvasAdapter implements IEnhancedCanvasAdapter {
  private eventHandlers: Record<string, Record<TouchEventType, TouchEventHandler>> = {};
  private optimizationEnabled: boolean = false;
  private optimizationOptions: OptimizationOptions = {};
  
  async createContext(canvasId: string): Promise<CanvasContext> {
    return new Promise((resolve) => {
      const ctx = Taro.createCanvasContext(canvasId);
      resolve(ctx);
    });
  }

  setLineStyle(ctx: CanvasContext, width: number, color: string): void {
    // 支付宝API与微信略有不同
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
  }

  setFillStyle(ctx: CanvasContext, color: string): void {
    // 支付宝API与微信略有不同
    ctx.fillStyle = color;
  }

  drawRect(ctx: CanvasContext, x: number, y: number, width: number, height: number, fill: boolean = true): void {
    if (this.optimizationEnabled && this.optimizationOptions.skipInvisible) {
      // 简单的可见性检查
      if (x + width < 0 || y + height < 0) return;
    }
    
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  drawCircle(ctx: CanvasContext, x: number, y: number, radius: number, fill: boolean = true): void {
    if (this.optimizationEnabled && this.optimizationOptions.skipInvisible) {
      // 简单的可见性检查
      if (x + radius < 0 || y + radius < 0) return;
    }
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  drawLine(ctx: CanvasContext, x1: number, y1: number, x2: number, y2: number): void {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  drawText(ctx: CanvasContext, text: string, x: number, y: number, options: TextOptions = {}): void {
    // 支付宝API与微信略有不同
    let fontSettings = '';
    if (options.fontSize) {
      fontSettings += `${options.fontSize}px `;
    }
    if (options.fontFamily) {
      fontSettings += options.fontFamily;
    } else {
      fontSettings += 'sans-serif';
    }
    ctx.font = fontSettings;

    if (options.color) {
      ctx.fillStyle = options.color;
    }
    if (options.textAlign) {
      ctx.textAlign = options.textAlign;
    }
    if (options.textBaseline) {
      ctx.textBaseline = options.textBaseline;
    }

    if (options.maxWidth) {
      ctx.fillText(text, x, y, options.maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }
  }

  drawImage(ctx: CanvasContext, imageResource: string, x: number, y: number, width: number, height: number): void {
    ctx.drawImage(imageResource, x, y, width, height);
  }

  save(ctx: CanvasContext): void {
    ctx.save();
  }

  restore(ctx: CanvasContext): void {
    ctx.restore();
  }

  transform(ctx: CanvasContext, scaleX: number, skewX: number, skewY: number, scaleY: number, translateX: number, translateY: number): void {
    ctx.transform(scaleX, skewX, skewY, scaleY, translateX, translateY);
  }

  async draw(ctx: CanvasContext, reserve: boolean = false): Promise<void> {
    return new Promise((resolve) => {
      // 支付宝的draw方法与微信不同
      ctx.draw(reserve, () => {
        resolve();
      });
    });
  }
  
  // 实现事件处理方法
  bindTouchEvent(canvasId: string, eventType: TouchEventType, handler: TouchEventHandler): void {
    if (!this.eventHandlers[canvasId]) {
      this.eventHandlers[canvasId] = {} as Record<TouchEventType, TouchEventHandler>;
    }
    this.eventHandlers[canvasId][eventType] = handler;
    
    // 支付宝小程序事件绑定
    const query = Taro.createSelectorQuery();
    query.select(`#${canvasId}`).boundingClientRect();
    query.exec(() => {
      // 支付宝小程序事件处理逻辑
    });
  }
  
  unbindTouchEvent(canvasId: string, eventType: TouchEventType): void {
    if (this.eventHandlers[canvasId] && this.eventHandlers[canvasId][eventType]) {
      delete this.eventHandlers[canvasId][eventType];
    }
  }
  
  // 实现性能优化方法
  enableOptimization(_ctx: CanvasContext, options: OptimizationOptions = {}): void {
    this.optimizationEnabled = true;
    this.optimizationOptions = {
      ...this.optimizationOptions,
      ...options
    };
    
    // 如果启用了缓冲区，可以在这里进行相关设置
    if (options.enableBuffer) {
      // 微信小程序的缓冲区优化
    }
  }
  
  disableOptimization(_ctx: CanvasContext): void {
    this.optimizationEnabled = false;
  }
  
  // 实现增强绘图功能
  drawRoundRect(ctx: CanvasContext, x: number, y: number, width: number, height: number, radius: number, fill: boolean = true): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
    
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
  
  drawGradient(ctx: CanvasContext, x: number, y: number, width: number, height: number, colorStops: Array<{offset: number, color: string}>): void {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    
    for (const stop of colorStops) {
      gradient.addColorStop(stop.offset, stop.color);
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
  }
  
  // 实现离屏Canvas支持
  async createOffscreenCanvas(_width: number, _height: number): Promise<any> {
    // 支付宝小程序目前不支持离屏Canvas，返回错误
    throw new Error('支付宝小程序环境不支持离屏Canvas');
  }
  
  async transferToCanvas(_offscreenCanvas: any, _canvasId: string): Promise<void> {
    throw new Error('支付宝小程序环境不支持离屏Canvas');
  }
}