/**
 * 白泽 Baize - 默认配置与设置校验
 */

/** 插件设置接口 */
export interface BaizeSettings {
    // ── 模型设置 ──
    /** Embedding 模型 ID (HuggingFace 格式) */
    embeddingModel: string;
    /** 模型推理精度 */
    modelPrecision: "auto" | "fp16" | "q4";

    // ── LLM 设置 ──
    /** LLM 提供商 */
    llmProvider: "deepseek" | "openai" | "ollama" | "custom";
    /** API 密钥 */
    apiKey: string;
    /** API 基础 URL */
    apiBaseUrl: string;
    /** 对话使用的模型名称 */
    chatModel: string;

    // ── 索引设置 ──
    /** 排除的文件/目录路径 (glob 模式) */
    excludePaths: string[];
    /** 文本分块策略 */
    chunkStrategy: "heading" | "fixed" | "semantic";
    /** 每个分块的最大 Token 数 */
    maxChunkTokens: number;
    /** 移动端索引触发策略 */
    mobileIndexMode: "auto" | "charging" | "manual";

    // ── 搜索设置 ──
    /** 返回结果数量 (Top-K) */
    topK: number;
    /** 最低相似度阈值 (0.0 - 1.0) */
    minScore: number;

    // ── 高级设置 ──
    /** Web Worker 线程数 (0 为自动) */
    workerCount: number;
    /** 日志打印级别 */
    logLevel: "debug" | "info" | "warn" | "error";
    /** 上次打开的选项卡 ID */
    lastActiveTab?: string;
}

/** 默认设置值 */
export const DEFAULT_SETTINGS: BaizeSettings = {
    embeddingModel: "Xenova/all-MiniLM-L6-v2",
    modelPrecision: "auto",
    llmProvider: "deepseek",
    apiKey: "",
    apiBaseUrl: "https://api.deepseek.com/v1",
    chatModel: "deepseek-chat",
    excludePaths: [],
    chunkStrategy: "heading",
    maxChunkTokens: 512,
    mobileIndexMode: "auto",
    topK: 10,
    minScore: 0.3,
    workerCount: 0,
    logLevel: "info",
    lastActiveTab: "search"
};

/**
 * 校验并修复设置项
 * 确保配置值在合理范围内，类型正确
 * 
 * @param settings - 待校验的原始设置对象
 * @returns 校验通过后的完整设置对象
 */
export function validateSettings(settings: any): BaizeSettings {
    const validated = { ...DEFAULT_SETTINGS, ...settings };

    // 1. 类型转换与范围校验 (数值型)

    // 分块大小: 必须大于 0，通常不建议超过 2048
    if (typeof validated.maxChunkTokens !== "number" || isNaN(validated.maxChunkTokens) || validated.maxChunkTokens <= 0) {
        validated.maxChunkTokens = DEFAULT_SETTINGS.maxChunkTokens;
    } else if (validated.maxChunkTokens > 4096) {
        validated.maxChunkTokens = 4096;
    }

    // Top-K: 1 到 100 之间
    if (typeof validated.topK !== "number" || isNaN(validated.topK) || validated.topK < 1) {
        validated.topK = DEFAULT_SETTINGS.topK;
    } else if (validated.topK > 100) {
        validated.topK = 100;
    }

    // 相似度分数: 0.0 到 1.0 之间
    if (typeof validated.minScore !== "number" || isNaN(validated.minScore)) {
        validated.minScore = DEFAULT_SETTINGS.minScore;
    } else {
        validated.minScore = Math.max(0, Math.min(1, validated.minScore));
    }

    // Worker 数量: 桌面端 0-32，移动端通常为 1
    if (typeof validated.workerCount !== "number" || isNaN(validated.workerCount) || validated.workerCount < 0) {
        validated.workerCount = DEFAULT_SETTINGS.workerCount;
    } else if (validated.workerCount > 32) {
        validated.workerCount = 32;
    }

    // 2. 枚举值校验 (下拉框)

    const precisions = ["auto", "fp16", "q4"];
    if (!precisions.includes(validated.modelPrecision)) {
        validated.modelPrecision = DEFAULT_SETTINGS.modelPrecision;
    }

    const providers = ["deepseek", "openai", "ollama", "custom"];
    if (!providers.includes(validated.llmProvider)) {
        validated.llmProvider = DEFAULT_SETTINGS.llmProvider;
    }

    const strategies = ["heading", "fixed", "semantic"];
    if (!strategies.includes(validated.chunkStrategy)) {
        validated.chunkStrategy = DEFAULT_SETTINGS.chunkStrategy;
    }

    const mobileModes = ["auto", "charging", "manual"];
    if (!mobileModes.includes(validated.mobileIndexMode)) {
        validated.mobileIndexMode = DEFAULT_SETTINGS.mobileIndexMode;
    }

    const logLevels = ["debug", "info", "warn", "error"];
    if (!logLevels.includes(validated.logLevel)) {
        validated.logLevel = DEFAULT_SETTINGS.logLevel;
    }

    // 3. 数组与字符串处理

    if (!Array.isArray(validated.excludePaths)) {
        validated.excludePaths = DEFAULT_SETTINGS.excludePaths;
    } else {
        // 过滤空字符串并去重
        validated.excludePaths = [...new Set(validated.excludePaths.map((p: string) => p.trim()).filter(Boolean))];
    }

    if (typeof validated.apiKey !== "string") {
        validated.apiKey = DEFAULT_SETTINGS.apiKey;
    }

    if (typeof validated.apiBaseUrl !== "string") {
        validated.apiBaseUrl = DEFAULT_SETTINGS.apiBaseUrl;
    } else if (validated.apiBaseUrl && !validated.apiBaseUrl.startsWith("http")) {
        // 修正 URL 格式 (简单检查)
        if (!validated.apiBaseUrl.startsWith("/")) {
            validated.apiBaseUrl = "http://" + validated.apiBaseUrl;
        }
    }

    return validated;
}
