<script lang="ts">
    import { onMount } from "svelte";
    import type BaizePlugin from "../../main";

    interface Props {
        plugin: BaizePlugin;
        onSearch: (query: string) => void;
        isSearching?: boolean;
    }

    let { plugin, onSearch, isSearching = false }: Props = $props();

    let query = $state("");
    let showHistory = $state(false);
    let history: string[] = $state([]);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const MAX_HISTORY = 10;
    const DEBOUNCE_MS = 300;
    const STORAGE_KEY = "baize-search-history";

    onMount(() => {
        // 从本地存储加载历史
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) history = JSON.parse(saved);
        } catch {
            /* ignore */
        }
    });

    function saveHistory() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch {
            /* ignore */
        }
    }

    function addToHistory(q: string) {
        const trimmed = q.trim();
        if (!trimmed) return;
        // 去重：如果已存在则移到最前面
        history = [trimmed, ...history.filter((h) => h !== trimmed)].slice(
            0,
            MAX_HISTORY,
        );
        saveHistory();
    }

    function handleInput() {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (!query.trim()) return;

        debounceTimer = setTimeout(() => {
            triggerSearch();
        }, DEBOUNCE_MS);
    }

    function triggerSearch() {
        if (debounceTimer) clearTimeout(debounceTimer);
        const q = query.trim();
        if (!q) return;
        addToHistory(q);
        showHistory = false;
        onSearch(q);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            e.preventDefault();
            triggerSearch();
        }
        if (e.key === "Escape") {
            showHistory = false;
        }
    }

    function clearQuery() {
        query = "";
        showHistory = false;
        if (debounceTimer) clearTimeout(debounceTimer);
    }

    function selectHistory(item: string) {
        query = item;
        showHistory = false;
        triggerSearch();
    }

    function removeHistory(item: string, e: MouseEvent) {
        e.stopPropagation();
        history = history.filter((h) => h !== item);
        saveHistory();
    }

    function clearAllHistory() {
        history = [];
        saveHistory();
        showHistory = false;
    }
</script>

<div class="baize-search-bar" data-plugin-id={plugin.manifest.id}>
    <div class="search-input-wrapper">
        <!-- 搜索图标 -->
        <svg
            class="search-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
        >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
        </svg>

        <input
            type="text"
            class="search-input"
            placeholder="语义搜索你的笔记..."
            bind:value={query}
            oninput={handleInput}
            onkeydown={handleKeydown}
            onfocus={() => {
                if (history.length > 0) showHistory = true;
            }}
        />

        <!-- 加载动画 -->
        {#if isSearching}
            <div class="search-spinner"></div>
        {/if}

        <!-- 清空按钮 -->
        {#if query.length > 0 && !isSearching}
            <button class="clear-btn" onclick={clearQuery} title="清空">
                <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path d="M18 6 6 18M6 6l12 12" />
                </svg>
            </button>
        {/if}
    </div>

    <!-- 搜索历史下拉 -->
    {#if showHistory && history.length > 0}
        <div class="search-history">
            <div class="history-header">
                <span>最近搜索</span>
                <button class="history-clear-all" onclick={clearAllHistory}
                    >清除全部</button
                >
            </div>
            {#each history as item}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="history-item"
                    onclick={() => selectHistory(item)}
                    onkeydown={(e) => {
                        if (e.key === "Enter") selectHistory(item);
                    }}
                    role="button"
                    tabindex="0"
                >
                    <svg
                        class="history-icon"
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <polyline points="12 8 12 12 14 14" />
                        <circle cx="12" cy="12" r="10" />
                    </svg>
                    <span class="history-text">{item}</span>
                    <button
                        class="history-remove"
                        onclick={(e) => removeHistory(item, e)}
                        title="删除"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            width="10"
                            height="10"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- 背景遮罩：点击任何位置关闭历史 -->
{#if showHistory}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="history-backdrop"
        onclick={() => (showHistory = false)}
        onkeydown={() => {}}
    ></div>
{/if}

<style>
    .baize-search-bar {
        position: relative;
        padding: var(--baize-spacing-sm) var(--baize-spacing-md);
    }

    .search-input-wrapper {
        display: flex;
        align-items: center;
        gap: 6px;
        background-color: var(--background-modifier-form-field);
        border: 1px solid var(--background-modifier-border);
        border-radius: var(--baize-radius-md);
        padding: 6px 10px;
        transition: border-color var(--baize-transition-fast);
    }

    .search-input-wrapper:focus-within {
        border-color: var(--baize-gold);
        box-shadow: 0 0 0 2px rgba(201, 169, 110, 0.15);
    }

    .search-icon {
        flex-shrink: 0;
        color: var(--text-muted);
    }

    .search-input {
        flex: 1;
        border: none;
        background: transparent;
        outline: none;
        color: var(--text-normal);
        font-size: var(--baize-font-size-md);
        padding: 2px 0;
    }

    .search-input::placeholder {
        color: var(--text-faint);
    }

    .clear-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border: none;
        background: var(--background-modifier-border);
        border-radius: var(--baize-radius-full);
        color: var(--text-muted);
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        transition: all var(--baize-transition-fast);
        box-shadow: none !important;
    }

    .clear-btn:hover {
        background: var(--text-muted);
        color: var(--background-primary);
    }

    /* 加载动画 */
    .search-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid var(--background-modifier-border);
        border-top-color: var(--baize-gold);
        border-radius: 50%;
        animation: baize-spin 0.6s linear infinite;
        flex-shrink: 0;
    }

    @keyframes baize-spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* 搜索历史下拉 */
    .search-history {
        position: absolute;
        left: var(--baize-spacing-md);
        right: var(--baize-spacing-md);
        top: 100%;
        background: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
        border-radius: var(--baize-radius-md);
        box-shadow: var(--baize-shadow-md);
        z-index: 100;
        overflow: hidden;
        margin-top: 4px;
    }

    .history-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        font-size: var(--baize-font-size-xs);
        color: var(--text-muted);
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .history-clear-all {
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        font-size: var(--baize-font-size-xs);
        padding: 2px 4px;
        border-radius: var(--baize-radius-sm);
        box-shadow: none !important;
    }

    .history-clear-all:hover {
        color: var(--text-error);
    }

    .history-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 10px;
        border: none;
        background: transparent;
        color: var(--text-normal);
        cursor: pointer;
        font-size: var(--baize-font-size-sm);
        text-align: left;
        transition: background var(--baize-transition-fast);
        box-shadow: none !important;
        border-radius: 0;
        user-select: none;
    }

    .history-item:hover {
        background: var(--background-modifier-hover);
    }

    .history-icon {
        flex-shrink: 0;
        color: var(--text-faint);
    }

    .history-text {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .history-remove {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border: none;
        background: transparent;
        color: var(--text-faint);
        cursor: pointer;
        padding: 0;
        opacity: 0;
        transition: opacity var(--baize-transition-fast);
        box-shadow: none !important;
    }

    .history-item:hover .history-remove {
        opacity: 1;
    }

    .history-remove:hover {
        color: var(--text-error);
    }

    .history-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99;
    }
</style>
