/**
 * 白泽 Baize - Ollama 本地客户端
 * 
 * 职责：
 * 1. 接入本地 Ollama 服务 (/api/chat)
 * 2. 支持流式响应
 * 3. 自动检测服务可用性
 */
import type {
    ILLMProvider,
    ChatMessage,
    ChatOptions,
    ChatResponse
} from "../../../domain/interfaces/llm-provider";
import { LLMError } from "../../../shared/errors";
import type { Logger } from "../../../shared/logger";

export class OllamaClient implements ILLMProvider {
    private baseUrl: string;
    private logger: Logger;
    private defaultModel: string;

    constructor(
        baseUrl: string = "http://127.0.0.1:11434",
        logger: Logger,
        defaultModel: string = "llama3"
    ) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        this.logger = logger;
        this.defaultModel = defaultModel;
    }

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: options?.model || this.defaultModel,
                messages,
                stream: false,
                options: {
                    temperature: options?.temperature
                }
            }),
            signal: AbortSignal.timeout(60000) // 本地推理可能较慢，给 60s
        });

        if (!response.ok) {
            throw new LLMError(`Ollama Error: ${response.statusText}`);
        }

        const data = await response.json();
        return {
            id: Date.now().toString(),
            content: data.message.content,
            usage: {
                prompt_tokens: data.prompt_eval_count || 0,
                completion_tokens: data.eval_count || 0,
                total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
            }
        };
    }

    async chatStream(
        messages: ChatMessage[],
        onChunk: (chunk: string) => void,
        options?: ChatOptions
    ): Promise<void> {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: options?.model || this.defaultModel,
                messages,
                stream: true,
                options: {
                    temperature: options?.temperature
                }
            })
        });

        if (!response.ok) {
            throw new LLMError(`Ollama Stream Error: ${response.statusText}`);
        }

        if (!response.body) throw new LLMError("No response body from Ollama");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunkStr = decoder.decode(value, { stream: true });
                const lines = chunkStr.split("\n").filter(Boolean);

                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.message?.content) {
                            onChunk(json.message.content);
                        }
                    } catch (e) {
                        this.logger.warn(`Failed to parse Ollama JSON line: ${line}`);
                    }
                }
            }
        } finally {
            reader.cancel();
        }
    }

    async getModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) return [];
            const data = await response.json();
            return data.models.map((m: { name: string }) => m.name);
        } catch {
            return [];
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(3000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}
