/**
 * 白泽 Baize - 常量定义
 */
import type { BaizeSettings } from "./types";

/** 插件 ID */
export const PLUGIN_ID = "baize-obsidian-plugin";

/** 侧边栏视图类型 */
export const VIEW_TYPE_BAIZE = "baize-sidebar-view";

/** 插件数据目录 (相对于 .obsidian/plugins/) */
export const DATA_DIR = `${PLUGIN_ID}`;

/** 向量数据库路径 */
export const LANCE_DB_PATH = `${DATA_DIR}/data.lance`;

/** 模型缓存路径 */
export const MODEL_CACHE_PATH = `${DATA_DIR}/cache`;

/** 默认设置 */
export const DEFAULT_SETTINGS: BaizeSettings = {
    embeddingModel: "Xenova/all-MiniLM-L6-v2",
    modelPrecision: "auto",
    llmProvider: "deepseek",
    apiKey: "",
    apiBaseUrl: "",
    chatModel: "deepseek-chat",
    excludePaths: [],
    chunkStrategy: "heading",
    maxChunkTokens: 512,
    mobileIndexMode: "auto",
    topK: 10,
    minScore: 0.3,
    workerCount: 0, // 0 = auto
    logLevel: "info",
};
