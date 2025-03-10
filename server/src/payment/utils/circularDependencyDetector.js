/**
 * 循环依赖检测工具 - 在开发环境中检测模块间循环依赖
 * 在Node.js应用中，循环依赖可能导致内存泄漏和意外行为
 */

const path = require('path');
const fs = require('fs');
const Module = require('module');
const logger = require('../../utils/logger');

// 存储所有已加载的模块及其依赖关系
const moduleRegistry = new Map();

// 备份原始require函数
const originalRequire = Module.prototype.require;

/**
 * 初始化循环依赖检测器
 * @param {Object} options - 配置选项
 * @param {boolean} options.enabled - 是否启用检测器，默认为开发环境启用
 * @param {string[]} options.ignorePaths - 忽略检测的路径列表
 * @param {string[]} options.ignorePackages - 忽略检测的包名列表
 */
function initCircularDependencyDetector(options = {}) {
  const {
    enabled = process.env.NODE_ENV !== 'production',
    ignorePaths = ['node_modules'],
    ignorePackages = []
  } = options;
  
  if (!enabled) {
    return;
  }
  
  // 重载require函数以跟踪依赖关系
  Module.prototype.require = function (id) {
    const caller = this.filename;
    
    // 调用原始require加载模块
    const exports = originalRequire.call(this, id);
    
    // 解析模块完整路径
    let modulePath;
    try {
      modulePath = Module._resolveFilename(id, this);
    } catch (e) {
      return exports; // 无法解析路径，跳过检测
    }
    
    // 检查是否需要忽略该路径
    const shouldIgnore = (
      ignorePaths.some(p => modulePath.includes(p)) ||
      ignorePackages.some(pkg => id === pkg || id.startsWith(`${pkg}/`))
    );
    
    if (shouldIgnore) {
      return exports;
    }
    
    // 更新模块依赖关系
    if (!moduleRegistry.has(caller)) {
      moduleRegistry.set(caller, new Set());
    }
    moduleRegistry.get(caller).add(modulePath);
    
    // 检测循环依赖
    const stack = [modulePath];
    checkForCircularDependency(caller, modulePath, stack);
    
    return exports;
  };
  
  logger.info('循环依赖检测器已初始化', {
    environment: process.env.NODE_ENV,
    ignorePaths,
    ignorePackages
  });
}

/**
 * 检查模块之间是否存在循环依赖
 * @param {string} parent - 父模块路径
 * @param {string} current - 当前模块路径
 * @param {string[]} stack - 当前依赖栈
 * @returns {boolean} 是否存在循环依赖
 */
function checkForCircularDependency(parent, current, stack) {
  // 获取当前模块的依赖列表
  const dependencies = moduleRegistry.get(current);
  
  if (!dependencies) {
    return false;
  }
  
  // 遍历依赖列表，检测循环
  for (const dependency of dependencies) {
    // 如果依赖已在栈中，则检测到循环
    if (stack.includes(dependency)) {
      const cycle = [...stack.slice(stack.indexOf(dependency)), dependency];
      
      // 生成便于阅读的循环依赖路径
      const readableCycle = cycle.map(p => {
        const relativePath = path.relative(process.cwd(), p);
        return relativePath || p;
      });
      
      logger.warn('检测到循环依赖', {
        modulePath: path.relative(process.cwd(), parent),
        cycle: readableCycle,
        description: `${readableCycle.join(' -> ')}`
      });
      
      return true;
    }
    
    // 继续检测下一级依赖
    if (checkForCircularDependency(current, dependency, [...stack, dependency])) {
      return true;
    }
  }
  
  return false;
}

/**
 * 生成依赖图可视化数据
 * @returns {Object} 依赖图数据
 */
function generateDependencyGraph() {
  const nodes = [];
  const edges = [];
  
  // 为每个模块创建节点
  moduleRegistry.forEach((dependencies, modulePath) => {
    const relativePath = path.relative(process.cwd(), modulePath);
    nodes.push({
      id: modulePath,
      label: relativePath || modulePath,
      file: path.basename(modulePath)
    });
    
    // 为每个依赖关系创建边
    dependencies.forEach(dependency => {
      edges.push({
        from: modulePath,
        to: dependency
      });
    });
  });
  
  return { nodes, edges };
}

/**
 * 将依赖图导出为JSON文件
 * @param {string} outputPath - 输出文件路径
 */
function exportDependencyGraph(outputPath = 'dependency-graph.json') {
  const graph = generateDependencyGraph();
  
  fs.writeFileSync(
    outputPath,
    JSON.stringify(graph, null, 2),
    'utf8'
  );
  
  logger.info(`依赖图已导出至 ${outputPath}`, {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length
  });
}

module.exports = {
  initCircularDependencyDetector,
  generateDependencyGraph,
  exportDependencyGraph
}; 