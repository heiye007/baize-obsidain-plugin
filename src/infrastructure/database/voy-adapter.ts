/**
 * 白泽 Baize - Voy 向量数据库适配器 (WASM)
 * 
 * 基于 voy-search 实现 IVectorStore 接口，用于移动端和 Web 环境
 * 
 * 设计说明：
 * - Voy 是一个轻量级、用 Rust 编写并编译为 WASM 的向量搜索引擎
 * - 数据持久化通过 Obsidian 的 Vault Adapter 实现（序列化为 JSON 存储）
 * - 适用于移动端（Android/iOS），无需 native binding
 */
// @ts-ignore
import voyWasmBinary from "voy-search/voy_search_bg.wasm";
// @ts-ignore
import * as voyModule from "voy-search/voy_search_bg.js";
const { Voy, __wbg_set_wasm } = voyModule as any;

import type { IVectorStore } from "../../domain/interfaces/vector-store";
import type { VectorRecord, IndexStats } from "./schema";
import type { SearchResult } from "../../domain/models/search-result";
import type { BaizeChunk } from "../../domain/models/baize-chunk";
import type { Logger } from "../../shared/logger";
import { StorageError } from "../../shared/errors";
import type { App } from "obsidian";

export class VoyAdapter implements IVectorStore {
    private voy: any = null;
    private logger: Logger;
    private app: App;
    private storagePath: string;
    private dimensions: number;

    // 内存中缓存原始记录，因为 Voy search 只返回 id, title, url
    // 我们需要完整的 VectorRecord 来返回给 UI
    private recordsMap: Map<string, VectorRecord> = new Map();

    constructor(app: App, logger: Logger, storagePath: string, dimensions = 384) {
        this.app = app;
        this.logger = logger;
        this.storagePath = storagePath;
        this.dimensions = dimensions;
    }

    async init(): Promise<void> {
        try {
            this.logger.info(`正在初始化 Voy WASM 模块...`);

            // 1. 手动链接 WASM 指令集与 JS 胶水代码
            // voyWasmBinary 是由 esbuild binary loader 提供给我们的 Uint8Array
            // 我们需要将 voyModule 中导出的 __wbg_* 等胶水函数注入给 WASM 模块
            const filteredImports: Record<string, any> = {};
            for (const key in voyModule) {
                if (key !== "default" && key !== "Voy") {
                    filteredImports[key] = (voyModule as any)[key];
                }
            }

            const wasmModule = await WebAssembly.instantiate(voyWasmBinary as any, {
                "./voy_search_bg.js": filteredImports
            });
            __wbg_set_wasm(wasmModule.instance.exports);

            this.logger.info(`Voy WASM 模块初始化成功`);

            this.logger.info(`正在加载 Voy 索引文件: ${this.storagePath}`);
            const adapter = this.app.vault.adapter;

            if (await adapter.exists(this.storagePath)) {
                const data = await adapter.read(this.storagePath);
                const parsed = JSON.parse(data);

                // Voy.deserialize 是静态方法
                if (parsed.voyData) {
                    this.voy = Voy.deserialize(parsed.voyData);
                } else {
                    this.voy = new Voy();
                }

                // 加载缓存的完整记录
                if (parsed.records) {
                    this.recordsMap = new Map(Object.entries(parsed.records));
                }
                this.logger.info(`Voy 已从本地下载加载: ${this.recordsMap.size} 条记录`);
            } else {
                this.voy = new Voy();
                this.logger.info("创建新的 Voy 索引");
            }
        } catch (e) {
            this.logger.error("Voy 初始化失败，使用空索引", e);
            // 这里我们不需要显式设置空索引，由调用方处理或后续尝试重连
            throw e;
        }
    }

