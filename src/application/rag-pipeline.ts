/**
 * 白泽 Baize - RAG 对话管线
 * 
 * 职责：
 * 1. 协调“检索 (Retrieval)”与“生成 (Generation)”
 * 2. 构造增强后的 Prompt（上下文注入）
 * 3. 管理对话历史与 Token 限制
 * 4. 驱动 LLM 产生流式回答并解析引用
 */
import type { SearchService } from "./search-service";
import type { ILLMProvider, ChatMessage } from "../domain/interfaces/llm-provider";
import type { SearchResult } from "../domain/models/search-result";
import type { Logger } from "../shared/logger";

/** RAG 配置选项 */
export interface RAGOptions {
    model?: string;
    temperature?: number;
    topK?: number;
    maxHistoryRounds?: number;
    maxContextChars?: number;
}

export class RAGPipeline {
    private searchService: SearchService;
    private llmProvider: ILLMProvider;
    private logger: Logger;

    // 对话历史管理
    private history: ChatMessage[] = [];

    constructor(
        searchService: SearchService,
        llmProvider: ILLMProvider,
        logger: Logger
    ) {
        this.searchService = searchService;
        this.llmProvider = llmProvider;
        this.logger = logger;
    }

    /**
     * 发起 RAG 对话任务
     */
    async ask(
        question: string,
        onChunk: (text: string) => void,
        options: RAGOptions = {}
    ): Promise<void> {
        const {
            topK = 5,
            maxHistoryRounds = 5,
            maxContextChars = 8000,
            temperature = 0.7,
            model
        } = options;

        try {
            // 1. 检索相关上下文
            const contextResults = await this.searchService.search(question, { topK, minScore: 0.3 });

            // 2. 构造消息队列
            const messages: ChatMessage[] = [];

            // A. 系统提示词
            messages.push({
                role: "system",
                content: this.buildSystemPrompt()
            });

            // B. 注入上下文
            messages.push({
                role: "system",
                content: this.buildContextPrompt(contextResults, maxContextChars)
            });

            // C. 注入历史记录
            const historyWindow = this.history.slice(-(maxHistoryRounds * 2));
            messages.push(...historyWindow);

            // D. 当前问题
            messages.push({ role: "user", content: question });

            // 3. 调用 LLM
            let assistantResponse = "";
            await this.llmProvider.chatStream(
                messages,
                (chunk) => {
                    assistantResponse += chunk;
                    onChunk(chunk);
                },
                { model, temperature }
            );

            // 4. 更新历史并限制长度
            this.history.push({ role: "user", content: question });
            this.history.push({ role: "assistant", content: assistantResponse });

            if (this.history.length > maxHistoryRounds * 2) {
                this.history = this.history.slice(-(maxHistoryRounds * 2));
            }

            this.logger.info(`[RAG] Chat completed. Response length: ${assistantResponse.length}. Est. Tokens: ${this.estimateTokens(assistantResponse)}`);

        } catch (err) {
            this.logger.error(`[RAG] Pipeline failed:`, err);
            throw err;
        }
    }

    /** 简易 Token 计数器 */
    estimateTokens(text: string): number {
        if (!text) return 0;
        const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
        const ascii = text.length - nonAscii;
        return Math.ceil(nonAscii * 2 + ascii * 0.5);
    }

    clearHistory() {
        this.history = [];
    }

    private buildSystemPrompt(): string {
        return `你是一个名为“白泽”的 AI 助手，深度集成在用户的 Obsidian 知识库中。
你的任务是根据提供的“参考文本”回答用户问题。

回答准则：
1. 优先使用提供的参考文本。如果参考文本中没有相关信息，请明确告知。
2. **必须在回答中引用来源**。使用格式 [^index] 进行标注，其中 index 是参考文本的序号。
3. 如果参考文本涉及多个文件，请分别标注。
4. 回答使用 Markdown 格式。`;
    }

    private buildContextPrompt(results: SearchResult[], limit: number): string {
        if (results.length === 0) {
            return "没有找到相关的本地笔记上下文。";
        }

        let prompt = "以下是来自用户 Obsidian 库的参考文本片段：\n\n";
        let currentChars = prompt.length;

        results.forEach((res, i) => {
            const index = i + 1;
            const source = res.chunk.metadata.title || "未知文件";
            const path = res.chunk.vectorId.split("::")[0];
            const content = `--- 参考 [^${index}] 来源: ${source} (${path}) ---\n${res.chunk.text}\n\n`;

            if (currentChars + content.length < limit) {
                prompt += content;
                currentChars += content.length;
            }
        });

        return prompt;
    }
}
