<script lang="ts">
    import { onMount } from "svelte";
    import { BaizeEvents } from "../../shared/event-bus";
    import type BaizePlugin from "../../main";
    import type { SearchResult } from "../../domain/models/search-result";

    interface Props {
        plugin: BaizePlugin;
    }

    let { plugin }: Props = $props();

    let insights: SearchResult[] = $state([]);
    let currentNote = $state("");
    let isLoading = $state(false);
    let indexReady = $state(false); // TODO: 从实际索引状态读取

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
    .baize-insight-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
    }

    .insight-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px var(--baize-spacing-md);
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .insight-title {
        font-size: var(--baize-font-size-sm);
        font-weight: 600;
        color: var(--text-normal);
    }

    .insight-current {
        font-size: var(--baize-font-size-xs);
        color: var(--text-faint);
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .insight-content {
        flex: 1;
        overflow-y: auto;
        padding: var(--baize-spacing-sm) var(--baize-spacing-md);
    }

    /* 引导提示 */
    .insight-guide,
    .insight-empty,
    .insight-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--baize-spacing-xl) 0;
        color: var(--text-muted);
        text-align: center;
        gap: 4px;
    }

    .guide-icon,
    .empty-icon {
        font-size: 36px;
        margin-bottom: 8px;
    }

    .guide-hint,
    .empty-hint {
        font-size: var(--baize-font-size-xs);
        color: var(--text-faint);
        max-width: 200px;
        line-height: 1.4;
    }

    /* 加载动画 */
    .loading-pulse {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--baize-gold);
        opacity: 0.3;
        animation: pulse-ring 1.5s ease-in-out infinite;
        margin-bottom: 12px;
    }

    @keyframes pulse-ring {
        0% {
            transform: scale(0.8);
            opacity: 0.3;
        }
        50% {
            transform: scale(1.2);
            opacity: 0.6;
        }
        100% {
            transform: scale(0.8);
            opacity: 0.3;
        }
    }

    /* 推荐卡片 */
    .insight-card {
        display: flex;
        gap: 10px;
        padding: var(--baize-spacing-sm) var(--baize-spacing-sm);
        border: 1px solid var(--background-modifier-border);
        border-radius: var(--baize-radius-md);
        margin-bottom: var(--baize-spacing-sm);
        cursor: pointer;
        transition: all var(--baize-transition-fast);
        user-select: none;
    }

    .insight-card:hover {
        border-color: var(--baize-gold-light);
        box-shadow: var(--baize-shadow-sm);
        transform: translateX(2px);
    }

    .card-rank {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: var(--baize-radius-full);
        background: var(--background-modifier-border);
        color: var(--text-muted);
        font-size: var(--baize-font-size-xs);
        font-weight: bold;
        flex-shrink: 0;
    }

    .insight-card:first-child .card-rank {
        background: linear-gradient(
            135deg,
            var(--baize-gold),
            var(--baize-gold-dark)
        );
        color: white;
    }

    .card-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .card-top-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
    }

    .card-title {
        font-size: var(--baize-font-size-sm);
        font-weight: 600;
        color: var(--text-normal);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .card-score {
        font-size: var(--baize-font-size-xs);
        font-weight: bold;
        flex-shrink: 0;
    }

    .card-heading {
        font-size: var(--baize-font-size-xs);
        color: var(--text-faint);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .card-snippet {
        font-size: var(--baize-font-size-xs);
        color: var(--text-muted);
        line-height: 1.4;
        margin: 2px 0;
        /* 限制两行 */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .card-path {
        font-size: 10px;
        color: var(--text-faint);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
