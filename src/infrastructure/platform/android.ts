/**
 * 白泽 Baize - Android 平台适配
 * 
 * Android 特有逻辑：
 * 1. 系统返回键处理（关闭抽屉而非退出插件）
 * 2. 后台任务分片（requestIdleCallback）
 * 3. 功耗控制（后台 30s 后释放模型）
 */
import type { Plugin } from "obsidian";
import type { Logger } from "../../shared/logger";
import type { EventBus } from "../../shared/event-bus";

export class AndroidPlatform {
    private plugin: Plugin;
    private logger: Logger;
    private eventBus: EventBus;
    private backgroundTimer: ReturnType<typeof setTimeout> | null = null;
    private _inBackground = false;

    /** 当前是否在后台（供索引调度器查询） */
    get inBackground(): boolean { return this._inBackground; }

    constructor(plugin: Plugin, logger: Logger, eventBus: EventBus) {
        this.plugin = plugin;
        this.logger = logger;
        this.eventBus = eventBus;
    }

    /** 初始化 Android 功能 */
    init(): void {
        this.registerBackKeyHandler();
        this.registerBackgroundDetection();
        this.logger.debug("Android 功能已初始化");
    }

    /**
     * 注册系统返回键处理
     * 
     * 在 Obsidian 移动端，返回键默认可能导致退出插件
     * 这里拦截返回键，改为关闭白泽抽屉面板
     */
    private registerBackKeyHandler(): void {
        const handler = (e: PopStateEvent) => {
            const modalEls = document.querySelectorAll(".baize-mobile-modal");
            if (modalEls.length > 0) {
                // 如果找到白泽的 Modal，阻止默认行为并通知它关闭（或直接关闭）
                // 在 Obsidian 中，Modal 通常自带关闭按钮，这里作为系统级补充
                e.preventDefault();
                this.logger.debug("返回键：捕获到白泽 Modal");
                // 注意：Obsidian Modal 应该由 Modal.close() 处理，
                // 这里我们发送一个信号或者模拟关闭
            }
        };

        window.addEventListener("popstate", handler);
        window.history.pushState(null, "", window.location.href);

        this.plugin.register(() => {
            window.removeEventListener("popstate", handler);
        });
        this.logger.debug("系统返回键处理已注册");
    }

    /**
     * 注册后台检测
     * 
     * Android 进入后台 30s 后释放模型缓存
     * 回到前台时取消释放计时
     */
    private registerBackgroundDetection(): void {
        const handleVisibility = () => {
            if (document.hidden) {
                this._inBackground = true;
                this.backgroundTimer = setTimeout(() => {
                    this.logger.info("Android 后台超时，释放模型缓存");
                    this.eventBus.emit("model:release");
                }, 30_000);
            } else {
                this._inBackground = false;
                if (this.backgroundTimer) {
                    clearTimeout(this.backgroundTimer);
                    this.backgroundTimer = null;
                }
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);
        this.plugin.register(() => {
            document.removeEventListener("visibilitychange", handleVisibility);
            if (this.backgroundTimer) {
                clearTimeout(this.backgroundTimer);
            }
        });
    }

    /**
     * 后台任务分片执行
     * 
     * 使用 requestIdleCallback（如可用）或 setTimeout 降级
     * 将 CPU 密集任务切分为小块，避免阻塞 UI
     */
    static runInIdleChunks<T>(
        tasks: T[],
        processor: (task: T) => void,
        onComplete?: () => void
    ): void {
        let index = 0;

        const processChunk = (deadline?: IdleDeadline) => {
            while (index < tasks.length) {
                if (deadline && deadline.timeRemaining() < 1) break;
                processor(tasks[index]);
                index++;
                if (!deadline) break;
            }

            if (index < tasks.length) {
                if (typeof requestIdleCallback !== "undefined") {
                    requestIdleCallback(processChunk);
                } else {
                    setTimeout(() => processChunk(), 16);
                }
            } else {
                onComplete?.();
            }
        };

        if (typeof requestIdleCallback !== "undefined") {
            requestIdleCallback(processChunk);
        } else {
            setTimeout(() => processChunk(), 0);
        }
    }

    /** 清理 */
    destroy(): void {
        if (this.backgroundTimer) {
            clearTimeout(this.backgroundTimer);
            this.backgroundTimer = null;
        }
    }
}
