/**
 * 白泽 Baize - 全局类型定义
 */

/** 运行平台 */
export type PlatformType = "desktop" | "android" | "ios";

/** 索引状态 */
export type IndexStatus = "idle" | "indexing" | "complete" | "error";

/** 插件设置 */
export interface BaizeSettings {
    // ── 模型设置 ──
    embeddingModel: string;
    modelPrecision: "auto" | "fp16" | "q4";

    // ── LLM 设置 ──
    llmProvider: "deepseek" | "openai" | "ollama" | "custom";
    apiKey: string;
    apiBaseUrl: string;
    chatModel: string;

    // ── 索引设置 ──
    excludePaths: string[];
    chunkStrategy: "heading" | "fixed" | "semantic";
    maxChunkTokens: number;
    mobileIndexMode: "auto" | "charging" | "manual";

    // ── 搜索设置 ──
    topK: number;
    minScore: number;

    // ── 高级设置 ──
    workerCount: number;
    logLevel: "debug" | "info" | "warn" | "error";
}
