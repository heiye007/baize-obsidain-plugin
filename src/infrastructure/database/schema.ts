/**
 * 白泽 Baize - 向量表 Schema 定义
 * 
 * LanceDB 采用 Apache Arrow 列式存储格式
 * 本文件定义向量索引的表结构和相关类型
 */

/** 向量记录（一个文本分块的完整索引数据） */
export interface VectorRecord {
    /** 唯一标识：`${file_path}::${chunk_index}` */
    id: string;

    /** 源文件路径（相对于 Vault 根） */
    file_path: string;

    /** 分块序号（同一文件内从 0 开始） */
    chunk_index: number;

    /** 分块原文 */
    text: string;

    /** 嵌入向量（维度取决于模型，MiniLM = 384） */
    vector: number[];

    /** 结构化元数据 */
    metadata: ChunkMetadata;

    /** 最后更新时间（ISO 8601 字符串） */
    updated_at: string;
}

/** 分块元数据 */
export interface ChunkMetadata {
    /** 文件标题（frontmatter title 或文件名） */
    title: string;

    /** 所属标题层级路径，如 ["# 章节", "## 小节"] */
    headings: string[];

    /** 文件标签 */
    tags: string[];

    /** 文件大小（字节） */
    file_size: number;

    /** 文件最后修改时间（毫秒时间戳） */
    file_mtime: number;
}

/** 搜索结果 */
export interface SearchResult {
    /** 匹配的向量记录 */
    record: VectorRecord;

    /** 相似度分数 (0.0 ~ 1.0，越高越相似) */
    score: number;

    /** 距离（L2 或 cosine 距离，越小越相似） */
    distance: number;
}

/** 索引统计信息 */
export interface IndexStats {
    /** 总向量记录数 */
    totalRecords: number;

    /** 已索引的文件数 */
    totalFiles: number;

    /** 向量维度 */
    dimensions: number;

    /** 数据库大小（字节） */
    dbSizeBytes: number;

    /** 最近一次索引更新时间 */
    lastUpdated: string | null;
}

/** LanceDB 表名称 */
export const LANCE_TABLE_NAME = "baize_vectors";

/** 支持的向量维度映射（模型名 → 维度） */
export const MODEL_DIMENSIONS: Record<string, number> = {
    "Xenova/all-MiniLM-L6-v2": 384,
    "Xenova/all-MiniLM-L12-v2": 384,
    "Xenova/bge-small-en-v1.5": 384,
    "Xenova/bge-base-en-v1.5": 768,
    "Xenova/multilingual-e5-small": 384,
};
