/**
 * 白泽 Baize - 自定义错误类型
 */

export class BaizeError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = "BaizeError";
    }
}

export class ModelLoadError extends BaizeError {
    constructor(message: string) {
        super(message, "MODEL_LOAD_ERROR");
        this.name = "ModelLoadError";
    }
}

export class IndexError extends BaizeError {
    constructor(message: string) {
        super(message, "INDEX_ERROR");
        this.name = "IndexError";
    }
}

export class StorageError extends BaizeError {
    constructor(message: string) {
        super(message, "STORAGE_ERROR");
        this.name = "StorageError";
    }
}

export class LLMError extends BaizeError {
    constructor(message: string) {
        super(message, "LLM_ERROR");
        this.name = "LLMError";
    }
}
