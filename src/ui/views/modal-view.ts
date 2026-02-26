/**
 * 白泽 Baize - 移动端全屏/半屏弹出视图
 * 基于 Obsidian Modal 实现，挂载 Svelte MobileLayout 组件
 */
import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import MobileLayout from "../layouts/MobileLayout.svelte";

export class BaizeModalView extends Modal {
    private component: any;

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        // 设置移动端特有样式类
        this.modalEl.addClass("baize-mobile-modal");

        const { contentEl } = this;
        contentEl.empty();

        // 挂载 Svelte 5 组件
        this.component = mount(MobileLayout, {
            target: contentEl,
            props: {
                app: this.app
            }
        });
    }

    onClose() {
        if (this.component) {
            unmount(this.component);
            this.component = null;
        }
    }
}
