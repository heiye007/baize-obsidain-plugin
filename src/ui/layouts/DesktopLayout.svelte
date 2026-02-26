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
        // 记住上次激活的 Tab (从设置中读取?)
        // 暂时使用简单的内存记录，后续可以持久化到 plugin.settings
        const lastTab = (plugin.settings as any).lastActiveTab;
        if (lastTab) activeTab = lastTab;
    });

    function switchTab(tab: string) {
        activeTab = tab;
        // 保存到设置
        (plugin.settings as any).lastActiveTab = tab;
        plugin.saveSettings();
    }
</script>

<div class="baize-desktop-container" data-app-version={app.version}>
    <!-- 顶部状态栏 -->
    <StatusBar {plugin} />

    <!-- 导航标签栏 -->
    <nav class="baize-tabs">
        <button
            class="baize-tab-item"
            class:active={activeTab === "search"}
            onclick={() => switchTab("search")}
        >
            搜索
        </button>
        <button
            class="baize-tab-item"
            class:active={activeTab === "chat"}
            onclick={() => switchTab("chat")}
        >
            对话
        </button>
        <button
            class="baize-tab-item"
            class:active={activeTab === "insight"}
            onclick={() => switchTab("insight")}
        >
            联想
        </button>
    </nav>

    <!-- 主内容区 -->
    <main class="baize-content">
        {#if activeTab === "search"}
            <div in:fade={{ duration: 200 }}>
                <SearchPanel {plugin} />
            </div>
        {:else if activeTab === "chat"}
            <div in:fade={{ duration: 200 }}>
                <ChatPanel {plugin} />
            </div>
        {:else if activeTab === "insight"}
            <div in:fade={{ duration: 200 }}>
                <InsightPanel {plugin} />
            </div>
        {/if}
    </main>
</div>

<style>
    .baize-desktop-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background-color: var(--baize-bg-primary);
    }

    .baize-tabs {
        display: flex;
        border-bottom: 1px solid var(--divider-color);
        background-color: var(--baize-bg-secondary);
        padding: 0 8px;
    }

    .baize-tab-item {
        flex: 1;
        padding: 8px 4px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--baize-text-secondary);
        cursor: pointer;
        font-size: var(--baize-font-size-sm);
        transition: all var(--baize-transition-fast);
        box-shadow: none !important;
        border-radius: 0;
    }

    .baize-tab-item:hover {
        color: var(--baize-text-primary);
        background-color: var(--background-modifier-hover);
    }

    .baize-tab-item.active {
        color: var(--baize-text-accent);
        border-bottom-color: var(--baize-gold);
        font-weight: bold;
    }

    .baize-content {
        flex: 1;
        overflow-y: auto;
        position: relative;
    }

    /* 样式穿透到占位组件 */
    :global(.panel-placeholder) {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: var(--text-muted);
        font-style: italic;
    }
</style>
