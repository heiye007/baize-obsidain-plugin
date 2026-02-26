<script lang="ts">
    import type BaizePlugin from "../../main";
    import type { SearchResult } from "../../domain/models/search-result";
    import SearchBar from "./SearchBar.svelte";
    import ResultCard from "./ResultCard.svelte";

    interface Props {
        plugin: BaizePlugin;
    }

    let { plugin }: Props = $props();

    let isSearching = $state(false);
    let results: SearchResult[] = $state([]);
    let hasSearched = $state(false);

    async function handleSearch(query: string) {
        isSearching = true;
        hasSearched = true;
        try {
            // TODO: 接入 SearchService
            // results = await plugin.searchService.search(query);
            plugin.logger.info(`[UI] Search triggered: "${query}"`);
            results = [];
        } catch (err) {
            plugin.logger.error("[UI] Search failed:", err);
        } finally {
            isSearching = false;
        }
    }
</script>

<div class="baize-search-panel">
    <SearchBar {plugin} onSearch={handleSearch} {isSearching} />

    <div class="search-results-area">
        {#if isSearching}
            <div class="results-loading">
                <div class="loading-dots">
                    <span></span><span></span><span></span>
                </div>
                <p>正在搜索知识库...</p>
            </div>
        {:else if hasSearched && results.length > 0}
            <div class="results-count">
                找到 {results.length} 条相关结果
            </div>
            {#each results as result (result.chunk.vectorId)}
                <ResultCard {result} app={plugin.app} />
            {/each}
        {:else if hasSearched && results.length === 0}
            <div class="results-empty">
                <p>没有找到相关笔记</p>
                <p class="hint">试试换个关键词？</p>
            </div>
        {:else if !hasSearched}
            <div class="results-empty">
                <p class="hint">输入关键词，开始语义搜索</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .baize-search-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .search-results-area {
        flex: 1;
        overflow-y: auto;
        padding: 0 var(--baize-spacing-md);
    }

    .results-loading,
    .results-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--baize-spacing-xl) 0;
        color: var(--text-muted);
    }

    .results-empty .hint {
        font-size: var(--baize-font-size-xs);
        color: var(--text-faint);
        margin-top: 4px;
    }

    .results-count {
        font-size: var(--baize-font-size-xs);
        color: var(--text-muted);
        padding: var(--baize-spacing-xs) 0 var(--baize-spacing-sm);
    }

    /* 三点加载动画 */
    .loading-dots {
        display: flex;
        gap: 6px;
        margin-bottom: 12px;
    }

    .loading-dots span {
        width: 8px;
        height: 8px;
        background-color: var(--baize-gold);
        border-radius: 50%;
        animation: baize-bounce 1.2s infinite ease-in-out;
    }

    .loading-dots span:nth-child(2) {
        animation-delay: 0.2s;
    }

    .loading-dots span:nth-child(3) {
        animation-delay: 0.4s;
    }

    @keyframes baize-bounce {
        0%,
        80%,
        100% {
            transform: scale(0.6);
            opacity: 0.4;
        }
        40% {
            transform: scale(1);
            opacity: 1;
        }
    }
</style>
