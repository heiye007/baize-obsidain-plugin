<script lang="ts">
    import { onMount } from "svelte";
    import { BaizeEvents } from "../../shared/event-bus";
    import type BaizePlugin from "../../main";
    import type { SearchResult } from "../../domain/models/search-result";

    interface Props {
        plugin: BaizePlugin;
    }

    let { plugin }: Props = $props();

    let insights: SearchResult[] = $state(plugin.lastInsightPayload?.results || []);
    let currentNote = $state(plugin.lastInsightPayload?.notePath || "");
    let isLoading = $state(false);
    let indexReady = $state(true); // 默认已就绪，避免重启后没有索引完成事件导致一直卡住

    onMount(() => {
        const bus = plugin.eventBus;

        // 监听知识联想更新事件
        const onInsightUpdated = (data: unknown) => {
            const payload = data as {
                notePath: string;
                results: SearchResult[];
            };
            currentNote = payload.notePath;
            insights = payload.results;
            isLoading = false;
        };

        // 监听索引完成事件
        const onIndexComplete = () => {
            indexReady = true;
        };

        // 监听笔记切换（加载中状态）
        const onSearchStart = () => {
            isLoading = true;
        };

        bus.on(BaizeEvents.INSIGHT_UPDATED, onInsightUpdated);
        bus.on(BaizeEvents.INDEX_COMPLETE, onIndexComplete);
        bus.on(BaizeEvents.SEARCH_START, onSearchStart);

        return () => {
            bus.off(BaizeEvents.INSIGHT_UPDATED, onInsightUpdated);
            bus.off(BaizeEvents.INDEX_COMPLETE, onIndexComplete);
            bus.off(BaizeEvents.SEARCH_START, onSearchStart);
        };
    });

    /** 跳转到推荐笔记 */
    async function navigateToNote(result: SearchResult) {
        const filePath = result.chunk.vectorId.split("::")[0];
        const file = plugin.app.vault.getAbstractFileByPath(filePath);
        if (!file) return;

        const leaf = plugin.app.workspace.getLeaf(false);
        await leaf.openFile(file as any, {
            eState: { line: result.chunk.lineStart - 1 },
        });
    }

    function getTitle(result: SearchResult): string {
        return (
            result.chunk.metadata.title ||
            result.chunk.vectorId.split("::")[0].split("/").pop() ||
            "未知文件"
        );
    }

    function getPath(result: SearchResult): string {
        return result.chunk.vectorId.split("::")[0];
    }

    function truncate(str: string, len: number): string {
        return str.length > len ? str.slice(0, len) + "…" : str;
    }

    function scoreColor(score: number): string {
        if (score >= 0.8) return "var(--text-success)";
        if (score >= 0.6) return "var(--baize-gold)";
        if (score >= 0.4) return "var(--text-warning, orange)";
        return "var(--text-muted)";
    }
</script>

<div class="baize-insight-panel" data-active={!!plugin}>
    <!-- 面板标题 -->
    <div class="insight-header">
        <span class="insight-title">💡 知识联想</span>
        {#if currentNote}
            <span class="insight-current" title={currentNote}>
                {currentNote.split("/").pop()}
            </span>
        {/if}
    </div>

    <div class="insight-content">
        {#if !indexReady}
            <!-- 索引未完成引导 -->
            <div class="insight-guide">
                <div class="guide-icon">📚</div>
                <p>索引尚未完成</p>
                <p class="guide-hint">
                    完成知识库索引后，白泽将自动推荐与当前笔记相关的内容
                </p>
            </div>
        {:else if isLoading}
            <!-- 加载中 -->
            <div class="insight-loading">
                <div class="loading-pulse"></div>
                <p>正在分析当前笔记...</p>
            </div>
        {:else if insights.length === 0}
            <!-- 空状态 -->
            <div class="insight-empty">
                <div class="empty-icon">🔍</div>
                <p>暂无联想结果</p>
                <p class="empty-hint">切换到其他笔记试试</p>
            </div>
        {:else}
            <!-- 推荐列表 -->
            {#each insights as result, i}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="insight-card"
                    onclick={() => navigateToNote(result)}
                    onkeydown={(e) => {
                        if (e.key === "Enter") navigateToNote(result);
                    }}
                    role="button"
                    tabindex="0"
                >
                    <div class="card-rank">
                        {i + 1}
                    </div>
                    <div class="card-info">
                        <div class="card-top-row">
                            <span class="card-title">{getTitle(result)}</span>
                            <span
                                class="card-score"
                                style="color: {scoreColor(result.score)}"
                            >
                                {Math.round(result.score * 100)}%
                            </span>
                        </div>
                        {#if result.chunk.metadata.headings.length > 0}
                            <span class="card-heading">
                                {result.chunk.metadata.headings.join(" › ")}
                            </span>
                        {/if}
                        <p class="card-snippet">
                            {truncate(result.chunk.text, 120)}
                        </p>
                        <span class="card-path">{getPath(result)}</span>
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

<style>
    /* 样式已移至 styles/components.css */
</style>
