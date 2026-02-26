/**
 * 白泽 Baize - 桌面端平台适配
 * 
 * 桌面端特有功能：
 * 1. 全局快捷键 Ctrl/Cmd+Shift+B 呼出语义搜索
 * 2. 拖拽支持（搜索结果片段 → 编辑器）
 */
import type { Plugin } from "obsidian";
import { VIEW_TYPE_BAIZE } from "../../shared/constants";
import type { Logger } from "../../shared/logger";

export class DesktopPlatform {
    private plugin: Plugin;
    private logger: Logger;

    constructor(plugin: Plugin, logger: Logger) {
        this.plugin = plugin;
        this.logger = logger;
    }

    /** 初始化桌面端功能 */
    init(): void {
        this.registerHotkey();
        this.logger.debug("桌面端功能已初始化");
    }

    /**
     * 注册全局快捷键 Ctrl/Cmd+Shift+B
     * 
     * Obsidian 的 addCommand + hotkeys 方式注册
     * 用户可以在设置中自定义修改快捷键
     */
    private registerHotkey(): void {
        this.plugin.addCommand({
            id: "toggle-baize-panel",
            name: "切换白泽面板",
            hotkeys: [
                {
                    modifiers: ["Mod", "Shift"],
                    key: "b",
                },
            ],
            callback: () => {
                const { workspace } = this.plugin.app;
                const leaves = workspace.getLeavesOfType(VIEW_TYPE_BAIZE);

                if (leaves.length > 0) {
                    // 面板已存在，切换可见性
                    const leaf = leaves[0];
                    if (leaf === workspace.getActiveViewOfType(null as never)?.leaf) {
                        // 当前已聚焦在白泽面板，隐藏它
                        leaf.detach();
                    } else {
                        // 激活白泽面板
                        workspace.revealLeaf(leaf);
                    }
                } else {
                    // 面板不存在，创建并激活
                    const rightLeaf = workspace.getRightLeaf(false);
                    if (rightLeaf) {
                        rightLeaf.setViewState({
                            type: VIEW_TYPE_BAIZE,
                            active: true,
                        });
                        workspace.revealLeaf(rightLeaf);
                    }
                }
            },
        });
        this.logger.debug("快捷键 Ctrl/Cmd+Shift+B 已注册");
    }

    /**
     * 为元素启用拖拽支持
     * 搜索结果卡片可拖拽文本片段到编辑器
     * 
     * @param element - 可拖拽的 DOM 元素
     * @param text - 拖拽时携带的文本内容
     */
    static enableDrag(element: HTMLElement, text: string): void {
        element.setAttribute("draggable", "true");
        element.addEventListener("dragstart", (e: DragEvent) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData("text/plain", text);
                e.dataTransfer.effectAllowed = "copy";
                // 添加拖拽中的视觉反馈
                element.classList.add("baize-dragging");
            }
        });
        element.addEventListener("dragend", () => {
            element.classList.remove("baize-dragging");
        });
    }

    /** 清理（如需要） */
    destroy(): void {
        // 命令注册会在插件 unload 时自动清理
    }
}
