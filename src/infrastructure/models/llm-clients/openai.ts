/**
 * 白泽 Baize - OpenAI 兼容客户端
 * 
 * 职责：
 * 1. 实现 ILLMProvider 接口
 * 2. 支持标准的 OpenAI 接口协议
 * 3. 支持流式响应 (SSE)
 * 4. 实现自动重试与超时控制
 */
import type {
    ILLMProvider,
    ChatMessage,
    ChatOptions,
    ChatResponse
} from "../../../domain/interfaces/llm-provider";
import { LLMError } from "../../../shared/errors";
import type { Logger } from "../../../shared/logger";

export class OpenAIClient implements ILLMProvider {
    protected baseUrl: string;
    protected apiKey: string;
    protected logger: Logger;
    protected defaultModel: string;

    constructor(
        apiKey: string,
        baseUrl: string = "https://api.openai.com/v1",
        logger: Logger,
        defaultModel: string = "gpt-3.5-turbo"
    ) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        this.logger = logger;
        this.defaultModel = defaultModel;
    }

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
        return this.withRetry(async () => {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: options?.model || this.defaultModel,
                    messages,
                    temperature: options?.temperature ?? 0.7,
                    max_tokens: options?.max_tokens,
                    stream: false
                }),
                signal: AbortSignal.timeout(30000) // 30s 超时
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new LLMError(`OpenAI API Error (${response.status}): ${error.error?.message || response.statusText}`);
            }

            const data = await response.json();
            return {
                id: data.id,
                content: data.choices[0].message.content,
                usage: data.usage
            };
        });
    }

    async chatStream(
        messages: ChatMessage[],
        onChunk: (chunk: string) => void,
        options?: ChatOptions
    ): Promise<void> {
        return this.withRetry(async () => {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: options?.model || this.defaultModel,
                    messages,
                    temperature: options?.temperature ?? 0.7,
                    max_tokens: options?.max_tokens,
                    stream: true
                }),
                signal: AbortSignal.timeout(60000) // 流式允许更长的总时间 (60s)
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new LLMError(`OpenAI Stream Error (${response.status}): ${error.error?.message || response.statusText}`);
            }

            if (!response.body) throw new LLMError("No response body from OpenAI");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || ""; // 保留末尾不完整的行

                    for (const line of lines) {
                        const cleanLine = line.trim();
                        if (!cleanLine || !cleanLine.startsWith("data: ")) continue;

                        const dataStr = cleanLine.slice(6);
                        if (dataStr === "[DONE]") break;

                        try {
                            const data = JSON.parse(dataStr);
                            const chunk = data.choices[0]?.delta?.content || "";
                            if (chunk) onChunk(chunk);
                        } catch (e) {
                            this.logger.warn(`Failed to parse SSE line: ${cleanLine}`);
                        }
                    }
                }
            } finally {
                reader.cancel();
            }
        });
    }

    async getModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: { "Authorization": `Bearer ${this.apiKey}` },
                signal: AbortSignal.timeout(10000)
            });
            if (!response.ok) return [this.defaultModel];
            const data = await response.json();
            return data.data.map((m: { id: string }) => m.id);
        } catch {
            return [this.defaultModel];
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.chat([{ role: "user", content: "hi" }], { max_tokens: 1 });
            return true;
        } catch (e) {
            this.logger.error(`Connection test failed for ${this.baseUrl}:`, e);
            return false;
        }
    }

    /** 重试逻辑 (重试 2 次网络错误) */
    private async withRetry<T>(task: () => Promise<T>, retries: number = 2): Promise<T> {
        let lastError: unknown;
        for (let i = 0; i <= retries; i++) {
            try {
                return await task();
            } catch (err) {
                lastError = err;
                // 如果是网络超时或网络异常，则重试
                if (i < retries && (err instanceof TypeError || (err as Error).name === "TimeoutError")) {
                    this.logger.warn(`LLM Request failed, retrying (${i + 1}/${retries})...`);
                    await new Promise(r => setTimeout(r, 1000 * (i + 1))); // 指数退避
                    continue;
                }
                throw err;
            }
        }
        throw lastError;
    }
}
