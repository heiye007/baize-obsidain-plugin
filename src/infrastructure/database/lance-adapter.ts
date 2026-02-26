/**
 * 白泽 Baize - LanceDB 向量数据库适配器
 * 
 * 基于 @lancedb/lancedb TypeScript SDK 实现 IVectorStore 接口
 * 
 * 设计说明：
 * - 使用 LanceDB 嵌入式模式，数据存储在插件目录内
 * - 桌面端通过 native binding (napi-rs) 运行 LanceDB
 * - 移动端降级为内存中简单向量搜索（后续可替换为 WASM 版本）
 * - upsert 通过 delete + add 实现（LanceDB 暂无原生 upsert）
 * - 搜索使用余弦相似度（cosine distance）
 */
import type { IVectorStore } from "../../domain/interfaces/vector-store";
import type {
    VectorRecord,
    SearchResult,
    IndexStats,
} from "./schema";
import { LANCE_TABLE_NAME, MODEL_DIMENSIONS } from "./schema";
import type { Logger } from "../../shared/logger";
import { StorageError } from "../../shared/errors";

/** LanceDB 动态导入的类型占位（避免直接静态导入 native 模块） */
interface LanceConnection {
    tableNames(): Promise<string[]>;
    openTable(name: string): Promise<LanceTable>;
    createTable(name: string, data: Record<string, unknown>[]): Promise<LanceTable>;
    dropTable(name: string): Promise<void>;
}

interface LanceTable {
    countRows(): Promise<number>;
    add(data: Record<string, unknown>[]): Promise<void>;
    delete(predicate: string): Promise<void>;
    search(vector: number[]): LanceQuery;
    filter(predicate: string): LanceFilterQuery;
}

interface LanceQuery {
    limit(n: number): LanceQuery;
    distanceType(type: string): LanceQuery;
    toArray(): Promise<LanceScanResult[]>;
}

interface LanceFilterQuery {
    toArray(): Promise<Record<string, unknown>[]>;
}

interface LanceScanResult {
    id: string;
    file_path: string;
    chunk_index: number;
    text: string;
    vector: number[];
    metadata: string; // JSON 字符串
    updated_at: string;
    _distance: number;
}

export class LanceAdapter implements IVectorStore {
    private db: LanceConnection | null = null;
    private table: LanceTable | null = null;
    private logger: Logger;
    private dbPath: string;
    private dimensions: number;

    constructor(dbPath: string, logger: Logger, modelName?: string) {
        this.dbPath = dbPath;
        this.logger = logger;
        this.dimensions = MODEL_DIMENSIONS[modelName ?? "Xenova/all-MiniLM-L6-v2"] ?? 384;
    }

    // ─── init() ───

