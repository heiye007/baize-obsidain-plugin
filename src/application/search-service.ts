/**
 * 白泽 Baize - 语义搜索服务
 * 
 * 职责：
 * 1. 接收用户的自然语言查询
 * 2. 将查询转换为向量（使用与索引相同的模型）
 * 3. 在向量数据库中执行相似度搜索
 * 4. 过滤结果、排序并处理高亮显示
 */
import type { ONNXEmbedder } from "../infrastructure/models/onnx-embedder";
import type { LanceAdapter } from "../infrastructure/database/lance-adapter";
import type { ModelManager } from "../infrastructure/models/model-manager";
import type { SearchResult } from "../domain/models/search-result";
import type { Logger } from "../shared/logger";

export interface SearchOptions {
    topK?: number;
    minScore?: number;
    includeHighlights?: boolean;
}

export class SearchService {
    private embedder: ONNXEmbedder;
    private db: LanceAdapter;
    private modelManager: ModelManager;
    private logger: Logger;

    constructor(
        embedder: ONNXEmbedder,
        db: LanceAdapter,
        modelManager: ModelManager,
        logger: Logger
    ) {
        this.embedder = embedder;
        this.db = db;
        this.modelManager = modelManager;
        this.logger = logger;
    }

    async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
        const {
            topK = 10,
            minScore = 0.3,
            includeHighlights = true
        } = options;

        if (!query || query.trim().length === 0) return [];

        try {
            // 1. 确保模型已就绪
            const recommendedModel = this.modelManager.getRecommendedModelId();
            if (!this.modelManager.isReady(recommendedModel)) {
                this.logger.warn("[Search] Model not ready correctly. Attempting to load...");
                await this.modelManager.prepareModel(recommendedModel);
            }

            // 2. 将查询文本向量化
            this.logger.debug(`[Search] Vectorizing query: "${query}"`);
            const queryVector = await this.embedder.embed(query);

            // 3. 执行搜索并处理结果
            let results = await this.searchByVector(queryVector, topK, minScore);

            // 4. 高亮处理
            if (includeHighlights) {
                results = this.applyHighlights(query, results);
            }

            return results;

        } catch (err) {
            this.logger.error(`[Search] Semantic search failed:`, err);
            throw err;
        }
    }

    /**
     * 直接通过向量执行搜索
     */
    async searchByVector(vector: number[], topK: number = 10, minScore: number = 0.3): Promise<SearchResult[]> {
        try {
            let results = await this.db.search(vector, topK, minScore);
            return results.sort((a, b) => b.score - a.score);
        } catch (err) {
            this.logger.error(`[Search] Search by vector failed:`, err);
            throw err;
        }
    }

    /**
     * 为搜索结果添加简单的关键词高亮
     * 注：语义搜索匹配的是意义，这里仅作为 UI 增强，高亮查询中出现的显式词汇
     */
    private applyHighlights(query: string, results: SearchResult[]): SearchResult[] {
        // 提取查询中的关键词（简单分词：空格、标点）
        const words = query.toLowerCase()
            .split(/[\s,，.。!！?？;；:：]+/)
            .filter(w => w.length > 1); // 忽略单字，减少干扰

        if (words.length === 0) return results;

        return results.map(res => {
            const text = res.chunk.text;
            const textLower = text.toLowerCase();
            const highlights: { text: string; positions: [number, number][] }[] = [];

            for (const word of words) {
                let pos = textLower.indexOf(word);
                const wordPositions: [number, number][] = [];

                while (pos !== -1) {
                    wordPositions.push([pos, pos + word.length]);
                    pos = textLower.indexOf(word, pos + word.length);
                }

                if (wordPositions.length > 0) {
                    highlights.push({
                        text: word,
                        positions: wordPositions
                    });
                }
            }

            return {
                ...res,
                highlights: highlights.length > 0 ? highlights : undefined
            };
        });
    }
}
