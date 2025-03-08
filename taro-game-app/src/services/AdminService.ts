/**
 * AdminService.ts - 管理后台服务
 * 实现支付配置管理和CDK系统功能
 */

import Taro from '@tarojs/taro';

// 支付配置接口
export interface PaymentConfig {
  wechat: {
    appId: string;
    mchId: string;
    apiKey: string;
  };
  alipay: {
    appId: string;
    privateKey: string;
    publicKey: string;
  };
}

// CDK接口
export interface CDK {
  code: string;
  rewardType: string;
  rewardAmount: number;
  status: 'unused' | 'used' | 'expired';
  createTime: number;
  expireTime: number;
  usedTime?: number;
  usedBy?: string;
}

/**
 * 管理服务类
 * 实现支付配置管理和CDK系统功能
 */
export class AdminService {
  private readonly API_BASE_URL: string;
  private readonly ADMIN_TOKEN: string;

  constructor(apiBaseUrl: string, adminToken: string) {
    this.API_BASE_URL = apiBaseUrl;
    this.ADMIN_TOKEN = adminToken;
  }

  /**
   * 获取支付配置
   */
  public async getPaymentConfig(): Promise<PaymentConfig> {
    try {
      const response = await Taro.request({
        url: `${this.API_BASE_URL}/admin/payment/config`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${this.ADMIN_TOKEN}`
        }
      });

      if (response.statusCode === 200) {
        return response.data;
      }
      throw new Error('获取支付配置失败');
    } catch (error) {
      console.error('获取支付配置错误:', error);
      throw error;
    }
  }

  /**
   * 更新支付配置
   */
  public async updatePaymentConfig(type: 'wechat' | 'alipay', config: any): Promise<boolean> {
    try {
      const response = await Taro.request({
        url: `${this.API_BASE_URL}/admin/payment/config/${type}`,
        method: 'PUT',
        header: {
          'Authorization': `Bearer ${this.ADMIN_TOKEN}`
        },
        data: config
      });

      return response.statusCode === 200;
    } catch (error) {
      console.error('更新支付配置错误:', error);
      throw error;
    }
  }

  /**
   * 生成CDK
   */
  public async generateCDK(params: {
    rewardType: string;
    rewardAmount: number;
    count: number;
    expireDays: number;
  }): Promise<CDK[]> {
    try {
      const response = await Taro.request({
        url: `${this.API_BASE_URL}/admin/cdk/generate`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${this.ADMIN_TOKEN}`
        },
        data: params
      });

      if (response.statusCode === 200) {
        return response.data;
      }
      throw new Error('生成CDK失败');
    } catch (error) {
      console.error('生成CDK错误:', error);
      throw error;
    }
  }

  /**
   * 获取CDK列表
   */
  public async getCDKList(params: {
    page: number;
    pageSize: number;
    status?: string;
  }): Promise<{
    total: number;
    list: CDK[];
  }> {
    try {
      const response = await Taro.request({
        url: `${this.API_BASE_URL}/admin/cdk/list`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${this.ADMIN_TOKEN}`
        },
        data: params
      });

      if (response.statusCode === 200) {
        return response.data;
      }
      throw new Error('获取CDK列表失败');
    } catch (error) {
      console.error('获取CDK列表错误:', error);
      throw error;
    }
  }

  /**
   * 导出CDK列表
   */
  public async exportCDK(params: {
    status?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<string> {
    try {
      const response = await Taro.request({
        url: `${this.API_BASE_URL}/admin/cdk/export`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${this.ADMIN_TOKEN}`
        },
        data: params
      });

      if (response.statusCode === 200) {
        return response.data.downloadUrl;
      }
      throw new Error('导出CDK失败');
    } catch (error) {
      console.error('导出CDK错误:', error);
      throw error;
    }
  }

  /**
   * 验证CDK
   */
  public async validateCDK(code: string): Promise<{
    valid: boolean;
    reward?: {
      type: string;
      amount: number;
    };
    message?: string;
  }> {
    try {
      const response = await Taro.request({
        url: `${this.API_BASE_URL}/admin/cdk/validate`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${this.ADMIN_TOKEN}`
        },
        data: { code }
      });

      if (response.statusCode === 200) {
        return response.data;
      }
      throw new Error('验证CDK失败');
    } catch (error) {
      console.error('验证CDK错误:', error);
      throw error;
    }
  }
}