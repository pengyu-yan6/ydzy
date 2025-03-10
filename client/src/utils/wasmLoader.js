/**
 * WebAssembly加载和封装工具
 * 用于安全地加载和使用WebAssembly模块
 */

// 缓存已加载的模块
const moduleCache = new Map();

/**
 * 初始化WebAssembly
 * @param {string} path - WebAssembly文件路径
 * @param {Object} [importObject] - WebAssembly导入对象
 * @returns {Promise<Object>} 包含实例和导出的对象
 */
export async function initWasm(path, importObject = {}) {
  // 检查缓存中是否已有该模块
  if (moduleCache.has(path)) {
    return moduleCache.get(path);
  }
  
  try {
    // 从网络加载WebAssembly模块
    const response = await fetch(path);
    
    // 如果请求失败，抛出错误
    if (!response.ok) {
      throw new Error(`Failed to fetch WebAssembly module: ${response.statusText}`);
    }
    
    // 获取二进制数据
    const buffer = await response.arrayBuffer();
    
    // 编译WebAssembly模块
    const module = await WebAssembly.compile(buffer);
    
    // 创建WebAssembly实例
    const instance = await WebAssembly.instantiate(module, importObject);
    
    // 获取导出对象
    const exports = instance.exports;
    
    // 创建结果对象
    const result = { module, instance, exports };
    
    // 缓存结果
    moduleCache.set(path, result);
    
    return result;
  } catch (error) {
    console.error('WebAssembly加载失败:', error);
    throw error;
  }
}

/**
 * 创建WebAssembly导入对象
 * 用于提供JavaScript函数给WebAssembly模块
 * @param {Object} imports - 导入函数映射
 * @returns {Object} WebAssembly导入对象
 */
export function createWasmImports(imports = {}) {
  // 基础环境导入
  const env = {
    // 内存分配相关函数
    memory: new WebAssembly.Memory({ initial: 10, maximum: 100 }),
    
    // 打印函数
    consoleLog: (ptr, len) => {
      const memory = env.memory;
      const bytes = new Uint8Array(memory.buffer, ptr, len);
      const string = new TextDecoder('utf8').decode(bytes);
      console.log('[WASM]:', string);
    },
    
    // 错误处理函数
    consoleError: (ptr, len) => {
      const memory = env.memory;
      const bytes = new Uint8Array(memory.buffer, ptr, len);
      const string = new TextDecoder('utf8').decode(bytes);
      console.error('[WASM Error]:', string);
    },
    
    // 性能计时函数
    now: () => Date.now(),
    
    // 随机数生成
    random: () => Math.random(),
    
    // 用户自定义导入
    ...imports
  };
  
  return { env };
}

/**
 * 将字符串传递给WebAssembly
 * @param {WebAssembly.Memory} memory - WebAssembly内存
 * @param {string} str - 要传递的字符串
 * @returns {Object} 内存指针和长度
 */
export function passStringToWasm(memory, str) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const len = bytes.length;
  
  // 在内存中分配空间
  const ptr = malloc(memory, len + 1);
  
  // 写入数据
  const buffer = new Uint8Array(memory.buffer, ptr, len + 1);
  buffer.set(bytes);
  buffer[len] = 0; // 添加NULL终止符
  
  return { ptr, len };
}

/**
 * 从WebAssembly读取字符串
 * @param {WebAssembly.Memory} memory - WebAssembly内存
 * @param {number} ptr - 内存指针
 * @param {number} len - 字符串长度
 * @returns {string} 读取的字符串
 */
export function getStringFromWasm(memory, ptr, len) {
  const bytes = new Uint8Array(memory.buffer, ptr, len);
  return new TextDecoder('utf8').decode(bytes);
}

/**
 * 简单的内存分配器
 * 注意：这只是一个示例实现，生产环境中应该使用WebAssembly模块自己的分配器
 * @param {WebAssembly.Memory} memory - WebAssembly内存
 * @param {number} size - 要分配的字节数
 * @returns {number} 内存指针
 */
function malloc(memory, size) {
  // 此处应该使用实际的内存分配逻辑
  // 示例仅用于演示目的
  const offset = memory.__lastOffset || 0;
  memory.__lastOffset = offset + size;
  
  // 确保不超过内存限制
  if (memory.__lastOffset > memory.buffer.byteLength) {
    throw new Error('内存分配失败：超出内存限制');
  }
  
  return offset;
}

/**
 * 创建WebAssembly数组
 * @param {WebAssembly.Memory} memory - WebAssembly内存
 * @param {Array} array - JavaScript数组
 * @param {string} type - 数组类型 ('i8', 'i16', 'i32', 'f32', 'f64')
 * @returns {Object} 内存指针和数组长度
 */
