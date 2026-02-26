/**
 * 白泽 Baize - IVectorStore 接口
 * 
 * 领域层定义的向量存储抽象
 * 基础设施层（LanceAdapter）提供具体实现
 * 
 * 遵循依赖倒置原则：Domain 层定义接口，Infrastructure 层实现接口
 */
import type { VectorRecord, IndexStats } from "../../infrastructure/database/schema";
import type { SearchResult } from "../models/search-result";

export interface IVectorStore {
    /** 初始化数据库连接，创建或打开表 */
    init(): Promise<void>;

    /**
     * 插入或更新向量记录
     * 按 id (file_path + chunk_index) 去重
     */
    upsert(records: VectorRecord[]): Promise<void>;

    /**
     * 删除指定文件的所有向量记录
     * @param filePath - 源文件路径（相对于 Vault 根）
     */
    delete(filePath: string): Promise<void>;

    /**
     * ANN 近似最近邻搜索
     * @param vector - 查询向量
     * @param topK - 返回结果数量
     * @param minScore - 最低相似度阈值
     * @returns 按相似度降序排列的搜索结果
     */
    search(vector: number[], topK: number, minScore?: number): Promise<SearchResult[]>;

    /** 获取索引统计信息 */
    getStats(): Promise<IndexStats>;

    /** 安全关闭数据库连接 */
    close(): Promise<void>;
}
