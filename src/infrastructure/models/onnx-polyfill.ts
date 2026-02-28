/**
 * ONNX Runtime Polyfill for Obsidian
 *
 * 必须在任何 ONNX 代码加载前执行，防止尝试加载 worker_threads 模块
 */

// 1. 拦截动态 import('worker_threads')
const originalImport = (globalThis as any).import;
if (originalImport) {
    (globalThis as any).import = function(specifier: string) {
        if (specifier === 'worker_threads') {
            return Promise.resolve({});
        }
        return originalImport.call(this, specifier);
    };
}

// 2. 拦截 require('worker_threads')
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

// 3. 配置 ONNX Runtime 环境（在模块加载前）
// 这会在 onnxruntime-web 初始化时被读取
if (typeof window !== 'undefined') {
    (window as any).ortWasmThreaded = false; // 禁用多线程 WASM
}

export function configureOnnxRuntime(wasmPath?: string) {
    // 这个函数会在 loadModel 时被调用，确保配置生效
    if (typeof window !== 'undefined') {
        const w = window as any;

        // 强制使用非多线程版本
        if (w.ort) {
            w.ort.env = w.ort.env || {};
            w.ort.env.wasm = w.ort.env.wasm || {};
            w.ort.env.wasm.numThreads = 1;
            w.ort.env.wasm.proxy = false;

            if (wasmPath) {
                w.ort.env.wasm.wasmPaths = wasmPath;
            }
        }
    }
}
