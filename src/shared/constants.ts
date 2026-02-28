/**
 * 白泽 Baize - 常量定义
 */

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

/** 预设 Embedding 模型列表 */
export const EMBEDDING_MODELS = [
    { id: "Xenova/all-MiniLM-L6-v2", name: "all-MiniLM-L6-v2 (通用/英文/极其轻量)" },
    { id: "Xenova/bge-small-zh-v1.5", name: "bge-small-zh-v1.5 (中文/极其轻量)" },
    { id: "Xenova/bge-base-zh-v1.5", name: "bge-base-zh-v1.5 (中文/平衡)" },
    { id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2", name: "multilingual-MiniLM (多语言/轻量)" },
    { id: "Xenova/nomic-embed-text-v1.5", name: "nomic-embed-text-v1.5 (高上下文/需高内存)" },
];
