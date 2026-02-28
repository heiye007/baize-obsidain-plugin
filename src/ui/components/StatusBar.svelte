<script lang="ts">
    import { onMount } from "svelte";
    import { BaizeEvents } from "../../shared/event-bus";
    import type BaizePlugin from "../../main";

    interface Props {
        plugin: BaizePlugin;
    }

    let { plugin }: Props = $props();

    // 索引状态
    let indexStatus = $state("idle"); // idle, indexing, complete, error
    let indexProgress = $state(0);
    let indexMessage = $state("");
    let indexedFiles = $state(0);
    let totalFiles = $state(0);

    // 模型状态
    let modelStatus = $state("unloaded"); // unloaded, loading, downloading, ready, error
    let modelProgress = $state(0);
    let modelName = $state("");

    // 数据库统计
    let vectorCount = $state(0);
    let dbSize = $state("");

    // 展开/折叠详情
    let expanded = $state(false);

    onMount(() => {
        const bus = plugin.eventBus;

        // ── 索引事件 ──
        const onIndexProgress = (data: unknown) => {
            const d = data as any;
            indexStatus = "indexing";
            indexProgress = d.percentage || 0;
            indexedFiles = d.indexedFiles || 0;
            totalFiles = d.totalFiles || 0;
            indexMessage = `正在索引: ${indexedFiles}/${totalFiles}`;
        };

        const onIndexComplete = (data: unknown) => {
            const d = data as any;
            indexStatus = "complete";
            indexProgress = 100;
            indexMessage = "索引已完成";
            if (d?.vectorCount) vectorCount = d.vectorCount;
            if (d?.dbSize) dbSize = d.dbSize;
            setTimeout(() => {
                if (indexStatus === "complete") indexStatus = "idle";
            }, 3000);
        };

        const onIndexError = (msg: unknown) => {
            indexStatus = "error";
            indexMessage = `索引错误: ${String(msg)}`;
        };

        // ── 模型事件 ──
        const onModelLoading = (data: unknown) => {
            const d = data as any;
            modelStatus = d?.downloading ? "downloading" : "loading";
            modelName = d?.name || "";
            modelProgress = d?.progress || 0;
        };

        const onModelReady = (data: unknown) => {
            const d = data as any;
            modelStatus = "ready";
            modelName = d?.name || modelName;
        };

        const onModelError = () => {
            modelStatus = "error";
        };

        bus.on(BaizeEvents.INDEX_PROGRESS, onIndexProgress);
        bus.on(BaizeEvents.INDEX_COMPLETE, onIndexComplete);
        bus.on(BaizeEvents.INDEX_ERROR, onIndexError);
        bus.on(BaizeEvents.MODEL_LOADING, onModelLoading);
        bus.on(BaizeEvents.MODEL_READY, onModelReady);
        bus.on(BaizeEvents.MODEL_ERROR, onModelError);

        return () => {
            bus.off(BaizeEvents.INDEX_PROGRESS, onIndexProgress);
            bus.off(BaizeEvents.INDEX_COMPLETE, onIndexComplete);
            bus.off(BaizeEvents.INDEX_ERROR, onIndexError);
            bus.off(BaizeEvents.MODEL_LOADING, onModelLoading);
            bus.off(BaizeEvents.MODEL_READY, onModelReady);
            bus.off(BaizeEvents.MODEL_ERROR, onModelError);
        };
    });

    /** 获取综合状态图标 */
    function statusIcon(): string {
        if (indexStatus === "error" || modelStatus === "error") return "🔴";
        if (
            indexStatus === "indexing" ||
            modelStatus === "loading" ||
            modelStatus === "downloading"
        )
            return "🟡";
        if (modelStatus === "ready" && indexStatus !== "indexing") return "🟢";
        return "⚪";
    }

    /** 获取摘要文字 */
    function summaryText(): string {
        if (indexStatus === "indexing") return indexMessage;
        if (modelStatus === "downloading")
            return `下载模型: ${Math.round(modelProgress)}%`;
        if (modelStatus === "loading") return "加载模型中...";
        if (indexStatus === "error") return indexMessage;
        if (indexStatus === "complete") return "✨ 索引已完成";
        if (modelStatus === "ready") return "白泽已就绪";
        return "白泽已就绪";
    }

    function modelStatusText(): string {
        switch (modelStatus) {
            case "unloaded":
                return "未加载";
            case "loading":
                return "加载中...";
            case "downloading":
                return `下载中 ${Math.round(modelProgress)}%`;
            case "ready":
                return "✓ 就绪";
            case "error":
                return "✗ 错误";
            default:
                return "未知";
        }
    }

    function modelStatusColor(): string {
        switch (modelStatus) {
            case "ready":
                return "var(--text-success)";
            case "loading":
            case "downloading":
                return "var(--baize-gold)";
            case "error":
                return "var(--text-error)";
            default:
                return "var(--text-muted)";
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="baize-status-bar"
    class:has-activity={indexStatus === "indexing" ||
        modelStatus === "downloading"}
    onclick={() => (expanded = !expanded)}
    onkeydown={(e) => {
        if (e.key === "Enter") expanded = !expanded;
    }}
    role="button"
    tabindex="0"
>
    <!-- 进度条（索引或模型下载） -->
    {#if indexStatus === "indexing"}
        <div class="progress-container">
            <div class="progress-bar" style="width: {indexProgress}%"></div>
        </div>
    {:else if modelStatus === "downloading"}
        <div class="progress-container model-dl">
            <div class="progress-bar" style="width: {modelProgress}%"></div>
        </div>
    {/if}

    <!-- 摘要行 -->
    <div class="status-summary">
        <span class="status-dot">{statusIcon()}</span>
        <span class="status-text">{summaryText()}</span>
        <span class="expand-icon" class:rotated={expanded}>▾</span>
    </div>

    <!-- 展开详情 -->
    {#if expanded}
        <div class="status-details">
            <!-- 模型状态 -->
            <div class="detail-row">
                <span class="detail-label">嵌入模型</span>
                <span class="detail-value" style="color: {modelStatusColor()}">
                    {modelStatusText()}
                    {#if modelName}
                        <span class="detail-muted">({modelName})</span>
                    {/if}
                </span>
            </div>

            <!-- 索引状态 -->
            <div class="detail-row">
                <span class="detail-label">索引进度</span>
                <span class="detail-value">
                    {#if indexStatus === "indexing"}
                        {indexedFiles} / {totalFiles} 文件
                    {:else if indexedFiles > 0}
                        {indexedFiles} 文件已索引
                    {:else}
                        尚未索引
                    {/if}
                </span>
            </div>

            <!-- 数据库统计 -->
            <div class="detail-row">
                <span class="detail-label">向量数据</span>
                <span class="detail-value">
                    {#if vectorCount > 0}
                        {vectorCount.toLocaleString()} 条向量
                        {#if dbSize}
                            <span class="detail-muted">({dbSize})</span>
                        {/if}
                    {:else}
                        暂无数据
                    {/if}
                </span>
            </div>

            <!-- 平台 -->
            <div class="detail-row">
                <span class="detail-label">运行平台</span>
                <span class="detail-value">{plugin.platform}</span>
            </div>
        </div>
    {/if}
</div>

<style>
    .baize-status-bar {
        padding: 4px 12px;
        font-size: var(--baize-font-size-xs);
        border-bottom: 1px solid var(--divider-color);
        background-color: var(--baize-bg-secondary);
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-height: 24px;
        justify-content: center;
        cursor: pointer;
        transition: background-color var(--baize-transition-fast);
        user-select: none;
    }

    .baize-status-bar:hover {
        background-color: var(--background-modifier-hover);
    }

    .progress-container {
        height: 2px;
        background-color: var(--background-modifier-border);
        border-radius: 1px;
        overflow: hidden;
    }

    .progress-bar {
        height: 100%;
        background-color: var(--baize-gold);
        transition: width 0.3s ease;
    }

    .progress-container.model-dl .progress-bar {
        background: linear-gradient(
            90deg,
            var(--baize-gold),
            var(--baize-gold-light)
        );
    }

    .status-summary {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .status-dot {
        font-size: 8px;
        line-height: 1;
    }

    .status-text {
        flex: 1;
        color: var(--baize-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .expand-icon {
        color: var(--text-faint);
        font-size: 10px;
        transition: transform var(--baize-transition-fast);
    }

    .expand-icon.rotated {
        transform: rotate(180deg);
    }

    /* 详情面板 */
    .status-details {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-top: 6px;
        margin-top: 4px;
        border-top: 1px solid var(--background-modifier-border);
    }

    .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .detail-label {
        color: var(--text-faint);
        font-size: var(--baize-font-size-xs);
    }

    .detail-value {
        color: var(--text-normal);
        font-size: var(--baize-font-size-xs);
        text-align: right;
    }

    .detail-muted {
        color: var(--text-faint);
        font-size: 10px;
    }
</style>