    async upsert(records: VectorRecord[]): Promise<void> {
        if (!this.voy || records.length === 0) return;

        try {
            // 1. 先删除旧记录 (Voy 不需要显式 delete 如果 id 冲突，但为了保持一致性我们手动处理)
            const idsToRemove = records.map(r => r.id);
            this.voy.remove({
                embeddings: idsToRemove.map(id => ({ id, title: "", url: "", embeddings: [] }))
            });

            // 2. 添加新记录
            this.voy.add({
                embeddings: records.map(r => ({
                    id: r.id,
                    title: r.text.substring(0, 100), // 存储前100个字符作为预览
                    url: r.file_path,
                    embeddings: r.vector
                }))
            });

            // 3. 更新内存映射
            for (const r of records) {
                this.recordsMap.set(r.id, r);
            }

            // 4. 持久化
            await this.persist();
            this.logger.debug(`Voy Upsert 完成: ${records.length} 条记录`);
        } catch (e) {
            throw new StorageError(`Voy 写入失败: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    async delete(filePath: string): Promise<void> {
        if (!this.voy) return;

        try {
            // 找出该文件的所有记录
            const idsToRemove: string[] = [];
            for (const [id, record] of this.recordsMap.entries()) {
                if (record.file_path === filePath) {
                    idsToRemove.push(id);
                }
            }

            if (idsToRemove.length === 0) return;

            // 从 Voy 中删除
            this.voy.remove({
                embeddings: idsToRemove.map(id => ({ id, title: "", url: "", embeddings: [] }))
            });

            // 从映射中删除
            for (const id of idsToRemove) {
                this.recordsMap.delete(id);
            }

            await this.persist();
            this.logger.debug(`Voy 已删除文件索引: ${filePath} (${idsToRemove.length} 条记录)`);
        } catch (e) {
            throw new StorageError(`Voy 删除失败: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    async search(vector: number[], topK: number, minScore = 0): Promise<SearchResult[]> {
        if (!this.voy) return [];

        try {
            // Voy.search 接收 Float32Array
            const queryVector = new Float32Array(vector);
            const result = this.voy.search(queryVector, topK);

            const searchResults: SearchResult[] = [];

            for (const neighbor of result.neighbors) {
                const record = this.recordsMap.get(neighbor.id);
                if (!record) continue;

                // Voy 的 neighbor 对象中不直接包含 score，
                // 如果需要精确 score，可能需要手动计算余弦相似度，
                // 或者检查最新版 Voy 是否在 neighbor 中包含了距离。
                // 暂时假设 score 为 1.0 (Voy 返回的是最近邻，已经排序)

                // 简单的余弦相似度计算（如果 record.vector 存在）
                const score = this.calculateCosineSimilarity(vector, record.vector);

                if (score >= minScore) {
                    searchResults.push({
                        chunk: {
                            index: record.chunk_index,
                            text: record.text,
                            vectorId: record.id,
                            metadata: record.metadata,
                            offsetStart: 0,
                            offsetEnd: 0,
                            lineStart: 0,
                            lineEnd: 0,
                        } as BaizeChunk,
                        score: score,
                        distance: 1 - score, // 相似度分数为 0.9 则距离为 0.1
                    });
                }
            }

            return searchResults;
        } catch (e) {
            throw new StorageError(`Voy 搜索失败: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    async getStats(): Promise<IndexStats> {
        const totalRecords = this.recordsMap.size;
        const uniqueFiles = new Set(Array.from(this.recordsMap.values()).map(r => r.file_path));

        return {
            totalRecords,
            totalFiles: uniqueFiles.size,
            dimensions: this.dimensions,
            dbSizeBytes: 0, // 估算
            lastUpdated: new Date().toISOString()
        };
    }

    async close(): Promise<void> {
        await this.persist();
        this.voy = null;
        this.recordsMap.clear();
    }

    private async persist(): Promise<void> {
        if (!this.voy) return;
        try {
            const voyData = this.voy.serialize();
            const records = Object.fromEntries(this.recordsMap);
            const data = JSON.stringify({ voyData, records });
            await this.app.vault.adapter.write(this.storagePath, data);
        } catch (e) {
            this.logger.error("Voy 持久化失败", e);
        }
    }

    private calculateCosineSimilarity(v1: number[], v2: number[]): number {
        let dotProduct = 0;
        let mag1 = 0;
        let mag2 = 0;
        for (let i = 0; i < v1.length; i++) {
            dotProduct += v1[i] * v2[i];
            mag1 += v1[i] * v1[i];
            mag2 += v2[i] * v2[i];
        }
        return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
    }
}
