/**
 * 白泽 Baize - Worker 客户端
 * 
 * 在主线程运行，封装与 Web Worker 的通信过程。
 * 实现了 IEmbedder 接口。
 */
import type { IEmbedder } from "../../domain/interfaces/embedder";
import { WorkerMessageType } from "./protocol";
import type { WorkerRequest, WorkerResponse } from "./protocol";

export class EmbeddingWorkerClient implements IEmbedder {
    private worker: Worker;
    private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();
    private progressCallback?: (progress: number, status: string) => void;

    constructor(workerPath: string) {
        // Obsidian 的沙箱环境禁止跨 origin 加载 Worker 脚本，
        // 使用 Blob URL + importScripts 绕过此限制
        const blob = new Blob(
            [`importScripts(${JSON.stringify(workerPath)});`],
            { type: "application/javascript" }
        );
        const blobUrl = URL.createObjectURL(blob);
        this.worker = new Worker(blobUrl);
        this.worker.onmessage = this.handleMessage.bind(this);
        this.worker.onerror = (err) => {
            console.error("Embedding Worker Error:", err);
        };
    }

    /** 设置模型加载进度回调 */
    onProgress(callback: (progress: number, status: string) => void) {
        this.progressCallback = callback;
    }

    async loadModel(modelName: string, options?: { quantized?: boolean, cacheDir?: string }): Promise<void> {
        return this.sendRequest(WorkerMessageType.INIT, { modelName, ...options });
    }

    async embed(text: string): Promise<number[]> {
        return this.sendRequest(WorkerMessageType.EMBED, { text });
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        return this.sendRequest(WorkerMessageType.EMBED_BATCH, { texts });
    }

    async unloadModel(): Promise<void> {
        return this.sendRequest(WorkerMessageType.UNLOAD);
    }

    getMemoryUsage(): number {
        // Worker 内存占用主线程无法直接获取，且该属性在 IEmbedder 中仅作参考
        return 0;
    }

    /** 发送请求并返回 Promise */
    private sendRequest(type: WorkerMessageType, payload?: any): Promise<any> {
        const id = Math.random().toString(36).substring(2, 11);
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            const request: WorkerRequest = { id, type, payload };
            this.worker.postMessage(request);
        });
    }

    /** 处理来自 Worker 的消息 */
    private handleMessage(event: MessageEvent<WorkerResponse>) {
        const { id, type, payload, error } = event.data;

        if (type === WorkerMessageType.PROGRESS) {
            this.progressCallback?.(payload.progress, payload.status);
            return;
        }

        const pending = this.pendingRequests.get(id);
        if (!pending) return;

        if (error) {
            pending.reject(new Error(error));
        } else {
            pending.resolve(payload);
        }

        this.pendingRequests.delete(id);
    }

    /** 彻底销毁 Worker */
    terminate() {
        this.worker.terminate();
        this.pendingRequests.forEach(p => p.reject(new Error("Worker terminated")));
        this.pendingRequests.clear();
    }
}
