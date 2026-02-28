/**
 * 白泽 Baize - 索引调度器
 * 
 * 职责：
 * 1. 订阅 EventBus 发出的文件变更事件
 * 2. 管理索引任务队列，确保任务有序执行且不冲突
 * 3. 协调 Chunker、Embedder 和 VectorDB 执行端到端索引
 * 4. 报告索引进度和状态
 */
import { App, TFile } from "obsidian";
import { EventBus, BaizeEvents } from "../shared/event-bus";
import type { IEmbedder } from "../domain/interfaces/embedder";
import type { Logger } from "../shared/logger";
import type { VectorRecord } from "../infrastructure/database/schema";
import { MarkdownChunker } from "../domain/chunking/markdown-chunker";

export class IndexScheduler {
    private app: App;
    private events: EventBus;
    private db: any; // IVectorStore
    private embedder: IEmbedder;
    private logger: Logger;
    private chunker: MarkdownChunker;
    private modelReady = false;

    private queue: string[] = [];
    private isBusy = false;

    constructor(
        app: App,
        events: EventBus,
        db: any,
        _modelManager: any, // 保留参数位以兼容现有调用
        embedder: IEmbedder,
        logger: Logger
    ) {
        this.app = app;
        this.events = events;
        this.db = db;
        this.embedder = embedder;
        this.logger = logger;
        this.chunker = new MarkdownChunker();

        this.setupSubscriptions();
    }

    /** 订阅来自 SyncService 或其他的事件 */
    private setupSubscriptions() {
        // 增量索引触发
        this.events.on(BaizeEvents.FILE_CHANGED, (path: unknown) => {
            this.addToQueue(path as string);
        });

        // 删除索引
        this.events.on(BaizeEvents.FILE_DELETED, (path: unknown) => {
            this.db.delete(path as string).catch((err: Error) =>
                this.logger.error(`[Index] Failed to delete index for ${path}`, err)
            );
        });

        // 重命名：LanceDB 目前需要先删后加
        this.events.on(BaizeEvents.FILE_RENAMED, async (oldPath: unknown, newPath: unknown) => {
            try {
                await this.db.delete(oldPath as string);
                this.addToQueue(newPath as string);
            } catch (err) {
                this.logger.error(`[Index] Failed to handle rename ${oldPath} -> ${newPath}`, err);
            }
        });

        // 如果模型加载完成，标记就绪并开启队列处理
        this.events.on(BaizeEvents.MODEL_READY, () => {
            this.modelReady = true;
            this.logger.info("[Index] 模型已就绪，开始处理索引队列...");
            this.processQueue();
        });
    }

    /** 
     * 执行全量同步
     * 找出库中所有 Markdown 并检查是否需要重新索引
     */
    async fullSync() {
        this.logger.info("Triggering full vault index scan...");
        const files = this.app.vault.getMarkdownFiles();

        // 目前简单处理：全部加入队列
        for (const file of files) {
            if (!this.queue.includes(file.path)) {
                this.queue.push(file.path);
            }
        }

        this.events.emit(BaizeEvents.INDEX_PROGRESS, 0, files.length);
        this.processQueue(files.length);
    }

    /** 加入待处理队列 */
    private addToQueue(path: string) {
        if (!this.queue.includes(path)) {
            this.queue.push(path);
        }
        this.processQueue();
    }

    /** 处理队列 */
    private async processQueue(totalForProgress?: number) {
        if (this.isBusy || this.queue.length === 0) return;

        // 检查模型是否准备好
        if (!this.modelReady) {
            this.logger.warn("[Index] Model not ready, indexing queue paused.");
            return;
        }

        this.isBusy = true;
        let processed = 0;
        const initialTotal = totalForProgress || this.queue.length;

        try {
            while (this.queue.length > 0) {
                const path = this.queue.shift()!;
                await this.indexFile(path);

                processed++;
                if (totalForProgress) {
                    this.events.emit(BaizeEvents.INDEX_PROGRESS, processed, initialTotal);
                }

                // 避免长时间占满主线程
                await new Promise(resolve => setTimeout(resolve, 30));
            }
        } catch (err) {
            this.events.emit(BaizeEvents.INDEX_ERROR, err);
        } finally {
            this.isBusy = false;
            this.events.emit(BaizeEvents.INDEX_COMPLETE);
            this.logger.info(`[Index] Indexing queue cleared. Processed ${processed} files.`);
        }
    }

    /** 对单个文件执行端到端索引流程 */
    private async indexFile(path: string) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return;

        try {
            // 1. 读取
            const content = await this.app.vault.read(file);
            const stats = file.stat;

            // 2. 提取元数据
            const cache = this.app.metadataCache.getFileCache(file);
            const title = cache?.frontmatter?.title || file.basename;
            const tags = (cache?.tags?.map(t => t.tag) || [])
                .concat(cache?.frontmatter?.tags || []);

            // 3. 分块
            const chunks = this.chunker.chunk(content, file.path, title);
            if (chunks.length === 0) {
                await this.db.delete(path);
                return;
            }

            // 4. 向量化
            this.logger.debug(`[Index] Embedding ${chunks.length} chunks for: ${path}`);
            const texts = chunks.map(c => c.text);
            const vectors = await this.embedder.embedBatch(texts);

            // 5. 入库
            const records: VectorRecord[] = chunks.map((chunk, i) => ({
                id: chunk.vectorId,
                file_path: path,
                chunk_index: i,
                text: chunk.text,
                vector: vectors[i],
                metadata: {
                    ...chunk.metadata,
                    tags,
                    file_size: stats.size,
                    file_mtime: stats.mtime
                },
                updated_at: new Date().toISOString()
            }));

            await this.db.upsert(records);

        } catch (err) {
            this.logger.error(`[Index] Failed to process ${path}:`, err);
        }
    }

    getStatus() {
        return {
            isBusy: this.isBusy,
            queueLength: this.queue.length
        };
    }
}
