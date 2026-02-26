/**
 * 白泽 Baize - iOS 平台适配
 * 
 * iOS 特有逻辑：
 * 1. Safe Area CSS 变量注入（刘海屏、灵动岛、Home Indicator）
 * 2. App 进入后台时立即释放模型缓存（iOS 内存严格限制）
 * 3. 触控反馈优化
 */
import type { Plugin } from "obsidian";
import type { Logger } from "../../shared/logger";
import type { EventBus } from "../../shared/event-bus";

export class IOSPlatform {
    private plugin: Plugin;
    private logger: Logger;
    private eventBus: EventBus;

    constructor(plugin: Plugin, logger: Logger, eventBus: EventBus) {
        this.plugin = plugin;
        this.logger = logger;
        this.eventBus = eventBus;
    }

    /** 初始化 iOS 功能 */
    init(): void {
        this.injectSafeAreaCSS();
        this.registerImmediateBackgroundRelease();
        this.optimizeTouchFeedback();
        this.logger.debug("iOS 功能已初始化");
    }

    /**
     * 注入 Safe Area CSS 变量
     * 
     * 确保白泽 UI 不被刘海屏、灵动岛、Home Indicator 遮挡
     * 使用 env() 函数获取系统安全区域值
     */
    private injectSafeAreaCSS(): void {
        const style = document.createElement("style");
        style.id = "baize-ios-safe-area";
        style.textContent = `
			:root {
				--baize-safe-top: env(safe-area-inset-top, 0px);
				--baize-safe-bottom: env(safe-area-inset-bottom, 0px);
				--baize-safe-left: env(safe-area-inset-left, 0px);
				--baize-safe-right: env(safe-area-inset-right, 0px);
			}
			
			/* 白泽移动布局自动应用 Safe Area */
			.baize-mobile-container {
				padding-bottom: calc(var(--baize-safe-bottom) + 8px);
			}
			
			.baize-mobile-container .baize-input-area {
				padding-bottom: var(--baize-safe-bottom);
			}
		`;
        document.head.appendChild(style);

        this.plugin.register(() => {
            style.remove();
        });
        this.logger.debug("iOS Safe Area CSS 已注入");
    }

    /**
     * 注册后台立即释放
     * 
     * iOS 对内存限制极其严格，后台超限会被系统直接杀死
     * 因此进入后台时**立即**释放模型缓存，不等待
     */
    private registerImmediateBackgroundRelease(): void {
        const handleVisibility = () => {
            if (document.hidden) {
                // iOS 进入后台 → 立即释放模型
                this.logger.info("iOS 进入后台，立即释放模型缓存");
                this.eventBus.emit("model:release");
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);
        this.plugin.register(() => {
            document.removeEventListener("visibilitychange", handleVisibility);
        });
    }

    /**
     * 优化触控反馈
     * 
     * 添加 iOS 原生风格的触控交互：
     * - 消除 300ms 点击延迟（Obsidian 应已处理）
     * - 禁用长按弹出菜单（在白泽面板内）
     * - 添加触控按下的视觉反馈
     */
    private optimizeTouchFeedback(): void {
        const style = document.createElement("style");
        style.id = "baize-ios-touch";
        style.textContent = `
			/* iOS 触控反馈 */
			.baize-mobile-container {
				-webkit-touch-callout: none;
				-webkit-tap-highlight-color: transparent;
			}
			
			/* 可交互元素按下反馈 */
			.baize-mobile-container button:active,
			.baize-mobile-container .baize-result-card:active {
				transform: scale(0.97);
				transition: transform 80ms ease;
			}
			
			/* iOS 原生滚动惯性 */
			.baize-mobile-container .baize-mobile-content {
				-webkit-overflow-scrolling: touch;
				overflow-y: auto;
			}
		`;
        document.head.appendChild(style);

        this.plugin.register(() => {
            style.remove();
        });
        this.logger.debug("iOS 触控反馈优化已应用");
    }

    /** 清理 */
    destroy(): void {
        // CSS 样式通过 plugin.register 自动清理
    }
}
