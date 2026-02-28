/**
 * Transformers.js Adapter for Obsidian
 *
 * 使用 @xenova/transformers (v2) 替代 @huggingface/transformers (v3)
 * 因为 v2 版本更稳定，对 Obsidian/Electron 环境的兼容性更好
 */
import type { IEmbedder } from "../../domain/interfaces/embedder";
import type { Logger } from "../../shared/logger";

export class TransformersAdapter implements IEmbedder {
    private extractor: any = null;
    private currentModel: string | null = null;
    private logger: Logger;
    private onProgress?: (progress: number) => void;
    private pipeline: any = null;
    private env: any = null;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * 加载模型
     */
    async loadModel(
        modelId: string,
        options?: { quantized?: boolean; cacheDir?: string; pluginResourcePath?: string },
        onProgress?: (progress: number) => void
    ): Promise<void> {
        if (this.currentModel === modelId && this.extractor) return;

        this.onProgress = onProgress;
        this.logger.info(`[TransformersAdapter] 正在加载模型: ${modelId}...`);

        try {
            // 使用 @xenova/transformers v2 (更稳定的版本)
            const transformers = await import("@xenova/transformers");
            this.pipeline = transformers.pipeline;
            this.env = transformers.env;

            // 配置环境
            this.env.allowLocalModels = false;
            this.env.useBrowserCache = true;

            // 关键：禁用多线程，避免 worker_threads
            if (this.env.backends?.onnx?.wasm) {
                this.env.backends.onnx.wasm.numThreads = 1;
                this.env.backends.onnx.wasm.proxy = false;
            }

            // 配置 WASM 路径
            if (options?.pluginResourcePath) {
                const cleanPath = options.pluginResourcePath.split("?")[0];
                const wasmPath = cleanPath.endsWith("/") ? cleanPath : cleanPath + "/";

                if (this.env.backends?.onnx?.wasm) {
                    this.env.backends.onnx.wasm.wasmPaths = wasmPath;
                }
                this.logger.info(`[TransformersAdapter] WASM 路径: ${wasmPath}`);
            }

            const quantized = options?.quantized ?? false;

            this.extractor = await this.pipeline("feature-extraction", modelId, {
                quantized: quantized,
                revision: "main",
                progress_callback: (p: any) => {
                    if (p.progress !== undefined) {
                        this.onProgress?.(Math.round(p.progress * 100));
                    }
                },
            });

            this.currentModel = modelId;
            this.logger.info(`[TransformersAdapter] 模型加载完成: ${modelId}`);
        } catch (err) {
            this.logger.error(`[TransformersAdapter] 模型加载失败:`, err);
            throw err;
        }
    }

    /**
     * 生成单条文本向量
     */
    async embed(text: string): Promise<number[]> {
        if (!this.extractor) {
            throw new Error("Model not loaded. Call loadModel() first.");
        }
        const output = await this.extractor(text, {
            pooling: "mean",
            normalize: true,
        });
        return Array.from(output.data);
    }

    /**
     * 批量生成文本向量
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        if (!this.extractor) {
            throw new Error("Model not loaded. Call loadModel() first.");
        }

        const results: number[][] = [];
        for (let i = 0; i < texts.length; i++) {
            const output = await this.extractor(texts[i], {
                pooling: "mean",
                normalize: true,
            });
            results.push(Array.from(output.data));

            // 每 5 条 yield 一次控制权
            if (i % 5 === 4) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }
        return results;
    }

    async unloadModel(): Promise<void> {
        this.extractor = null;
        this.currentModel = null;
        this.pipeline = null;
        this.env = null;
    }

    getMemoryUsage(): number {
        return 0;
    }
}
