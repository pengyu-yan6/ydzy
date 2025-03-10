/**
 * SubpackageConfig.ts
 * 各平台分包加载策略配置
 * 针对微信、支付宝、抖音小程序的分包加载策略进行统一配置
 */

/**
 * 分包类型
 */
export enum SubpackageType {
  // 普通分包
  NORMAL = 'normal',
  // 独立分包
  INDEPENDENT = 'independent',
  // 分包预下载
  PRELOAD = 'preload'
}

/**
 * 分包配置接口
 */
export interface SubpackageConfig {
  // 分包根目录
  root: string;
  // 分包别名，用于预下载配置引用
  name: string;
  // 分包页面路径
  pages: string[];
  // 分包类型
  type?: SubpackageType;
  // 分包是否独立
  independent?: boolean;
  // 平台特定配置
  platformConfig?: {
    weapp?: any;
    alipay?: any;
    tt?: any;
  };
}

/**
 * 预下载规则配置
 */
export interface PreloadRule {
  // 进入页面后预下载
  [pageRoute: string]: {
    // 预下载的分包名称
    packages: string[];
    // 网络类型，可选值为：all（不限网络）、wifi（仅wifi下预下载）
    network?: 'all' | 'wifi';
  };
}

/**
 * 平台分包配置
 */
export interface PlatformSubpackageConfig {
  // 分包列表
  subpackages: SubpackageConfig[];
  // 预下载规则
  preloadRule: PreloadRule;
  // 首页的分包加载优化配置
  optimization?: {
    // 首屏渲染优化
    firstScreenRendering?: boolean;
    // 延迟加载的分包
    lazyLoadSubpackages?: string[];
  };
}

/**
 * 微信小程序分包配置
 */
export const weappSubpackageConfig: PlatformSubpackageConfig = {
  subpackages: [
    {
      root: 'packageA',
      name: 'pkgA',
      pages: [
        'pages/game/index',
        'pages/game/battle',
        'pages/game/result'
      ],
      type: SubpackageType.NORMAL
    },
    {
      root: 'packageB',
      name: 'pkgB',
      pages: [
        'pages/shop/index',
        'pages/shop/detail',
        'pages/shop/payment'
      ],
      type: SubpackageType.NORMAL
    },
    {
      root: 'packageC',
      name: 'pkgC',
      pages: [
        'pages/social/index',
        'pages/social/friends',
        'pages/social/chat'
      ],
      type: SubpackageType.INDEPENDENT,
      independent: true
    }
  ],
  preloadRule: {
    'pages/index/index': {
      packages: ['pkgA'],
      network: 'all'
    },
    'packageA/pages/game/index': {
      packages: ['pkgB'],
      network: 'wifi'
    }
  },
  optimization: {
    firstScreenRendering: true,
    lazyLoadSubpackages: ['pkgC']
  }
};

/**
 * 支付宝小程序分包配置
 */
export const alipaySubpackageConfig: PlatformSubpackageConfig = {
  subpackages: [
    {
      root: 'packageA',
      name: 'pkgA',
      pages: [
        'pages/game/index',
        'pages/game/battle',
        'pages/game/result'
      ],
      type: SubpackageType.NORMAL,
      // 支付宝特定配置
      platformConfig: {
        alipay: {
          // 支付宝分包特定配置
          plugins: {
            'myPlugin': {
              version: '*',
              provider: 'xxxxxxxx'
            }
          }
        }
      }
    },
    {
      root: 'packageB',
      name: 'pkgB',
      pages: [
        'pages/shop/index',
        'pages/shop/detail',
        'pages/shop/payment'
      ],
      type: SubpackageType.NORMAL
    },
    {
      root: 'packageC',
      name: 'pkgC',
      pages: [
        'pages/social/index',
        'pages/social/friends',
        'pages/social/chat'
      ],
      // 支付宝不支持独立分包，使用普通分包
      type: SubpackageType.NORMAL
    }
  ],
  preloadRule: {
    'pages/index/index': {
      packages: ['pkgA'],
      network: 'all'
    }
  },
  // 支付宝优化配置
  optimization: {
    firstScreenRendering: true
  }
};

