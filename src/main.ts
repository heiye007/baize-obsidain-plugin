/**
 * 白泽 Baize - Obsidian 插件入口
 *
 * 职责：
 * 1. 管理插件生命周期 (onload / onunload)
 * 2. 注册视图、命令、Ribbon 图标
 * 3. 初始化核心服务（事件总线、日志、平台适配）
 * 4. 启动索引调度器
 */

// ═══ 必须在最前面导入 polyfill ═══
import "./polyfill-entry";

import { Plugin, WorkspaceLeaf, addIcon, TFile } from "obsidian";
import type { PlatformType } from "./shared/types";
import { VIEW_TYPE_BAIZE } from "./shared/constants";
import { validateSettings } from "./settings/default-settings";
import type { BaizeSettings } from "./settings/default-settings";
import { ICON_BAIZE, ICON_BAIZE_SVG } from "./shared/icon";
import { EventBus } from "./shared/event-bus";
import { Logger } from "./shared/logger";
import { BaizeSidebarView } from "./ui/views/sidebar-view";
import { BaizeSettingTab } from "./settings/settings-tab";
import { getPlatform } from "./infrastructure/platform/platform-detect";
import { DesktopPlatform } from "./infrastructure/platform/desktop";
import { AndroidPlatform } from "./infrastructure/platform/android";
import { IOSPlatform } from "./infrastructure/platform/ios";
import { LanceAdapter } from "./infrastructure/database/lance-adapter";
import { VoyAdapter } from "./infrastructure/database/voy-adapter";
import type { IVectorStore } from "./domain/interfaces/vector-store";
import { IndexScheduler } from "./application/index-scheduler";
import { TransformersAdapter } from "./infrastructure/models/transformers-adapter";
import { SyncService } from "./application/sync-service";
import { BaizeEvents } from "./shared/event-bus";

export default class BaizePlugin extends Plugin {
    settings!: BaizeSettings;
    eventBus!: EventBus;
    logger!: Logger;
    platform!: PlatformType;

    vectorStore?: IVectorStore;
    indexScheduler?: IndexScheduler;
    transformersAdapter?: TransformersAdapter;

