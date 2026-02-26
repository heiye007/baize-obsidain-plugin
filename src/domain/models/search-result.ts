/**
 * 白泽 Baize - 领域模型：搜索结果 (Search Result)
 * 
 * 记录向量搜索返回的匹配分块及相关分数
 */
import type { BaizeChunk } from "./baize-chunk";

export interface SearchResult {
    /** 匹配到的文本分块 */
    chunk: BaizeChunk;

    /** 相似度分数 (0.0 ~ 1.0) */
    score: number;

    /** 距离（具体含义取决于度量方式，如 L2 或 Cosine） */
    distance: number;

    /** 搜索高亮片段（可选，用于 UI 显示） */
    highlights?: {
        text: string;
        positions: [number, number][];
    }[];
}
