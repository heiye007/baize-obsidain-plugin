/**
 * 白泽 Baize - IEmbedder 接口
 * 
 * 领域层定义的向量嵌入接口
 * 负责将文本转换为高维向量
 */
export interface IEmbedder {
    /**
     * 加载嵌入模型
     * @param modelName - 模型 ID（如 "Xenova/all-MiniLM-L6-v2"）
     */
    loadModel(modelId: string, options?: { quantized?: boolean }): Promise<void>;

    /**
     * 将单段文本转换为向量
     * @param text - 待处理文本
     */
    embed(text: string): Promise<number[]>;

    /**
     * 批量将文本转换为向量
     * @param texts - 文本数组
     */
    embedBatch(texts: string[]): Promise<number[][]>;

    /** 卸载模型，释放内存 */
    unloadModel(): Promise<void>;

    /** 获取当前模型占用的内存估计（字节） */
    getMemoryUsage(): number;
}
