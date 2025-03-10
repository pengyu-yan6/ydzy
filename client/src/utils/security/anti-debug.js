/**
 * 前端反调试工具
 * 用于检测和防止开发者工具及调试行为
 */

// 检测标志
let debuggerDetected = false;
let devtoolsOpened = false;

/**
 * 检测是否打开了开发者工具
 * @returns {boolean} 是否打开了开发者工具
 */
export function checkDevTools() {
  const threshold = 160; // 阈值可根据需要调整
  const widthThreshold = window.outerWidth - window.innerWidth > threshold;
  const heightThreshold = window.outerHeight - window.innerHeight > threshold;
  const orientation = widthThreshold ? 'vertical' : (heightThreshold ? 'horizontal' : '');
  
  // 根据窗口大小差异检测开发者工具
  return !!orientation;
}

/**
 * 使用console.clear()检测开发者工具
 * 当控制台打开时，控制台会被清除
 */
export function consoleDebugCheck() {
  const startTime = new Date();
  console.log('%c', 'font-size:0;padding:' + Array(1000000).join(' '));
  console.clear();
  
  if (new Date() - startTime > 100) {
    devtoolsOpened = true;
    return true;
  }
  
  return false;
}

/**
 * debugger语句检测
 * 尝试诱导调试断点
 */
export function debuggerCheck() {
  let start = new Date().getTime();
  debugger;
  let end = new Date().getTime();
  
  if (end - start > 100) {
    debuggerDetected = true;
    return true;
  }
  
  return false;
}

/**
 * 函数调用堆栈检测
 * 检查是否有调试相关的堆栈
 */
export function stackTraceCheck() {
  try {
    throw new Error();
  } catch (e) {
    const stackTrace = e.stack || '';
    return /debug|devtools|chrome:\/\//.test(stackTrace.toLowerCase());
  }
}

/**
 * 定时器一致性检查
 * 调试时定时器可能不准确
 */
export function timerConsistencyCheck() {
  let slowdowns = 0;
  let lastTime = Date.now();
  
  // 检查执行间隔
  const checkExecTime = () => {
    const currentTime = Date.now();
    const diff = currentTime - lastTime;
    
    // 如果时间差超过预期太多，可能是断点导致
    if (diff > 100) {
      slowdowns++;
    }
    
    lastTime = currentTime;
    return slowdowns > 3; // 超过3次则认为可能在调试
  };
  
  return checkExecTime();
}

/**
 * 启用所有反调试措施
 * @param {Function} callback - 检测到调试时的回调函数
 * @param {boolean} [aggressive=false] - 是否使用积极的反调试措施
 */
export function enableAntiDebugging(callback, aggressive = false) {
  // 初始状态重置
  debuggerDetected = false;
  devtoolsOpened = false;
  
  // 常规检测
  const checkDebugger = () => {
    // 检测开发者工具
    const devToolsOpen = checkDevTools();
    
    // 检测断点
    const debuggerActive = debuggerCheck();
    
    // 检测控制台
    const consoleActive = consoleDebugCheck();
    
    // 检测堆栈
    const suspiciousStack = stackTraceCheck();
    
    // 检测定时器异常
    const timerAnomaly = timerConsistencyCheck();
    
    // 如果检测到任何调试行为
    if (devToolsOpen || debuggerActive || consoleActive || suspiciousStack || timerAnomaly) {
      if (typeof callback === 'function') {
        callback({
          devToolsOpen,
          debuggerActive,
          consoleActive,
          suspiciousStack,
          timerAnomaly
        });
      }
      return true;
    }
    
    return false;
  };
  
  // 初始检查
  checkDebugger();
  
  // 定期检查
  const intervalId = setInterval(checkDebugger, 1000);
  
  // 如果是激进模式，添加更多反调试措施
  if (aggressive) {
    // 覆盖控制台方法
    const originalConsole = { ...console };
    const methods = ['log', 'info', 'warn', 'error', 'debug', 'clear'];
    
    methods.forEach(method => {
      console[method] = function() {
        // 可以选择记录尝试使用控制台的操作
        if (typeof callback === 'function') {
          callback({ consoleUsed: method });
        }
        // 可以选择是否执行原始功能
        // originalConsole[method].apply(console, arguments);
      };
    });
    
    // 重写Function构造函数以防止eval等操作
    const originalFunction = window.Function;
    window.Function = function() {
      if (typeof callback === 'function') {
        callback({ functionConstructorUsed: true });
      }
      return originalFunction.apply(this, arguments);
    };
    
    // 定期执行debugger检查
    setInterval(() => {
      try {
        debugger;
      } catch (e) {}
    }, 100);
  }
  
  // 返回停止函数
  return function stopAntiDebugging() {
    clearInterval(intervalId);
    
    // 如果是激进模式，恢复原始方法
    if (aggressive) {
      const methods = ['log', 'info', 'warn', 'error', 'debug', 'clear'];
      methods.forEach(method => {
        console[method] = originalConsole[method];
      });
      
      // 恢复Function构造函数
      if (window.Function !== originalFunction) {
        window.Function = originalFunction;
      }
    }
  };
}

/**
 * 验证游戏客户端完整性
 * 检查脚本和资源是否被修改
 * @returns {Promise<boolean>} 客户端是否完整
 */
export async function verifyClientIntegrity() {
  try {
    // 获取关键脚本的内容并计算哈希值
    // 这里仅作为示例，实际应用中需要更复杂的实现
    const scripts = document.querySelectorAll('script[src]');
    const scriptUrls = Array.from(scripts).map(script => script.src);
    
    // 检查是否有未经授权的脚本注入
    const allowedDomains = [window.location.hostname, 'cdn.yourgame.com'];
    const hasUnauthorizedScripts = scriptUrls.some(url => {
      const scriptDomain = new URL(url).hostname;
      return !allowedDomains.includes(scriptDomain);
    });
    
    if (hasUnauthorizedScripts) {
      console.warn('检测到未授权的脚本');
      return false;
    }
    
    // 检查DOM是否被篡改
    const sensitiveElements = document.querySelectorAll('[data-secure]');
    const hasTamperedElements = Array.from(sensitiveElements).some(
      el => el.getAttribute('data-integrity') !== el.getAttribute('data-secure')
    );
    
    if (hasTamperedElements) {
      console.warn('检测到DOM被篡改');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('客户端完整性检查失败', error);
    return false;
  }
}

/**
 * 处理检测到调试的默认行为
 * @param {Object} detectionInfo - 检测信息
 */
export function handleDebuggerDetection(detectionInfo = {}) {
  console.warn('检测到调试行为，这可能会影响游戏体验', detectionInfo);
  
  // 可以根据需要添加反制措施
  // 例如：重定向、记录用户、限制功能等
}

// 导出工具函数
export default {
  checkDevTools,
  consoleDebugCheck,
  debuggerCheck,
  stackTraceCheck,
  timerConsistencyCheck,
  enableAntiDebugging,
  verifyClientIntegrity,
  handleDebuggerDetection
}; 