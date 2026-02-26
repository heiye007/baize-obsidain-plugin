/**
 * 白泽 Baize - 模型管理器
 * 
 * 负责不同平台下的模型选择、下载管理及本地缓存状态维护
 */
import { isMobile } from "../platform/platform-detect";
import type { EmbeddingWorkerPool } from "../workers/worker-pool";
import type { ModelInfo, DownloadStatus } from "./model-types";
import type { VaultStorage } from "../storage/vault-storage";
import type { Logger } from "../../shared/logger";

export class ModelManager {
    private workerPool: EmbeddingWorkerPool;
    private storage: VaultStorage;
    private logger: Logger;
    private cacheStatus: Map<string, boolean> = new Map();
    private statuses: Map<string, DownloadStatus> = new Map();

    constructor(workerPool: EmbeddingWorkerPool, storage: VaultStorage, logger: Logger) {
        this.workerPool = workerPool;
        this.storage = storage;
        this.logger = logger;
    }

    /** 
     * 获取模型缓存目录 
     * 通常位于: .obsidian/plugins/baize-obsidian-plugin/models/
     */
    getCacheDir(): string {
        return "models"; // 对应 storage.resolve("models")
    }

    /** 
     * 获取模型加载路径
     * 如果是离线模式/手动导入，则返回本地磁盘路径；
     * 否则返回 HuggingFace ID。
     */
    getModelPath(modelId: string): string {
        const info = this.getModelInfo(modelId);
        if (info?.localPath) {
            return info.localPath; // 离线/手动引用路径
        }
        return modelId; // 远程模型 ID
    }

    /** 获取当前推荐的模型 ID */
    getRecommendedModelId(): string {
        if (isMobile()) {
            return "Xenova/all-MiniLM-L6-v2";
        }
        return "Xenova/all-MiniLM-L6-v2";
    }

    /** 检查模型是否已缓存在本地文件夹 */
    async isCached(modelId: string): Promise<boolean> {
        return await this.storage.exists(`${this.getCacheDir()}/${modelId}`);
    }

    /** 检查模型是否已就绪（内存中已加载） */
    isReady(modelId: string): boolean {
        return this.statuses.get(modelId)?.status === "ready";
    }

    /** 获取下载/状态信息 */
    getStatus(modelId: string): DownloadStatus | undefined {
        return this.statuses.get(modelId);
    }

    /** 
     * 准备模型（下载并初始化）
     * 
     * @param modelId - 模型 ID
     * @param onProgress - 下载进度回调 (0-100)
     * @param maxRetries - 最大重试次数
     */
    async prepareModel(
        modelId: string,
        onProgress?: (progress: number) => void,
        maxRetries = 3
    ): Promise<void> {
        let attempt = 0;
        let lastError: any;

        // 初始化状态
        this.statuses.set(modelId, {
            modelId,
            progress: 0,
            status: "downloading"
        });

        while (attempt < maxRetries) {
            try {
                const actualPath = this.getModelPath(modelId);
                const quantized = isMobile(); // 移动端强制开启量化 (Q4/Q8)，桌面端默认 FP32/FP16
                const cacheDir = this.storage.resolve(this.getCacheDir());

                await this.workerPool.init(actualPath, { quantized, cacheDir }, (p) => {
                    this.statuses.set(modelId, {
                        modelId,
                        progress: p,
                        status: "downloading"
                    });
                    onProgress?.(p);
                });

                // 一旦 init 完成，标记为就绪
                this.statuses.set(modelId, {
                    modelId,
                    progress: 100,
                    status: "ready"
                });
                this.cacheStatus.set(modelId, true);
                return;
            } catch (err) {
                attempt++;
                lastError = err;

                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.warn(`[Baize] 模型下载失败，${delay}ms 后重试 (${attempt}/${maxRetries}):`, err);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        const errorMsg = `模型下载失败 (重试 ${maxRetries} 次): ${lastError instanceof Error ? lastError.message : String(lastError)}`;
        this.statuses.set(modelId, {
            modelId,
            progress: 0,
            status: "error",
            error: errorMsg
        });
        throw new Error(errorMsg);
    }

    /** 
     * 手动关联本地模型文件 (离线场景)
     * @param modelId - 模型库 ID
     * @param path - 本地文件夹绝对路径
     */
    async importModelManually(modelId: string, path: string): Promise<void> {
        const info = MODELS[modelId];
        if (!info) throw new Error(`Unknown model: ${modelId}`);

        // 记录本地路径，后续 prepareModel 会优先使用
        info.localPath = path;

        // 尝试初始化验证路径是否有效
        try {
            await this.prepareModel(modelId);
            this.logger_info(`Model ${modelId} manually linked to: ${path}`);
        } catch (err) {
            info.localPath = undefined;
            throw new Error(`Failed to link manually imported model: ${err}`);
        }
    }

    private logger_info(msg: string) {
        console.log(`[Baize Model] ${msg}`);
    }

    /** 
     * 清除模型缓存
     */
    async clearCache(): Promise<void> {
        const cacheDir = this.getCacheDir();
        this.logger.info(`Cleaning model cache: ${cacheDir}`);

        try {
            await this.storage.remove(cacheDir);
            // 标记所有模型为未缓存
            this.cacheStatus.clear();
            this.statuses.clear();
            this.logger.info("Model cache cleared successfully.");
        } catch (err) {
            this.logger.error("Failed to clear model cache:", err);
            throw err;
        }
    }

    /** 获取所有可用模型列表 */
    getAvailableModels(): ModelInfo[] {
        return Object.values(MODELS);
    }

    /** 获取模型元数据 */
    getModelInfo(modelId: string): ModelInfo | undefined {
        return MODELS[modelId];
    }
}

/** 预定义的可选模型 */
const MODELS: Record<string, ModelInfo> = {
    "Xenova/all-MiniLM-L6-v2": {
        id: "Xenova/all-MiniLM-L6-v2",
        name: "MiniLM-L6 (通用)",
        description: "最受欢迎的轻量级模型，性能与速度平衡，推荐使用。",
        dimensions: 384,
        sizeMB: 90,
        precision: "fp32"
    },
    "Xenova/bge-small-zh-v1.5": {
        id: "Xenova/bge-small-zh-v1.5",
        name: "BGE-Small (中文增强)",
        description: "针对中文检索优化的模型，适合中文文档较多的库。",
        dimensions: 512,
        sizeMB: 120,
        precision: "fp32"
    }
};
