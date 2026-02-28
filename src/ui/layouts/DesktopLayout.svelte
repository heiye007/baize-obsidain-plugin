<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { BaizeEvents } from "../../shared/event-bus";
    import { ICON_BAIZE_SVG } from "../../shared/icon";
    import type BaizePlugin from "../../main";
    import SearchPanel from "../components/SearchPanel.svelte";
    import ChatPanel from "../components/ChatPanel.svelte";
    import InsightPanel from "../components/InsightPanel.svelte";

    interface Props {
        app: any;
        plugin: BaizePlugin;
    }

    let { app, plugin }: Props = $props();

    let activeTab = $state("chat"); // chat, search, insight  (原型默认对话)
    let statusReady = $state(false);

    onMount(() => {
        const lastTab = plugin.settings.lastActiveTab;
        if (lastTab) activeTab = lastTab;

        // 检查模型是否已就绪（可能已提前加载完成）
        if (plugin.transformersAdapter) {
            statusReady = true;
        }

        // 监听模型就绪事件
        const handleModelReady = () => {
            statusReady = true;
        };
        plugin.eventBus.on(BaizeEvents.MODEL_READY, handleModelReady);

        return () => {
            plugin.eventBus.off(BaizeEvents.MODEL_READY, handleModelReady);
        };
    });

    function switchTab(tab: string) {
        activeTab = tab;
        plugin.settings.lastActiveTab = tab;
        plugin.saveSettings();
    }
</script>

<div class="baize-desktop" data-app-version={app.version}>
    <!-- ═══ 顶部品牌栏 ═══ -->
    <header class="baize-brand-header">
        <div class="brand-left">
            <svg
                class="brand-logo-svg"
                viewBox="0 0 100 100"
                width="28"
                height="28"
                fill="var(--baize-gold, #c6a667)"
            >
                {@html ICON_BAIZE_SVG}
            </svg>
            <span class="brand-name"
                >白泽 <span class="brand-en">B A I Z E</span></span
            >
        </div>
        <div class="status-dot" class:ready={statusReady}></div>
    </header>

    <!-- ═══ 标签切换器 ═══ -->
    <nav class="baize-tab-bar">
        <button
            class="baize-tab"
            class:active={activeTab === "chat"}
            onclick={() => switchTab("chat")}>瑞兽对话</button
        >
        <button
            class="baize-tab"
            class:active={activeTab === "search"}
            onclick={() => switchTab("search")}>语义搜索</button
        >
        <button
            class="baize-tab"
            class:active={activeTab === "insight"}
            onclick={() => switchTab("insight")}>灵感联想</button
        >
    </nav>

    <!-- ═══ 内容区域 ═══ -->
    <main class="baize-view-area">
        {#if activeTab === "chat"}
            <div in:fade={{ duration: 180 }}>
                <ChatPanel {plugin} />
            </div>
        {:else if activeTab === "search"}
            <div in:fade={{ duration: 180 }}>
                <SearchPanel {plugin} />
            </div>
        {:else if activeTab === "insight"}
            <div in:fade={{ duration: 180 }}>
                <InsightPanel {plugin} />
            </div>
        {/if}
    </main>
</div>

<style>
    /* 样式已移至 styles/desktop.css 以确保正确的全局优先级和主题适配 */
</style>
