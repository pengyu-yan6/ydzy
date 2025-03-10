/**
 * 动态路由配置中间件
 * 支持动态添加、修改、删除路由规则
 */
const express = require('express');
const logger = require('../utils/logger');

class DynamicRouteManager {
  constructor() {
    this.router = express.Router();
    this.routes = new Map();
    this.middlewares = new Map();
    
    // 路由缓存，用于提高性能
    this.routeCache = new Map();
    
    // 初始化默认中间件
    this._initializeDefaultMiddlewares();
  }

  /**
   * 初始化默认中间件
   * @private
   */
  _initializeDefaultMiddlewares() {
    // 路由日志中间件
    this.registerMiddleware('routeLogger', (req, res, next) => {
      logger.info('动态路由访问', {
        path: req.path,
        method: req.method,
        userId: req.user?.id
      });
      next();
    });

    // 路由缓存中间件
    this.registerMiddleware('routeCache', (req, res, next) => {
      const cacheKey = `${req.method}:${req.path}`;
      const cachedRoute = this.routeCache.get(cacheKey);
      
      if (cachedRoute) {
        req.dynamicRoute = cachedRoute;
      }
      next();
    });
  }

  /**
   * 注册中间件
   * @param {string} name - 中间件名称
   * @param {Function} middleware - 中间件函数
   */
  registerMiddleware(name, middleware) {
    this.middlewares.set(name, middleware);
  }

  /**
   * 添加动态路由
   * @param {Object} routeConfig - 路由配置
   */
  addRoute(routeConfig) {
    try {
      const {
        path,
        method = 'GET',
        handler,
        middlewares = [],
        description,
        enabled = true
      } = routeConfig;

      // 验证必要参数
      if (!path || !handler) {
        throw new Error('路由配置缺少必要参数');
      }

      // 构建路由对象
      const route = {
        path,
        method: method.toUpperCase(),
        handler,
        middlewares,
        description,
        enabled,
        createdAt: Date.now()
      };

      // 存储路由配置
      const routeKey = `${method}:${path}`;
      this.routes.set(routeKey, route);

      // 清除路由缓存
      this.routeCache.delete(routeKey);

      // 添加到Express路由
      this._applyRoute(route);

      logger.info('添加动态路由成功', {
        path,
        method,
        description
      });
    } catch (error) {
      logger.error('添加动态路由失败', {
        error: error.message,
        routeConfig
      });
      throw error;
    }
  }

  /**
   * 更新动态路由
   * @param {string} path - 路由路径
   * @param {string} method - HTTP方法
   * @param {Object} updates - 更新内容
   */
  updateRoute(path, method, updates) {
    try {
      const routeKey = `${method.toUpperCase()}:${path}`;
      const existingRoute = this.routes.get(routeKey);

      if (!existingRoute) {
        throw new Error('路由不存在');
      }

      // 更新路由配置
      const updatedRoute = {
        ...existingRoute,
        ...updates,
        updatedAt: Date.now()
      };

      // 存储更新后的路由
      this.routes.set(routeKey, updatedRoute);

      // 清除路由缓存
      this.routeCache.delete(routeKey);

      // 重新应用路由
      this._applyRoute(updatedRoute);

      logger.info('更新动态路由成功', {
        path,
        method,
        updates
      });
    } catch (error) {
      logger.error('更新动态路由失败', {
        error: error.message,
        path,
        method,
        updates
      });
      throw error;
    }
  }

  /**
   * 删除动态路由
   * @param {string} path - 路由路径
   * @param {string} method - HTTP方法
   */
  deleteRoute(path, method) {
    try {
      const routeKey = `${method.toUpperCase()}:${path}`;
      
      // 检查路由是否存在
      if (!this.routes.has(routeKey)) {
        throw new Error('路由不存在');
      }

      // 删除路由配置
      this.routes.delete(routeKey);

      // 清除路由缓存
      this.routeCache.delete(routeKey);

      // 重新构建Express路由
      this._rebuildRouter();

      logger.info('删除动态路由成功', {
        path,
        method
      });
    } catch (error) {
      logger.error('删除动态路由失败', {
        error: error.message,
        path,
        method
      });
      throw error;
    }
  }

  /**
   * 获取所有路由配置
   * @returns {Array} 路由配置列表
   */
  getRoutes() {
    return Array.from(this.routes.values());
  }

  /**
   * 应用路由配置
   * @private
   * @param {Object} route - 路由配置
   */
  _applyRoute(route) {
    const { path, method, handler, middlewares = [] } = route;

    // 构建中间件链
    const middlewareChain = middlewares
      .map(name => this.middlewares.get(name))
      .filter(Boolean);

    // 添加路由
    this.router[method.toLowerCase()](
      path,
      ...middlewareChain,
      async (req, res, next) => {
        try {
          await handler(req, res, next);
        } catch (error) {
          next(error);
        }
      }
    );
  }

  /**
   * 重新构建路由器
   * @private
   */
  _rebuildRouter() {
    // 创建新的路由器
    this.router = express.Router();

    // 重新应用所有路由
    for (const route of this.routes.values()) {
      if (route.enabled) {
        this._applyRoute(route);
      }
    }
  }

  /**
   * 获取路由中间件
   * @returns {Function} Express中间件
   */
  getMiddleware() {
    return (req, res, next) => {
      this.router(req, res, next);
    };
  }
}

// 导出单例
module.exports = new DynamicRouteManager(); 