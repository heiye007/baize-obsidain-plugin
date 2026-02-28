/**
 * 白泽 Baize - Embedding Web Worker
 * 
 * 运行在独立线程，负责加载大模型并进行数学运算。
 * 避免阻塞 Obsidian 主 UI 进程。
 */
import { pipeline, env } from '@huggingface/transformers';
import { WorkerMessageType } from './protocol';
import type { WorkerRequest, WorkerResponse } from './protocol';

// 配置环境变量
env.allowLocalModels = false; // 先允许从 HuggingFace 远程加载，后续可优化为本地
env.useBrowserCache = true;

let extractor: any = null;

/**
 * 处理消息
 */
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const { id, type, payload } = event.data;

    try {
        switch (type) {
            case WorkerMessageType.INIT:
                await initModel(id, payload);
                break;

            case WorkerMessageType.EMBED:
                await embed(id, payload.text);
                break;

            case WorkerMessageType.EMBED_BATCH:
                await embedBatch(id, payload.texts);
                break;

            case WorkerMessageType.UNLOAD:
                extractor = null;
                sendResponse(id, WorkerMessageType.RESULT, null);
                break;
        }
    } catch (err) {
        sendResponse(id, WorkerMessageType.ERROR, null, err instanceof Error ? err.message : String(err));
    }
};

/**
 * 初始化模型
 */
async function initModel(id: string, payload: { modelName: string, quantized?: boolean, cacheDir?: string }) {
    const { modelName, quantized = true } = payload;

    // 在 Blob Worker 上下文中，本地相对路径无法解析
    // 使用浏览器 Cache API 来持久化模型（env.useBrowserCache = true 已在顶部配置）
    env.allowLocalModels = false;

    // 关闭多线程模式，因为在 Electron 环境下可能会缺少 worker_threads 模块
    if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
    }

    extractor = await pipeline('feature-extraction', modelName, {
        dtype: quantized ? "q8" : "fp32",
        progress_callback: (p: any) => {
            sendResponse(id, WorkerMessageType.PROGRESS, {
                status: p.status,
                progress: p.progress,
                file: p.file
            });
        }
    });
    sendResponse(id, WorkerMessageType.RESULT, true);
}

/**
 * 单条嵌入
 */
async function embed(id: string, text: string) {
    if (!extractor) throw new Error("Model not initialized");

    const output = await extractor(text, { pooling: 'mean', normalize: true });
    sendResponse(id, WorkerMessageType.RESULT, Array.from(output.data));
}

/**
 * 批量嵌入
 */
async function embedBatch(id: string, texts: string[]) {
    if (!extractor) throw new Error("Model not initialized");

    // transformers.js 的 extractor 直接支持数组
    const results = [];
    for (const text of texts) {
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        results.push(Array.from(output.data));
    }
    sendResponse(id, WorkerMessageType.RESULT, results);
}

/**
 * 发送响应给主线程
 */
function sendResponse(id: string, type: WorkerMessageType, payload: any, error?: string) {
    const response: WorkerResponse = { id, type, payload, error };
    self.postMessage(response);
}
