/**
 * 白泽 Baize - 知识联想服务
 * 
 * 职责：
 * 1. 监控 Obsidian 活动笔记切换
 * 2. 提取当前笔记的语义特征（向量化）
 * 3. 搜索库中相似的片段（跨文件联想）
 * 4. 防抖、缓存及结果推送
 */
import { App, TFile } from "obsidian";
import type { SearchService } from "./search-service";
import type { ONNXEmbedder } from "../infrastructure/models/onnx-embedder";
import { EventBus, BaizeEvents } from "../shared/event-bus";
import { MarkdownChunker } from "../domain/chunking/markdown-chunker";
import type { SearchResult } from "../domain/models/search-result";
import type { Logger } from "../shared/logger";

export class InsightService {
    private app: App;
    private searchService: SearchService;
    private embedder: ONNXEmbedder;
    private events: EventBus;
    private logger: Logger;
    private chunker: MarkdownChunker;

    // 状态管理
    private lastFilePath: string | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private cache: Map<string, SearchResult[]> = new Map();
    private maxCacheSize = 10;

    constructor(
        app: App,
        searchService: SearchService,
        embedder: ONNXEmbedder,
        events: EventBus,
        logger: Logger
    ) {
        this.app = app;
        this.searchService = searchService;
        this.embedder = embedder;
        this.events = events;
        this.logger = logger;
        this.chunker = new MarkdownChunker();
    }

    /** 注册活动窗口监听器 */
    setupListeners() {
        this.app.workspace.on("active-leaf-change", () => {
            const file = this.app.workspace.getActiveFile();
            if (file && file instanceof TFile && file.extension === "md") {
                this.handleFileChange(file);
            }
        });
        this.logger.info("InsightService: Registered active-leaf-change listener.");
    }

    /** 处理笔记切换 */
    private handleFileChange(file: TFile) {
        // 如果路径没变且缓存有效，直接推送缓存
        if (file.path === this.lastFilePath && this.cache.has(file.path)) {
            this.events.emit(BaizeEvents.INSIGHT_UPDATED, this.cache.get(file.path));
            return;
        }

        this.lastFilePath = file.path;

        // 防抖处理：切换笔记后 800ms 开始联想，避免快速扫屏时的计算浪费
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        this.debounceTimer = setTimeout(() => {
            this.generateInsights(file).catch(err => {
                this.logger.error(`[Insight] Failed to generate insights for ${file.path}:`, err);
            });
        }, 800);
    }

    /** 生成联想结果 */
    private async generateInsights(file: TFile) {
        try {
            const content = await this.app.vault.read(file);
            if (!content || content.trim().length < 10) return;

            // 1. 简易分块处理（取前 5 个分块，代表文章核心）
            const chunks = this.chunker.chunk(content, file.path, file.basename);
            const representativeChunks = chunks.slice(0, 5);

            if (representativeChunks.length === 0) return;

            // 2. 向量化并取平均向量（代表全文语义）
            const texts = representativeChunks.map(c => c.text);
            const vectors = await this.embedder.embedBatch(texts);

            // 计算平均向量
            const dims = vectors[0].length;
            const avgVector = new Array(dims).fill(0);
            for (const v of vectors) {
                for (let i = 0; i < dims; i++) {
                    avgVector[i] += v[i] / vectors.length;
                }
            }

            // 3. 搜索相关片段（调用 searchService.searchByVector）
            const rawResults = await this.searchService.searchByVector(avgVector, 10, 0.4);

            // 4. 过滤掉来自当前文件的片段
            const filteredResults = rawResults.filter(res => {
                const resPath = res.chunk.vectorId.split("::")[0];
                return resPath !== file.path;
            });

            // 5. 更新缓存与推送
            this.updateCache(file.path, filteredResults);
            this.events.emit(BaizeEvents.INSIGHT_UPDATED, filteredResults);

        } catch (err) {
            throw err;
        }
    }

    private updateCache(path: string, results: SearchResult[]) {
        this.cache.set(path, results);
        if (this.cache.size > this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
    }

    /** 清除所有联想缓存 */
    clearCache() {
        this.cache.clear();
        this.lastFilePath = null;
    }
}
