/**
 * 白泽 Baize - 领域模型：文件 (File) 聚合根
 * 
 * 维护文件的索引状态及其下属的分块
 */
import type { TFile } from "obsidian";
import type { BaizeChunk } from "./baize-chunk";

/** 文件索引状态 */
export type IndexStatus = "none" | "pending" | "indexed" | "error" | "stale";

export class BaizeFile {
    /** 文件路径（相对于 Vault 根） */
    readonly path: string;

    /** 文件名 */
    readonly name: string;

    /** 对应的 Obsidian TFile 引用（可能为 null，如果是已删除的文件） */
    readonly tfile: TFile | null;

    /** 索引状态 */
    status: IndexStatus = "none";

    /** 错误信息（如果状态为 error） */
    error?: string;

    /** 文件最后修改时间（用于判断索引是否过期） */
    mtime: number;

    /** 文件大小 */
    size: number;

    /** 文件的所有分块 */
    chunks: BaizeChunk[] = [];

    constructor(tfile: TFile) {
        this.path = tfile.path;
        this.name = tfile.name;
        this.tfile = tfile;
        this.mtime = tfile.stat.mtime;
        this.size = tfile.stat.size;
    }

    /** 判断索引是否过期 */
    isStale(currentMtime: number): boolean {
        return this.mtime < currentMtime;
    }

    /** 标记为处理中 */
    markAsPending(): void {
        this.status = "pending";
        this.error = undefined;
    }

    /** 标记为已完成并更新分块集合 */
    markAsIndexed(chunks: BaizeChunk[]): void {
        this.status = "indexed";
        this.error = undefined;
        this.chunks = chunks;
    }

    /** 设置/更新分块集合 */
    setChunks(chunks: BaizeChunk[]): void {
        this.chunks = chunks;
    }

    /** 获取分块总数 */
    get chunkCount(): number {
        return this.chunks.length;
    }

    /** 标记为失败 */
    markAsError(message: string): void {
        this.status = "error";
        this.error = message;
    }
}
