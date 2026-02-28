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
        results = [];

        try {
            plugin.logger.info(`[UI] Search triggered: "${query}"`);

            // 1. 检查模型是否就绪
            if (!plugin.transformersAdapter) {
                plugin.logger.warn("[UI] TransformersAdapter not ready");
                return;
            }

            // 2. 编码查询
            plugin.logger.info("[UI] Encoding query...");
            const queryVector = await plugin.transformersAdapter.embed(query);
            plugin.logger.info(`[UI] Query encoded, vector length: ${queryVector.length}`);

            // 3. 检查向量存储
            if (!plugin.vectorStore) {
                plugin.logger.warn("[UI] VectorStore not ready");
                return;
            }

            // 4. 执行搜索
            plugin.logger.info("[UI] Searching vector store...");
            const searchResults = await plugin.vectorStore.search(queryVector, 10, 0.3);
            plugin.logger.info(`[UI] Found ${searchResults.length} results`);

            results = searchResults;
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
    /* 样式已移至 styles/components.css */
</style>
