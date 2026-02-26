/**
 * 白泽 Baize - ONNX 嵌入引擎实现
 * 
 * 实现了 IEmbedder 接口，通过 Web Worker 线程池调用 transformers.js
 */
import type { IEmbedder } from "../../domain/interfaces/embedder";
import type { EmbeddingWorkerPool } from "../workers/worker-pool";

export class ONNXEmbedder implements IEmbedder {
    private pool: EmbeddingWorkerPool;
    private currentModel: string | null = null;

    constructor(pool: EmbeddingWorkerPool) {
        this.pool = pool;
    }

    /**
     * 加载模型（通过线程池分发到各线程）
     */
    async loadModel(modelId: string, options?: { quantized?: boolean, cacheDir?: string }): Promise<void> {
        if (this.currentModel === modelId) return;

        await this.pool.init(modelId, options);
        this.currentModel = modelId;
    }

    /**
     * 生成单条文本向量
     */
    async embed(text: string): Promise<number[]> {
        if (!this.currentModel) {
            throw new Error("Embedded model is not loaded. Call loadModel() first.");
        }
        return await this.pool.embed(text);
    }

    /**
     * 批量生成文本向量
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        if (!this.currentModel) {
            throw new Error("Embedded model is not loaded. Call loadModel() first.");
        }
        return await this.pool.embedBatch(texts);
    }

    /**
     * 卸载模型并释放所有 Worker 资源
     */
    async unloadModel(): Promise<void> {
        this.pool.terminate();
        this.currentModel = null;
    }

    /**
     * 获取内存消耗（估算）
     */
    getMemoryUsage(): number {
        // 由于计算在 Worker 中，主线程难以精确获取
        // 后续可以通过 Worker 返回的内存状态进行累计
        return 0;
    }
}
