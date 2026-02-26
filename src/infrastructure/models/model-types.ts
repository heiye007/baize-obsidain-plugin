/**
 * 白泽 Baize - 模型相关类型定义
 */

export interface ModelInfo {
    /** 模型 ID（HuggingFace 路径） */
    id: string;
    /** 显示名称 */
    name: string;
    /** 详细描述 */
    description: string;
    /** 向量维度 */
    dimensions: number;
    /** 预估文件大小 (MB) */
    sizeMB: number;
    /** 精度 */
    precision: "fp32" | "fp16" | "q4" | "q8";
    /** 本地模型路径（可选，用于离线模式） */
    localPath?: string;
}

/** 模型下载状态 */
export interface DownloadStatus {
    modelId: string;
    progress: number;
    status: "idle" | "downloading" | "extracting" | "ready" | "error";
    error?: string;
}
