/**
 * 白泽 Baize - Web Worker 通信协议
 */

export enum WorkerMessageType {
    // 主线程 -> Worker
    INIT = "INIT",
    EMBED = "EMBED",
    EMBED_BATCH = "EMBED_BATCH",
    UNLOAD = "UNLOAD",

    // Worker -> 主线程
    READY = "READY",
    PROGRESS = "PROGRESS",
    RESULT = "RESULT",
    ERROR = "ERROR"
}

export interface WorkerRequest {
    id: string;
    type: WorkerMessageType;
    payload?: any;
}

export interface WorkerResponse {
    id: string;
    type: WorkerMessageType;
    payload?: any;
    error?: string;
}

export interface InitPayload {
    modelName: string;
    cacheDir?: string;
    quantized?: boolean;
}

export interface EmbedPayload {
    text: string;
}

export interface EmbedBatchPayload {
    texts: string[];
}

export interface ProgressPayload {
    status: string;
    progress: number;
    file?: string;
}