/**
 * 抖音小程序分包配置
 */
export const ttSubpackageConfig: PlatformSubpackageConfig = {
  subpackages: [
    {
      root: 'packageA',
      name: 'pkgA',
      pages: [
        'pages/game/index',
        'pages/game/battle',
        'pages/game/result'
      ],
      type: SubpackageType.NORMAL,
      // 抖音特定配置
      platformConfig: {
        tt: {
          // 抖音分包特定配置
          // 抖音对单个分包大小限制更严格，需要更细粒度的拆分
          minifyLevel: 'high'
        }
      }
    },
    {
      root: 'packageB',
      name: 'pkgB',
      pages: [
        'pages/shop/index',
        'pages/shop/detail',
        'pages/shop/payment'
      ],
      type: SubpackageType.NORMAL
    },
    {
      root: 'packageC',
      name: 'pkgC',
      pages: [
        'pages/social/index',
        'pages/social/friends',
        'pages/social/chat'
      ],
      type: SubpackageType.INDEPENDENT,
      independent: true
    },
    // 抖音特有的广告分包
    {
      root: 'packageAd',
      name: 'pkgAd',
      pages: [
        'pages/ad/video',
        'pages/ad/banner',
        'pages/ad/interstitial'
      ],
      type: SubpackageType.NORMAL
    }
  ],
  preloadRule: {
    'pages/index/index': {
      packages: ['pkgA'],
      network: 'all'
    },
    'packageA/pages/game/index': {
      packages: ['pkgAd'],
      network: 'all'
    }
  },
  // 抖音优化配置
  optimization: {
    firstScreenRendering: true,
    lazyLoadSubpackages: ['pkgC']
  }
};

/**
 * 获取当前平台的分包配置
 */
export function getSubpackageConfig(): PlatformSubpackageConfig {
  // 根据当前环境返回对应的分包配置
  if (process.env.TARO_ENV === 'weapp') {
    return weappSubpackageConfig;
  } else if (process.env.TARO_ENV === 'alipay') {
    return alipaySubpackageConfig;
  } else if (process.env.TARO_ENV === 'tt') {
    return ttSubpackageConfig;
  }
  
  // 默认返回微信配置
  return weappSubpackageConfig;
}

/**
 * 应用分包配置到app.config.ts
 * 在编译时使用此函数生成对应平台的分包配置
 */
export function applySubpackageConfig(appConfig: any): any {
  const config = getSubpackageConfig();
  
  // 添加分包配置
  appConfig.subpackages = config.subpackages.map(pkg => ({
    root: pkg.root,
    pages: pkg.pages,
    independent: pkg.independent || false,
    ...(pkg.platformConfig?.[process.env.TARO_ENV as 'weapp' | 'alipay' | 'tt'] || {})
  }));
  
  // 添加预下载规则
  appConfig.preloadRule = config.preloadRule;
  
  // 添加优化配置
  if (config.optimization) {
    if (process.env.TARO_ENV === 'weapp') {
      // 微信特定优化配置
      if (config.optimization.firstScreenRendering) {
        appConfig.renderer = 'skyline'; // 使用Skyline渲染引擎提升性能
      }
    } else if (process.env.TARO_ENV === 'alipay') {
      // 支付宝特定优化配置
    } else if (process.env.TARO_ENV === 'tt') {
      // 抖音特定优化配置
      if (config.optimization.lazyLoadSubpackages) {
        appConfig.lazyCodeLoading = 'requiredComponents';
      }
    }
  }
  
  return appConfig;
}

/**
 * 使用示例：
 * 
 * // 在app.config.ts中
 * import { applySubpackageConfig } from './core/platform/subpackage/SubpackageConfig';
 * 
 * // 基础配置
 * const baseConfig = {
 *   pages: ['pages/index/index'],
 *   window: {
 *     backgroundTextStyle: 'light',
 *     navigationBarBackgroundColor: '#fff',
 *     navigationBarTitleText: 'Taro Game',
 *     navigationBarTextStyle: 'black'
 *   }
 * };
 * 
 * // 应用分包配置
 * export default defineAppConfig(applySubpackageConfig(baseConfig));
 */