    private syncService?: SyncService;
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
                if (this.indexScheduler) {
                    this.indexScheduler.fullSync();
                } else {
                    this.logger.warn("索引调度器尚未初始化");
                }
            },
        });

        // ── 7. Ribbon 图标 ──
        this.addRibbonIcon(ICON_BAIZE, "白泽 Baize", () => {
            this.activateView();
        });

        // ── 8. 平台特定初始化 ──
        this.initPlatformFeatures();

        // ── 9. 注册笔记切换监听（灵感联想）──
        this.registerActiveNoteListener();

        // ── 10. 初始化向量存储 ──
        await this.initVectorStore();

        // ── 10. 启动 Embedding 引擎与索引调度器 ──
        await this.initEmbeddingPipeline();

        this.logger.info("白泽已就绪 ✨");
    }

    async onunload(): Promise<void> {
        this.logger.info("白泽正在休眠...");

        // 卸载 Embedding 模型
        await this.transformersAdapter?.unloadModel();

        // 关闭向量存储连接
        if (this.vectorStore) {
            await this.vectorStore.close();
        }

        // 销毁平台适配器
        this.platformAdapter?.destroy();

        // 销毁事件总线
        this.eventBus.destroy();

        this.logger.info("白泽已休眠 🌙");
    }

    // ─── 设置管理 ───

    async loadSettings(): Promise<void> {
        this.settings = validateSettings(await this.loadData());
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

    // ─── 向量存储初始化 ───

    private async initVectorStore(): Promise<void> {
        const pluginPath = this.app.vault.configDir + "/plugins/" + this.manifest.id;

        if (this.platform === "desktop") {
            try {
                // 1. 获取插件目录的绝对路径，用于定位 node_modules 中的 native 模块
                const adapter = this.app.vault.adapter;
                // @ts-ignore - 使用内部方法获取绝对绝对路径 (Only works on Desktop)
                const absolutePluginPath = adapter.getFullPath ? adapter.getFullPath(pluginPath) : "";

                let lancedbModulePath: string | undefined = undefined;
                if (absolutePluginPath) {
                    const path = eval('require')('path');
                    // 直接定位到 @lancedb/lancedb 模块路径
                    lancedbModulePath = path.join(absolutePluginPath, 'node_modules', '@lancedb', 'lancedb');
                    this.logger.info(`已计算 LanceDB 模块路径: ${lancedbModulePath}`);
                }

                // 2. 尝试初始化 LanceDB
                this.logger.info("桌面端：尝试初始化 LanceDB...");
                const lance = new LanceAdapter(
                    pluginPath + "/baize_lancedb",
                    this.logger,
                    undefined, // modelName 
                    lancedbModulePath
                );
                await lance.init();
                this.vectorStore = lance;
                return;
            } catch (err) {
                this.logger.warn("LanceDB 在此桌面环境无法运行，正在切换至 Voy (WASM) 模式...", err);
            }
        }

        // 移动端或 LanceDB 失败的桌面端：使用 Voy (WASM)
        this.logger.info("初始化 Voy (WASM) 向量库...");
        const voy = new VoyAdapter(
            this.app,
            this.logger,
            pluginPath + "/baize_voy.json"
        );
        await voy.init();
        this.vectorStore = voy;
    }

    // ─── Embedding 管线初始化 ───

    private async initEmbeddingPipeline(): Promise<void> {
        if (!this.vectorStore) {
            this.logger.warn("向量存储未就绪，跳过 Embedding 管线初始化");
            return;
        }

        try {
            // 1. 创建 TransformersAdapter（使用 @xenova/transformers v2）
            this.transformersAdapter = new TransformersAdapter(this.logger);
            this.logger.info("Embedding 引擎已创建 (Transformers v2 模式)");

            // 2. 创建 IndexScheduler
            this.indexScheduler = new IndexScheduler(
                this.app,
                this.eventBus,
                this.vectorStore as any,
                null as any, // modelManager 暂不使用
                this.transformersAdapter as any,
                this.logger
            );
            this.logger.info("索引调度器已创建");

            // 3. 注册文件同步监听
            this.syncService = new SyncService(
                this.app,
                this.eventBus,
                this.logger,
                [".obsidian/", ".trash/"]
            );
            this.syncService.setupListeners();
            this.logger.info("文件同步监听已注册");

            // 4. 后台异步加载模型（不阻塞插件启动）
            const modelId = "Xenova/all-MiniLM-L6-v2";
            this.logger.info(`正在后台加载 Embedding 模型: ${modelId}...`);

            // 计算插件目录的资源路径，用于加载本地 WASM 文件
            const pluginPath = this.app.vault.configDir + "/plugins/" + this.manifest.id;
            const resourcePath = (this.app.vault.adapter as any).getResourcePath
                ? (this.app.vault.adapter as any).getResourcePath(pluginPath)
                : pluginPath;

            this.transformersAdapter.loadModel(
                modelId,
                { quantized: true, pluginResourcePath: resourcePath },
                (progress: number) => {
                    if (progress % 20 === 0 || progress === 100) {
                        this.logger.info(`模型加载进度: ${progress}%`);
                    }
                }
            ).then(() => {
                this.logger.info("Embedding 模型加载完成 ✅");
                this.eventBus.emit(BaizeEvents.MODEL_READY);
            }).catch((err: Error) => {
                this.logger.error("Embedding 模型加载失败:", err);
            });

        } catch (err) {
            this.logger.error("Embedding 管线初始化失败:", err);
        }
    }

    // ─── 注册当前笔记切换监听（灵感联想）───
    private registerActiveNoteListener(): void {
        let lastNotePath = "";

        // 监听活动文件变化
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", async () => {
                const file = this.app.workspace.getActiveFile();
                if (!file) return;

                const notePath = file.path;
                if (notePath === lastNotePath) return;
                lastNotePath = notePath;

                this.logger.info(`[Insight] 切换到笔记: ${notePath}`);
                this.eventBus.emit(BaizeEvents.SEARCH_START);

                // 延迟执行，等待笔记内容加载
                setTimeout(async () => {
                    await this.updateInsightForNote(notePath);
                }, 500);
            })
        );

        this.logger.info("[Insight] 笔记切换监听已注册");
    }

    // ─── 更新灵感联想 ───
    private async updateInsightForNote(notePath: string): Promise<void> {
        try {
            // 检查依赖
            if (!this.transformersAdapter || !this.vectorStore) {
                this.logger.warn("[Insight] 模型或向量存储未就绪");
                return;
            }

            // 获取笔记内容
            const file = this.app.vault.getAbstractFileByPath(notePath);
            if (!file || !(file instanceof TFile)) {
                this.logger.warn(`[Insight] 无法获取文件: ${notePath}`);
                return;
            }

            const content = await this.app.vault.read(file);
            if (!content || content.length < 10) {
                this.logger.info("[Insight] 笔记内容太短，跳过联想");
                this.eventBus.emit(BaizeEvents.INSIGHT_UPDATED, {
                    notePath,
                    results: []
                });
                return;
            }

            // 提取前1000字符作为查询内容
            const queryText = content.slice(0, 1000).replace(/#+\s/g, "").trim();

            // 编码查询
            this.logger.info("[Insight] 编码笔记内容...");
            const queryVector = await this.transformersAdapter.embed(queryText);

            // 搜索相似内容（排除当前笔记）
            this.logger.info("[Insight] 搜索相关内容...");
            const allResults = await this.vectorStore.search(queryVector, 10, 0.3);

            // 过滤掉当前笔记的结果
            const results = allResults.filter(r => {
                const resultPath = r.chunk.vectorId.split("::")[0];
                return resultPath !== notePath;
            }).slice(0, 5); // 取前5个

            this.logger.info(`[Insight] 找到 ${results.length} 条相关笔记`);

            // 触发更新事件
            this.eventBus.emit(BaizeEvents.INSIGHT_UPDATED, {
                notePath,
                results
            });

        } catch (err) {
            this.logger.error("[Insight] 更新失败:", err);
            this.eventBus.emit(BaizeEvents.INSIGHT_UPDATED, {
                notePath,
                results: []
            });
        }
    }
}
