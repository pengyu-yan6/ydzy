/**
 * CanvasAdapter.ts
 * 封装微信和支付宝Canvas API的差异，提供统一的绘图接口
 */
import Taro from '@tarojs/taro';

// Canvas上下文类型
export type CanvasContext = any;

/**
 * Canvas适配器接口
 */
export interface ICanvasAdapter {
  // 创建Canvas上下文
  createContext(canvasId: string): Promise<CanvasContext>;
  // 设置线条样式
  setLineStyle(ctx: CanvasContext, width: number, color: string): void;
  // 设置填充样式
  setFillStyle(ctx: CanvasContext, color: string): void;
  // 绘制矩形
  drawRect(ctx: CanvasContext, x: number, y: number, width: number, height: number, fill?: boolean): void;
  // 绘制圆形
  drawCircle(ctx: CanvasContext, x: number, y: number, radius: number, fill?: boolean): void;
  // 绘制线条
  drawLine(ctx: CanvasContext, x1: number, y1: number, x2: number, y2: number): void;
  // 绘制文本
  drawText(ctx: CanvasContext, text: string, x: number, y: number, options?: TextOptions): void;
  // 绘制图片
  drawImage(ctx: CanvasContext, imageResource: string, x: number, y: number, width: number, height: number): void;
  // 保存当前状态
  save(ctx: CanvasContext): void;
  // 恢复之前的状态
  restore(ctx: CanvasContext): void;
  // 应用变换
  transform(ctx: CanvasContext, scaleX: number, skewX: number, skewY: number, scaleY: number, translateX: number, translateY: number): void;
  // 绘制
  draw(ctx: CanvasContext, reserve?: boolean): Promise<void>;
}

/**
 * 文本绘制选项
 */
export interface TextOptions {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  textBaseline?: 'top' | 'middle' | 'bottom' | 'normal';
  maxWidth?: number;
}

/**
 * 微信小程序Canvas适配器
 */
export class WechatCanvasAdapter implements ICanvasAdapter {
  async createContext(canvasId: string): Promise<CanvasContext> {
    // 微信使用wx.createCanvasContext
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
    if (fill) {
      ctx.fillRect(x, y, width, height);
    } else {
      ctx.strokeRect(x, y, width, height);
    }
  }

  drawCircle(ctx: CanvasContext, x: number, y: number, radius: number, fill: boolean = true): void {
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
    return new Promise((resolve, reject) => {
      ctx.draw(reserve, (res: any) => {
        if (res && res.errMsg) {
          reject(new Error(res.errMsg));
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * 支付宝小程序Canvas适配器
 */
export class AlipayCanvasAdapter implements ICanvasAdapter {
  async createContext(canvasId: string): Promise<CanvasContext> {
    // 支付宝使用my.createCanvasContext
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
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  drawCircle(ctx: CanvasContext, x: number, y: number, radius: number, fill: boolean = true): void {
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
}

/**
 * 创建适合当前平台的Canvas适配器
 */
export function createCanvasAdapter(): ICanvasAdapter {
  // 根据当前环境创建对应的适配器
  if (process.env.TARO_ENV === 'weapp') {
    return new WechatCanvasAdapter();
  } else if (process.env.TARO_ENV === 'alipay') {
    return new AlipayCanvasAdapter();
  } else {
    // 默认使用微信适配器
    return new WechatCanvasAdapter();
  }
}

// 导出默认适配器实例
export default createCanvasAdapter();