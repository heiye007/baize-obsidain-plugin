/**
 * 白泽 Baize - ILLMProvider 接口
 * 
 * 领域层定义的 LLM 服务接口
 * 支持 OpenAI 兼容格式、本地推理或 Ollama
 */

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ChatOptions {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}

export interface ChatResponse {
    id: string;
    content: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface ILLMProvider {
    /**
     * 发起对话请求
     */
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

    /**
     * 流式对话请求
     */
    chatStream(
        messages: ChatMessage[],
        onChunk: (chunk: string) => void,
        options?: ChatOptions
    ): Promise<void>;

    /** 获取可用模型列表 */
    getModels(): Promise<string[]>;

    /** 测试 API 连接是否正确 */
    testConnection(): Promise<boolean>;
}
