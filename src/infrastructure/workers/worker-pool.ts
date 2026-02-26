/**
 * 白泽 Baize - Web Worker 线程池
 * 
 * 管理多个 EmbeddingWorker 实例，实现任务分发与负载均衡。
 * 在桌面端可以开启多个线程提高预估效率。
 */
import { EmbeddingWorkerClient } from "./worker-client";
import { isMobile } from "../platform/platform-detect";

export class EmbeddingWorkerPool {
    private workers: EmbeddingWorkerClient[] = [];
    private taskQueue: { task: any; resolve: Function; reject: Function }[] = [];
    private idleWorkers: EmbeddingWorkerClient[] = [];
    private workerPath: string;
    private maxWorkers: number;
    private isInitialized = false;

    constructor(workerPath: string, maxWorkers?: number) {
        this.workerPath = workerPath;
        // 移动端默认 1 个，桌面端默认 2 或硬件核心数的一半
        this.maxWorkers = maxWorkers || (isMobile() ? 1 : Math.min(navigator.hardwareConcurrency || 2, 4));
    }

    /** 初始化线程池 */
    async init(modelName: string, options?: { quantized?: boolean, cacheDir?: string }, onProgress?: (progress: number, status: string) => void): Promise<void> {
        if (this.isInitialized) return;

        const initPromises = [];
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new EmbeddingWorkerClient(this.workerPath);
            if (i === 0 && onProgress) {
                // 仅第一个 worker 报告加载进度，避免进度条闪烁
                worker.onProgress(onProgress);
            }
            worker.loadModel(modelName, options).then(() => {
                this.idleWorkers.push(worker);
                this.processQueue();
            });
            this.workers.push(worker);
            initPromises.push(worker.loadModel(modelName, options));
        }

        await Promise.all(initPromises);
        this.isInitialized = true;
    }

    /** 提交单条嵌入任务 */
    async embed(text: string): Promise<number[]> {
        return new Promise((resolve, reject) => {
            this.taskQueue.push({
                task: { method: "embed", args: [text] },
                resolve,
                reject
            });
            this.processQueue();
        });
    }

    /** 提交批量嵌入任务（会自动拆分给不同 Worker） */
    async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length <= 1) return Promise.all(texts.map(t => this.embed(t)));

        // 如果文本非常多，可以考虑在这里进行更精细的分发
        // 目前简单处理：直接按需分配
        return Promise.all(texts.map(t => this.embed(t)));
    }

    /** 处理任务队列 */
    private async processQueue() {
        if (this.taskQueue.length === 0 || this.idleWorkers.length === 0) return;

        const worker = this.idleWorkers.shift()!;
        const { task, resolve, reject } = this.taskQueue.shift()!;

        try {
            let result;
            if (task.method === "embed") {
                result = await worker.embed(task.args[0]);
            } else {
                result = await worker.embedBatch(task.args[0]);
            }
            resolve(result);
        } catch (err) {
            reject(err);
        } finally {
            this.idleWorkers.push(worker);
            this.processQueue();
        }
    }

    /** 安全销毁所有 Worker */
    terminate() {
        this.workers.forEach(w => w.terminate());
        this.workers = [];
        this.idleWorkers = [];
        this.taskQueue.forEach(q => q.reject(new Error("Worker pool terminated")));
        this.taskQueue = [];
    }
}
