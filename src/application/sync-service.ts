/**
 * 白泽 Baize - 索引同步服务
 * 
 * 职责：
 * 1. 注册 Obsidian Vault 生命周期事件监听
 * 2. 对高频修改进行防抖处理（如打字过程中的自动保存）
 * 3. 过滤非 Markdown 文件及排除目录
 * 4. 通过 EventBus 发射标准化的文件变更事件
 */
import { App, TFile, TAbstractFile } from "obsidian";
import { EventBus, BaizeEvents } from "../shared/event-bus";
import type { Logger } from "../shared/logger";

export class SyncService {
    private app: App;
    private events: EventBus;
    private logger: Logger;
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private excludePaths: string[] = [];

    constructor(app: App, events: EventBus, logger: Logger, excludePaths: string[] = []) {
        this.app = app;
        this.events = events;
        this.logger = logger;
        this.excludePaths = excludePaths;
    }

    /** 注册 Vault 监听器 */
    setupListeners() {
        // 修改与创建
        this.app.vault.on("modify", (file) => this.handleFileEvent(file, "changed"));
        this.app.vault.on("create", (file) => this.handleFileEvent(file, "changed"));

        // 删除
        this.app.vault.on("delete", (file) => this.handleFileEvent(file, "deleted"));

        // 重命名
        this.app.vault.on("rename", (file, oldPath) => this.handleRenameEvent(file, oldPath));

        this.logger.info("SyncService: Vault listeners registered.");
    }

    /** 设置排除路径 */
    setExcludePaths(paths: string[]) {
        this.excludePaths = paths;
    }

    private handleFileEvent(file: TAbstractFile, type: "changed" | "deleted") {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (this.isExcluded(file.path)) return;

        if (type === "deleted") {
            this.events.emit(BaizeEvents.FILE_DELETED, file.path);
            return;
        }

        // 500ms 防抖，防止实时保存时频繁触发索引
        if (this.debounceTimers.has(file.path)) {
            clearTimeout(this.debounceTimers.get(file.path)!);
        }

        const timer = setTimeout(() => {
            this.debounceTimers.delete(file.path);
            this.events.emit(BaizeEvents.FILE_CHANGED, file.path);
        }, 500);

        this.debounceTimers.set(file.path, timer);
    }

    private handleRenameEvent(file: TAbstractFile, oldPath: string) {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (this.isExcluded(file.path)) return;

        this.events.emit(BaizeEvents.FILE_RENAMED, oldPath, file.path);
    }

    /** 检查路径是否被过滤 */
    private isExcluded(path: string): boolean {
        // 简单的前缀检查，后续可以支持通配符
        return this.excludePaths.some(ex => path.startsWith(ex));
    }
}
