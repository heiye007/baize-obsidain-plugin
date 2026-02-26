/**
 * 白泽 Baize - 领域模型：分块 (Chunk)
 * 
 * 代表文件中的一段文本及其在索引中的元数据
 */
import type { ChunkMetadata } from "../../infrastructure/database/schema";

export interface BaizeChunk {
    /** 在文件内的唯一序号 */
    index: number;

    /** 分块原文内容 */
    text: string;

    /** 在源文件中的字符起始偏移量 */
    offsetStart: number;

    /** 在源文件中的字符结束偏移量 */
    offsetEnd: number;

    /** 起始行号 (1-indexed) */
    lineStart: number;

    /** 结束行号 (1-indexed) */
    lineEnd: number;

    /** 
     * 关联的向量 ID 
     * 格式: `${filePath}::${index}`
     */
    vectorId: string;

    /** 该分块的继承元数据（标题路径、标签等） */
    metadata: ChunkMetadata;
}
