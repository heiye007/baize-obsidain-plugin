/**
 * 白泽 Baize - 内联 Embedder（主线程）
 *
 * 直接在主线程中运行 @xenova/transformers pipeline，
 * 避免 Web Worker + Blob URL + ONNX Runtime 在 Obsidian Electron 环境中的兼容性问题。
 *
 * transformers.js 内部使用 WASM 异步执行，不会完全阻塞 UI。
 * 每次 embedBatch 批处理间会 yield 控制权给主线程。
 */
import type { IEmbedder } from "../../domain/interfaces/embedder";
import type { Logger } from "../../shared/logger";
import { pipeline, env } from "@huggingface/transformers";

export class InlineEmbedder implements IEmbedder {
    private extractor: any = null;
    private currentModel: string | null = null;
    private logger: Logger;
    private onProgress?: (progress: number) => void;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * 加载模型（直接在主线程）
     * @param pluginResourcePath - 插件资源目录的 URL（用于定位 ONNX WASM 文件）
     */
    async loadModel(
        modelId: string,
        options?: { quantized?: boolean; cacheDir?: string; pluginResourcePath?: string },
        onProgress?: (progress: number) => void
    ): Promise<void> {
        if (this.currentModel === modelId && this.extractor) return;

        this.onProgress = onProgress;
        this.logger.info(`[InlineEmbedder] 正在加载模型: ${modelId}...`);

        // 配置 transformers 环境
        env.allowLocalModels = false;
        env.useBrowserCache = true;

        // 【关键修复】强制禁用 ONNX Runtime 的多线程特性
        // 这会防止尝试加载 worker_threads
        if (env.backends?.onnx?.wasm) {
            const wasm = env.backends.onnx.wasm as any;
            wasm.numThreads = 1;
            wasm.proxy = false;

            // 配置 WASM 文件路径
            if (options?.pluginResourcePath) {
                const cleanPath = options.pluginResourcePath.split("?")[0];
                const wasmPath = cleanPath.endsWith("/") ? cleanPath : cleanPath + "/";
                wasm.wasmPaths = wasmPath;
                this.logger.info(`[InlineEmbedder] ONNX WASM 路径已配置: ${wasmPath}`);
            }

            this.logger.info(`[InlineEmbedder] ONNX Runtime 配置完成: numThreads=1, proxy=false`);
        }

        const quantized = options?.quantized ?? false;

        this.logger.info(`[InlineEmbedder] 开始加载 pipeline...`);

        this.extractor = await pipeline("feature-extraction", modelId, {
            dtype: quantized ? "q8" : "fp32",
            progress_callback: (p: any) => {
                if (p.progress !== undefined) {
                    this.onProgress?.(Math.round(p.progress));
                }
            },
        });

        this.currentModel = modelId;
        this.logger.info(`[InlineEmbedder] 模型加载完成: ${modelId}`);
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
     * 批量生成文本向量（每条之间 yield 主线程）
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

            // 每 5 条 yield 一次控制权，避免长时间冻结 UI
            if (i % 5 === 4) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }
        return results;
    }

    async unloadModel(): Promise<void> {
        this.extractor = null;
        this.currentModel = null;
    }

    getMemoryUsage(): number {
        return 0;
    }
}
