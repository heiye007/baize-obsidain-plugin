/**
 * 白泽 Baize - 分块策略定义
 */

/** 分块策略枚举 */
export enum ChunkingStrategy {
    /** 固定长度分块：简单按字符数/Token数切分，带重叠度 */
    FIXED_LENGTH = "fixed_length",

    /** 标题层级分块：优先按 Markdown 标题 (# ## ###) 切分 */
    HEADING_SPLIT = "heading_split",

    /** 语义段落分块：按自然段落（两个换行符）切分 */
    SEMANTIC_PARAGRAPH = "semantic_paragraph",

    /** 混合分块：组合标题和长度限制（推荐方案） */
    HYBRID = "hybrid"
}

/** 分块配置项 */
export interface ChunkingOptions {
    /** 策略类型 */
    strategy: ChunkingStrategy;

    /** 目标分块大小（字符数或 Token 预估） */
    chunkSize: number;

    /** 重叠度（0.0 ~ 1.0），通常建议 0.1 ~ 0.2 */
    overlapThreshold: number;

    /** 最小分块保留大小（太小的块会被合并或丢弃） */
    minChunkSize: number;

    /** 是否保留 YAML frontmatter（通常设为 false） */
    keepFrontmatter: boolean;

    /** 是否解析 Obsidian 嵌入内容 ![[...]] */
    resolveEmbeds: boolean;
}

/** 默认分块配置 */
export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
    strategy: ChunkingStrategy.HYBRID,
    chunkSize: 500,
    overlapThreshold: 0.15,
    minChunkSize: 50,
    keepFrontmatter: false,
    resolveEmbeds: false,
};