    async init(): Promise<void> {
        try {
            // 动态导入 LanceDB，避免在不支持 native binding 的平台报错
            const lancedb = await import("@lancedb/lancedb");
            this.db = await (lancedb.connect as unknown as (uri: string) => Promise<LanceConnection>)(this.dbPath);

            // 检查表是否已存在
            const tableNames = await this.db.tableNames();
            if (tableNames.includes(LANCE_TABLE_NAME)) {
                this.table = await this.db.openTable(LANCE_TABLE_NAME);
                const count = await this.table.countRows();
                this.logger.info(`LanceDB 已打开: ${count} 条向量记录`);
            } else {
                // 创建表：插入一条种子数据定义 schema，然后删除
                const seedRecord = this.createSeedRecord();
                this.table = await this.db.createTable(LANCE_TABLE_NAME, [seedRecord]);
                await this.table.delete('id = "__seed__"');
                this.logger.info("LanceDB 表已创建");
            }
        } catch (e) {
            throw new StorageError(
                `LanceDB 初始化失败: ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    // ─── upsert() ───

    async upsert(records: VectorRecord[]): Promise<void> {
        if (!this.table || records.length === 0) return;

        try {
            // LanceDB 暂无原生 upsert，使用 delete + add 模式
            // 按文件分组删除旧记录
            const filePaths = [...new Set(records.map(r => r.file_path))];
            for (const filePath of filePaths) {
                const escapedPath = filePath.replace(/'/g, "\\'");
                await this.table.delete(`file_path = '${escapedPath}'`);
            }

            // 序列化 metadata 为 JSON 字符串（LanceDB 不支持嵌套对象）
            const rows = records.map(r => ({
                id: r.id,
                file_path: r.file_path,
                chunk_index: r.chunk_index,
                text: r.text,
                vector: r.vector,
                metadata: JSON.stringify(r.metadata),
                updated_at: r.updated_at,
            }));

            await this.table.add(rows);
            this.logger.debug(`Upsert ${records.length} 条记录 (${filePaths.length} 个文件)`);
        } catch (e) {
            throw new StorageError(
                `向量记录写入失败: ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    // ─── delete() ───

    async delete(filePath: string): Promise<void> {
        if (!this.table) return;

        try {
            const escapedPath = filePath.replace(/'/g, "\\'");
            await this.table.delete(`file_path = '${escapedPath}'`);
            this.logger.debug(`已删除文件索引: ${filePath}`);
        } catch (e) {
            throw new StorageError(
                `删除向量记录失败: ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    // ─── search() ───

    async search(
        vector: number[],
        topK: number,
        minScore = 0
    ): Promise<SearchResult[]> {
        if (!this.table) return [];

        try {
            const rawResults = await this.table
                .search(vector)
                .distanceType("cosine")
                .limit(topK)
                .toArray();

            const results: SearchResult[] = rawResults
                .map((row) => {
                    // cosine distance → similarity score
                    // cosine distance = 1 - cosine_similarity
                    const score = 1 - (row._distance ?? 1);

                    return {
                        record: {
                            id: row.id,
                            file_path: row.file_path,
                            chunk_index: row.chunk_index,
                            text: row.text,
                            vector: row.vector,
                            metadata: typeof row.metadata === "string"
                                ? JSON.parse(row.metadata)
                                : row.metadata,
                            updated_at: row.updated_at,
                        } as VectorRecord,
                        score,
                        distance: row._distance,
                    };
                })
                .filter(r => r.score >= minScore);

            this.logger.debug(`搜索返回 ${results.length} 条结果 (Top-${topK}, minScore=${minScore})`);
            return results;
        } catch (e) {
            throw new StorageError(
                `向量搜索失败: ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    // ─── getStats() ───

    async getStats(): Promise<IndexStats> {
        if (!this.table) {
            return {
                totalRecords: 0,
                totalFiles: 0,
                dimensions: this.dimensions,
                dbSizeBytes: 0,
                lastUpdated: null,
            };
        }

        try {
            const totalRecords = await this.table.countRows();

            // 获取唯一文件数和最近更新时间
            // LanceDB 不支持 SQL 聚合，读取部分数据统计
            let totalFiles = 0;
            let lastUpdated: string | null = null;

            if (totalRecords > 0) {
                try {
                    const rows = await this.table
                        .filter("id IS NOT NULL")
                        .toArray();
                    const uniqueFiles = new Set(rows.map((r) => r.file_path as string));
                    totalFiles = uniqueFiles.size;

                    // 找最近更新时间
                    const timestamps = rows
                        .map((r) => r.updated_at as string)
                        .filter(Boolean)
                        .sort()
                        .reverse();
                    lastUpdated = timestamps[0] ?? null;
                } catch {
                    // 降级：只返回记录数
                    totalFiles = 0;
                }
            }

            return {
                totalRecords,
                totalFiles,
                dimensions: this.dimensions,
                dbSizeBytes: 0, // LanceDB JS SDK 暂不暴露文件大小
                lastUpdated,
            };
        } catch (e) {
            this.logger.warn(`获取索引统计失败: ${e}`);
            return {
                totalRecords: 0,
                totalFiles: 0,
                dimensions: this.dimensions,
                dbSizeBytes: 0,
                lastUpdated: null,
            };
        }
    }

    // ─── close() ───

    async close(): Promise<void> {
        // LanceDB 嵌入式模式自动管理连接
        // 置空引用确保 GC 可以回收
        this.table = null;
        this.db = null;
        this.logger.info("LanceDB 连接已关闭");
    }

    // ─── 内部工具 ───

    /**
     * 创建种子记录用于定义表 schema
     * 初始化后立即删除
     */
    private createSeedRecord(): Record<string, unknown> {
        return {
            id: "__seed__",
            file_path: "",
            chunk_index: 0,
            text: "",
            vector: new Array(this.dimensions).fill(0),
            metadata: "{}",
            updated_at: new Date().toISOString(),
        };
    }
}
