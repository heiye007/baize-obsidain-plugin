/**
 * Polyfill Entry Point
 *
 * 这个文件必须在所有其他代码之前执行，用于注入 worker_threads polyfill
 * 防止 ONNX Runtime 尝试加载 worker_threads 模块
 */

// 1. 拦截 globalThis.import (ES module 动态导入)
const originalGlobalImport = (globalThis as any).import;
if (originalGlobalImport) {
    (globalThis as any).import = function(specifier: string) {
        if (specifier === 'worker_threads') {
            return Promise.resolve({});
        }
        return originalGlobalImport.call(this, specifier);
    };
}

// 2. 拦截 require (CommonJS)
if (typeof (globalThis as any).require !== 'undefined') {
    const originalRequire = (globalThis as any).require;
    (globalThis as any).require = function(id: string) {
        if (id === 'worker_threads') {
            return {};
        }
        return originalRequire(id);
    };
} else {
    (globalThis as any).require = function(id: string) {
        if (id === 'worker_threads') {
            return {};
        }
        throw new Error(`Module not found: ${id}`);
    };
}

// 3. 在 window 上也注入（某些库会检查 window.require）
if (typeof window !== 'undefined') {
    if (typeof (window as any).require === 'undefined') {
        (window as any).require = (globalThis as any).require;
    }
}

// 4. 禁用 ONNX Runtime 的多线程特性
if (typeof window !== 'undefined') {
    (window as any).ortWasmThreaded = false;
}

console.log('[Baize Polyfill] worker_threads polyfill injected');
