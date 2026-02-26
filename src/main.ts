/**
 * 白泽 Baize - Obsidian 插件入口
 *
 * 职责：
 * 1. 管理插件生命周期 (onload / onunload)
 * 2. 注册视图、命令、Ribbon 图标
 * 3. 初始化核心服务（事件总线、日志、平台适配）
 * 4. 启动索引调度器
 */
import { Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import type { BaizeSettings, PlatformType } from "./shared/types";
import { DEFAULT_SETTINGS, VIEW_TYPE_BAIZE } from "./shared/constants";
import { ICON_BAIZE, ICON_BAIZE_SVG } from "./shared/icon";
import { EventBus } from "./shared/event-bus";
import { Logger } from "./shared/logger";
import { BaizeSidebarView } from "./ui/views/sidebar-view";
import { BaizeSettingTab } from "./settings/settings-tab";
import { getPlatform } from "./infrastructure/platform/platform-detect";
import { DesktopPlatform } from "./infrastructure/platform/desktop";
import { AndroidPlatform } from "./infrastructure/platform/android";
import { IOSPlatform } from "./infrastructure/platform/ios";

export default class BaizePlugin extends Plugin {
    settings!: BaizeSettings;
    eventBus!: EventBus;
    logger!: Logger;
    platform!: PlatformType;
    private platformAdapter?: DesktopPlatform | AndroidPlatform | IOSPlatform;

    async onload(): Promise<void> {
        // ── 0. 注册自定义图标 ──
        addIcon(ICON_BAIZE, ICON_BAIZE_SVG);

        // ── 1. 加载设置 ──
        await this.loadSettings();

        // ── 2. 初始化跨切面服务 ──
        this.eventBus = new EventBus();
        this.logger = new Logger(this.settings.logLevel);
        this.logger.info("白泽正在苏醒...");

        // ── 3. 平台检测 ──
        this.platform = this.detectPlatform();
        this.logger.info(`运行平台: ${this.platform}`);

        // ── 4. 注册视图 ──
        this.registerView(
            VIEW_TYPE_BAIZE,
            (leaf: WorkspaceLeaf) => new BaizeSidebarView(leaf, this)
        );

        // ── 5. 注册设置面板 ──
        this.addSettingTab(new BaizeSettingTab(this.app, this));

        // ── 6. 注册命令 ──
        this.addCommand({
            id: "open-baize-search",
            name: "打开白泽语义搜索",
            callback: () => {
                this.activateView();
            },
        });

        this.addCommand({
            id: "rebuild-index",
            name: "白泽：重建全量索引",
            callback: () => {
                // TODO: 第二阶段实现 index-scheduler.rebuildAll()
                this.logger.info("触发全量索引重建...");
            },
        });

        // ── 7. Ribbon 图标 ──
        this.addRibbonIcon(ICON_BAIZE, "白泽 Baize", () => {
            this.activateView();
        });

        // ── 8. 平台特定初始化 ──
        this.initPlatformFeatures();

        // ── 9. 启动索引调度器 ──
        // TODO: 第二阶段实现
        // this.indexScheduler = new IndexScheduler(...);
        // this.indexScheduler.start();

        this.logger.info("白泽已就绪 ✨");
    }

    async onunload(): Promise<void> {
        this.logger.info("白泽正在休眠...");

        // 释放 Worker 线程池
        // TODO: 第二阶段实现
        // this.workerPool?.terminate();

        // 关闭 LanceDB 连接
        // TODO: 第二阶段实现
        // this.vectorStore?.close();

        // 销毁平台适配器
        this.platformAdapter?.destroy();

        // 销毁事件总线
        this.eventBus.destroy();

        this.logger.info("白泽已休眠 🌙");
    }

    // ─── 设置管理 ───

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        // 同步日志级别
        this.logger?.setLevel(this.settings.logLevel);
    }

    // ─── 平台检测 ───

    private detectPlatform(): PlatformType {
        return getPlatform();
    }

    // ─── 平台特定功能初始化 ───

    private initPlatformFeatures(): void {
        switch (this.platform) {
            case "desktop": {
                const desktop = new DesktopPlatform(this, this.logger);
                desktop.init();
                this.platformAdapter = desktop;
                break;
            }
            case "android": {
                const android = new AndroidPlatform(this, this.logger, this.eventBus);
                android.init();
                this.platformAdapter = android;
                break;
            }
            case "ios": {
                const ios = new IOSPlatform(this, this.logger, this.eventBus);
                ios.init();
                this.platformAdapter = ios;
                break;
            }
        }
    }

    // ─── 视图管理 ───

    async activateView(): Promise<void> {
        // 移动端优先弹出 Modal
        if (this.platform !== "desktop") {
            const { BaizeModalView } = await import("./ui/views/modal-view");
            new BaizeModalView(this.app, this).open();
            return;
        }

        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_BAIZE);

        if (leaves.length > 0) {
            // 已有视图，激活它
            leaf = leaves[0];
        } else {
            // 创建新视图
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
                await leaf.setViewState({
                    type: VIEW_TYPE_BAIZE,
                    active: true,
                });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }
}
