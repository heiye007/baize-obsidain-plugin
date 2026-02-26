/**
 * 白泽 Baize - 桌面端侧边栏视图
 * Obsidian ItemView 容器，挂载 Svelte DesktopLayout 组件
 */
import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_BAIZE } from "../../shared/constants";
import { ICON_BAIZE } from "../../shared/icon";

export class BaizeSidebarView extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_BAIZE;
    }

    getDisplayText(): string {
        return "白泽 Baize";
    }

    getIcon(): string {
        return ICON_BAIZE;
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl("div", {
            cls: "baize-root",
            text: "白泽正在加载...",
        });
        // TODO: 第四阶段挂载 Svelte DesktopLayout 组件
    }

    async onClose(): Promise<void> {
        // TODO: 销毁 Svelte 组件实例
    }
}
