import { ItemView, WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import { VIEW_TYPE_BAIZE } from "../../shared/constants";
import { ICON_BAIZE } from "../../shared/icon";
import type BaizePlugin from "../../main";
import DesktopLayout from "../layouts/DesktopLayout.svelte";

export class BaizeSidebarView extends ItemView {
    private component: any;
    private plugin: BaizePlugin;

    constructor(leaf: WorkspaceLeaf, plugin: BaizePlugin) {
        super(leaf);
        this.plugin = plugin;
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

        // 挂载 Svelte 5 组件
        this.component = mount(DesktopLayout, {
            target: container,
            props: {
                app: this.app,
                plugin: this.plugin
            }
        });
    }

    async onClose(): Promise<void> {
        if (this.component) {
            unmount(this.component);
            this.component = null;
        }
    }
}
