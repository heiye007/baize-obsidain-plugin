/**
 * 白泽 Baize - DeepSeek 客户端
 * 
 * DeepSeek API 完美兼容 OpenAI 格式
 */
import { OpenAIClient } from "./openai";
import type { Logger } from "../../../shared/logger";

export class DeepSeekClient extends OpenAIClient {
    constructor(apiKey: string, logger: Logger) {
        // 使用 DeepSeek 官方端点
        super(
            apiKey,
            "https://api.deepseek.com/v1",
            logger,
            "deepseek-chat"
        );
    }

    /** 覆盖测试方法， DeepSeek 响应较快，可调低超时 */
    async testConnection(): Promise<boolean> {
        return super.testConnection();
    }
}
