<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import type BaizePlugin from "../../main";
    import StatusBar from "../components/StatusBar.svelte";
    import SearchPanel from "../components/SearchPanel.svelte";
    import ChatPanel from "../components/ChatPanel.svelte";
    import InsightPanel from "../components/InsightPanel.svelte";

    interface Props {
        app: any;
        plugin: BaizePlugin;
    }

    let { app, plugin }: Props = $props();

    // 状态管理
    let activeTab = $state("search"); // search, chat, insight

    onMount(() => {
        // 还原上次激活的 Tab
        const lastTab = (plugin.settings as any).lastActiveTab;
        if (lastTab) activeTab = lastTab;
    });

    function switchTab(tab: string) {
        activeTab = tab;
        (plugin.settings as any).lastActiveTab = tab;
        plugin.saveSettings();
    }
</script>

<div class="baize-mobile-container" data-app-version={app.version}>
    <!-- 顶部拖拽指示条 (视觉引导) -->
    <div class="baize-drag-indicator"></div>

    <!-- 顶部状态栏 -->
    <StatusBar {plugin} />

    <!-- 移动端分段控制器 -->
    <nav class="baize-segmented-control">
        <button
            class="baize-segmented-item"
            class:active={activeTab === "search"}
            onclick={() => switchTab("search")}
        >
            搜索
        </button>
        <button
            class="baize-segmented-item"
            class:active={activeTab === "chat"}
            onclick={() => switchTab("chat")}
        >
            对话
        </button>
        <button
            class="baize-segmented-item"
            class:active={activeTab === "insight"}
            onclick={() => switchTab("insight")}
        >
            联想
        </button>
    </nav>

    <!-- 主内容区 -->
    <main class="baize-mobile-content">
        {#if activeTab === "search"}
            <div in:fade={{ duration: 150 }}>
                <SearchPanel {plugin} />
            </div>
        {:else if activeTab === "chat"}
            <div in:fade={{ duration: 150 }}>
                <ChatPanel {plugin} />
            </div>
        {:else if activeTab === "insight"}
            <div in:fade={{ duration: 150 }}>
                <InsightPanel {plugin} />
            </div>
        {/if}
    </main>
</div>

<style>
    .baize-mobile-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: 85vh;
        background-color: var(--baize-bg-primary);
        /* 适配 iOS 安全区域：底部 Home Indicator */
        padding-bottom: env(safe-area-inset-bottom, 20px);
    }

    .baize-drag-indicator {
        width: 36px;
        height: 4px;
        background-color: var(--background-modifier-border);
        border-radius: 2px;
        margin: 8px auto;
        flex-shrink: 0;
    }

    .baize-mobile-content {
        flex: 1;
        overflow-y: auto;
        padding: 0 var(--baize-spacing-md);
        /* 避免内容被底部安全区切断 */
        margin-bottom: var(--baize-spacing-md);
    }

    /* 针对移动端触摸屏优化 */
    :global(.baize-segmented-item) {
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
    }
</style>