export function createWasmArray(memory, array, type = 'i32') {
  let TypedArray;
  let bytesPerElement;
  
  switch (type) {
    case 'i8':
      TypedArray = Int8Array;
      bytesPerElement = 1;
      break;
    case 'i16':
      TypedArray = Int16Array;
      bytesPerElement = 2;
      break;
    case 'i32':
      TypedArray = Int32Array;
      bytesPerElement = 4;
      break;
    case 'f32':
      TypedArray = Float32Array;
      bytesPerElement = 4;
      break;
    case 'f64':
      TypedArray = Float64Array;
      bytesPerElement = 8;
      break;
    default:
      throw new Error(`不支持的数组类型: ${type}`);
  }
  
  const len = array.length;
  const bytes = len * bytesPerElement;
  
  // 在内存中分配空间
  const ptr = malloc(memory, bytes);
  
  // 写入数据
  const buffer = new TypedArray(memory.buffer, ptr, len);
  buffer.set(array);
  
  return { ptr, len };
}

/**
 * 从WebAssembly读取数组
 * @param {WebAssembly.Memory} memory - WebAssembly内存
 * @param {number} ptr - 内存指针
 * @param {number} len - 数组长度
 * @param {string} type - 数组类型 ('i8', 'i16', 'i32', 'f32', 'f64')
 * @returns {TypedArray} 读取的数组
 */
export function getArrayFromWasm(memory, ptr, len, type = 'i32') {
  let TypedArray;
  
  switch (type) {
    case 'i8':
      TypedArray = Int8Array;
      break;
    case 'i16':
      TypedArray = Int16Array;
      break;
    case 'i32':
      TypedArray = Int32Array;
      break;
    case 'f32':
      TypedArray = Float32Array;
      break;
    case 'f64':
      TypedArray = Float64Array;
      break;
    default:
      throw new Error(`不支持的数组类型: ${type}`);
  }
  
  return new TypedArray(memory.buffer, ptr, len);
}

/**
 * 包装WebAssembly模块，提供更易用的API
 * @param {Object} wasmModule - 由initWasm返回的WebAssembly模块对象
 * @returns {Object} 包装后的API
 */
export function wrapWasmModule(wasmModule) {
  const { exports } = wasmModule;
  const memory = exports.memory || wasmModule.importObject?.env?.memory;
  
  if (!memory) {
    throw new Error('无法获取WebAssembly内存');
  }
  
  return {
    // 暴露原始导出
    raw: exports,
    
    // 字符串处理
    passString: (str) => passStringToWasm(memory, str),
    getString: (ptr, len) => getStringFromWasm(memory, ptr, len),
    
    // 数组处理
    createArray: (array, type) => createWasmArray(memory, array, type),
    getArray: (ptr, len, type) => getArrayFromWasm(memory, ptr, len, type),
    
    // 释放内存（如果模块提供了free函数）
    free: exports.free ? (ptr) => exports.free(ptr) : undefined,
    
    // 内存相关
    memory
  };
}

/**
 * 加载WebAssembly加密模块
 * 提供加密相关功能
 * @returns {Promise<Object>} 加密API
 */
export async function loadCryptoModule() {
  // 定义导入对象
  const importObject = createWasmImports({
    // 可以添加密码学相关的辅助函数
    getRandomBytes: (ptr, len) => {
      const memory = importObject.env.memory;
      const bytes = new Uint8Array(memory.buffer, ptr, len);
      crypto.getRandomValues(bytes);
    }
  });
  
  // 加载模块
  const wasmModule = await initWasm('/assets/wasm/crypto.wasm', importObject);
  const wrapper = wrapWasmModule(wasmModule);
  
  // 定义高级API
  return {
    // 哈希函数
    sha256: (data) => {
      const isString = typeof data === 'string';
      
      // 将数据传递给WebAssembly
      const { ptr, len } = isString 
        ? wrapper.passString(data)
        : wrapper.createArray(new Uint8Array(data), 'i8');
      
      // 调用WebAssembly的哈希函数
      const resultPtr = wasmModule.exports.sha256(ptr, len);
      
      // 读取结果
      const resultArray = wrapper.getArray(resultPtr, 32, 'i8');
      
      // 转换为十六进制字符串
      const result = Array.from(resultArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // 释放内存
      if (wrapper.free) {
        wrapper.free(ptr);
        wrapper.free(resultPtr);
      }
      
      return result;
    },
    
    // AES加密
    aesEncrypt: (data, key, iv) => {
      // 实现AES加密逻辑
      // ...
      
      return { ciphertext: 'encrypted-data', iv: 'iv-used' };
    },
    
    // AES解密
    aesDecrypt: (ciphertext, key, iv) => {
      // 实现AES解密逻辑
      // ...
      
      return 'decrypted-data';
    },
    
    // 更多加密功能可以在此添加
    
    // 返回原始包装器，以便进行低级操作
    _wrapper: wrapper
  };
}

export default {
  initWasm,
  createWasmImports,
  passStringToWasm,
  getStringFromWasm,
  createWasmArray,
  getArrayFromWasm,
  wrapWasmModule,
  loadCryptoModule
}; 