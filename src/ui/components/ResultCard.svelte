<script lang="ts">
    import type { SearchResult } from "../../domain/models/search-result";
    import type { App } from "obsidian";

    interface Props {
        result: SearchResult;
        app: App;
    }

    let { result, app }: Props = $props();

    // 解构关键数据
    let filePath = $derived(result.chunk.vectorId.split("::")[0]);
    let title = $derived(
        result.chunk.metadata.title || filePath.split("/").pop() || "未知文件",
    );
    let headingPath = $derived(result.chunk.metadata.headings.join(" › "));
    let scorePercent = $derived(Math.round(result.score * 100));
    let copied = $state(false);

    /** 获取分数对应的颜色等级 */
    function scoreColor(score: number): string {
        if (score >= 0.8) return "var(--text-success)";
        if (score >= 0.6) return "var(--baize-gold)";
        if (score >= 0.4) return "var(--text-warning, orange)";
        return "var(--text-muted)";
    }

    /** 跳转到原始笔记位置 */
    async function navigateToSource() {
        const file = app.vault.getAbstractFileByPath(filePath);
        if (!file) return;

        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(file as any, {
            eState: { line: result.chunk.lineStart - 1 },
        });
    }

    /** 复制片段内容 */
    async function copyContent(e: MouseEvent) {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(result.chunk.text);
            copied = true;
            setTimeout(() => {
                copied = false;
            }, 1500);
        } catch {
            /* fallback: do nothing */
        }
    }

    /** 渲染高亮文本 */
    function getHighlightedHtml(): string {
        const text = result.chunk.text;
        if (!result.highlights || result.highlights.length === 0) {
            return escapeHtml(truncate(text, 200));
        }

        // 收集所有高亮位置并去重合并
        const allPositions: [number, number][] = [];
        for (const h of result.highlights) {
            allPositions.push(...h.positions);
        }
        // 按起始位置排序
        allPositions.sort((a, b) => a[0] - b[0]);

        // 截取前 200 字符范围的文本
        const maxLen = 200;
        const truncatedText = text.slice(0, maxLen);
        let html = "";
        let cursor = 0;

        for (const [start, end] of allPositions) {
            if (start >= maxLen) break;
            const clampedEnd = Math.min(end, maxLen);
            if (start > cursor) {
                html += escapeHtml(truncatedText.slice(cursor, start));
            }
            html += `<mark class="baize-highlight">${escapeHtml(truncatedText.slice(start, clampedEnd))}</mark>`;
            cursor = clampedEnd;
        }
        if (cursor < truncatedText.length) {
            html += escapeHtml(truncatedText.slice(cursor));
        }
        if (text.length > maxLen) html += "…";

        return html;
    }

    function escapeHtml(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function truncate(str: string, len: number): string {
        return str.length > len ? str.slice(0, len) + "…" : str;
    }

    /** 拖拽支持（桌面端） */
    function handleDragStart(e: DragEvent) {
        e.dataTransfer?.setData("text/plain", result.chunk.text);
        e.dataTransfer?.setData(
            "text/uri-list",
            `obsidian://open?vault=&file=${encodeURIComponent(filePath)}`,
        );
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="baize-result-card"
    onclick={navigateToSource}
    onkeydown={(e) => {
        if (e.key === "Enter") navigateToSource();
    }}
    role="button"
    tabindex="0"
    draggable="true"
    ondragstart={handleDragStart}
>
    <!-- 卡片头部：来源信息 + 分数 -->
    <div class="card-header">
        <div class="card-source">
            <span class="card-title">{title}</span>
            {#if headingPath}
                <span class="card-heading">{headingPath}</span>
            {/if}
        </div>
        <span class="card-score" style="color: {scoreColor(result.score)}">
            {scorePercent}%
        </span>
    </div>

    <!-- 卡片内容：文本片段 -->
    <div class="card-content">
        {@html getHighlightedHtml()}
    </div>

    <!-- 卡片底部：路径 + 操作 -->
    <div class="card-footer">
        <span class="card-path">{filePath}</span>
        <div class="card-actions">
            <button
                class="card-action-btn"
                onclick={copyContent}
                title={copied ? "已复制！" : "复制内容"}
            >
                {#if copied}
                    <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                {:else}
                    <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect
                            width="13"
                            height="13"
                            x="9"
                            y="9"
                            rx="2"
                            ry="2"
                        />
                        <path
                            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        />
                    </svg>
                {/if}
            </button>
        </div>
    </div>
</div>

<style>
    /* 样式已移至 styles/components.css */
</style>
