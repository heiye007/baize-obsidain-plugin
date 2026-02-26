<script lang="ts">
    import { onMount } from "svelte";
    import { BaizeEvents } from "../../shared/event-bus";
    import type BaizePlugin from "../../main";

    interface Props {
        plugin: BaizePlugin;
    }

    let { plugin }: Props = $props();

    let status = $state("idle"); // idle, indexing, complete, error
    let progress = $state(0);
    let message = $state("");

    onMount(() => {
        const bus = plugin.eventBus;

        const onProgress = (data: any) => {
            status = "indexing";
            progress = data.percentage || 0;
            message = `正在索引: ${data.indexedFiles}/${data.totalFiles}`;
        };

        const onComplete = () => {
            status = "complete";
            progress = 100;
            message = "索引已完成";
            setTimeout(() => {
                if (status === "complete") status = "idle";
            }, 3000);
        };

        const onError = (msg: unknown) => {
            status = "error";
            message = `错误: ${String(msg)}`;
        };

        bus.on(BaizeEvents.INDEX_PROGRESS, onProgress);
        bus.on(BaizeEvents.INDEX_COMPLETE, onComplete);
        bus.on(BaizeEvents.INDEX_ERROR, onError);

        return () => {
            bus.off(BaizeEvents.INDEX_PROGRESS, onProgress);
            bus.off(BaizeEvents.INDEX_COMPLETE, onComplete);
            bus.off(BaizeEvents.INDEX_ERROR, onError);
        };
    });
</script>

<div class="baize-status-bar" class:status-indexing={status === "indexing"}>
    {#if status === "indexing"}
        <div class="progress-container">
            <div class="progress-bar" style="width: {progress}%"></div>
        </div>
        <span class="status-text">{message}</span>
    {:else if status === "error"}
        <span class="status-text error">{message}</span>
    {:else if status === "complete"}
        <span class="status-text success">✨ {message}</span>
    {:else}
        <!-- Idle 状态显示简单的 Logo 或 提示 -->
        <span class="status-text muted">白泽已就绪</span>
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

    .status-text {
        color: var(--baize-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .status-text.error {
        color: var(--text-error);
    }
    .status-text.success {
        color: var(--text-success);
    }
    .status-text.muted {
        opacity: 0.6;
    }
</style>
