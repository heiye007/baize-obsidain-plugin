/**
 * 白泽 Baize - 全局事件总线
 * 解耦层间通信，各模块通过事件而非直接引用交互
 */

type EventHandler = (...args: unknown[]) => void;

/** 事件类型枚举 */
export const BaizeEvents = {
    // 文件变更
    FILE_CHANGED: "file:changed",
    FILE_DELETED: "file:deleted",
    FILE_RENAMED: "file:renamed",

    // 索引状态
    INDEX_PROGRESS: "index:progress",
    INDEX_COMPLETE: "index:complete",
    INDEX_ERROR: "index:error",

    // 模型状态
    MODEL_LOADING: "model:loading",
    MODEL_READY: "model:ready",
    MODEL_ERROR: "model:error",

    // 搜索
    SEARCH_START: "search:start",
    SEARCH_COMPLETE: "search:complete",

    // 知识联想
    INSIGHT_UPDATED: "insight:updated",
} as const;

export class EventBus {
    private handlers = new Map<string, Set<EventHandler>>();

    /** 订阅事件 */
    on(event: string, handler: EventHandler): void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);
    }

    /** 一次性订阅 */
    once(event: string, handler: EventHandler): void {
        const wrapper: EventHandler = (...args) => {
            this.off(event, wrapper);
            handler(...args);
        };
        this.on(event, wrapper);
    }

    /** 取消订阅 */
    off(event: string, handler: EventHandler): void {
        this.handlers.get(event)?.delete(handler);
    }

    /** 发射事件 */
    emit(event: string, ...args: unknown[]): void {
        this.handlers.get(event)?.forEach(handler => {
            try {
                handler(...args);
            } catch (e) {
                console.error(`[Baize EventBus] Error in handler for "${event}":`, e);
            }
        });
    }

    /** 清除所有订阅 */
    destroy(): void {
        this.handlers.clear();
    }
}
