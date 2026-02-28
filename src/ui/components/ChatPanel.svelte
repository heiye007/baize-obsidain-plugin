<script lang="ts">
    import { tick, onMount } from "svelte";
    import type BaizePlugin from "../../main";

    interface ChatMessage {
        role: "user" | "assistant";
        content: string;
        timestamp: number;
    }

    interface Props {
        plugin: BaizePlugin;
    }

    let { plugin }: Props = $props();

    // 组件挂载
    onMount(() => {
        plugin.logger.info('[Chat] ChatPanel mounted');
    });

    let messages: ChatMessage[] = $state([]);
    let inputText = $state("");
    let isGenerating = $state(false);
    let abortController: AbortController | null = null;
    let messagesContainer: HTMLDivElement;

    // 滚动到底部
    async function scrollToBottom() {
        await tick();
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // 发送消息
    async function sendMessage() {
        const text = inputText.trim();
        plugin.logger.info(`[Chat] === sendMessage called ===`);
        plugin.logger.info(`[Chat] text: "${text}"`);
        plugin.logger.info(`[Chat] isGenerating: ${isGenerating}`);
        plugin.logger.info(`[Chat] messages count: ${messages.length}`);

        if (!text) {
            plugin.logger.info(`[Chat] Early return: empty text`);
            return;
        }
        if (isGenerating) {
            plugin.logger.info(`[Chat] Early return: already generating`);
            return;
        }

        // 添加用户消息
        const userMsg: ChatMessage = { role: "user", content: text, timestamp: Date.now() };
        messages = [...messages, userMsg];
        plugin.logger.info(`[Chat] Added user message, messages count: ${messages.length}`);

        inputText = "";
        await scrollToBottom();

        isGenerating = true;
        abortController = new AbortController();

        // 添加 AI 消息（空内容）
        const aiMsg: ChatMessage = {
            role: "assistant",
            content: "",
            timestamp: Date.now(),
        };
        messages = [...messages, aiMsg];
        plugin.logger.info(`[Chat] Added AI message, messages count: ${messages.length}`);
        await scrollToBottom();

        try {
            plugin.logger.info(`[Chat] Starting RAG query`);

            // 1. 使用 embedding 模型编码用户问题
            let queryVector: number[] | null = null;
            if (plugin.transformersAdapter) {
                try {
                    plugin.logger.info(`[Chat] Encoding query...`);
                    queryVector = await plugin.transformersAdapter.embed(text);
                    plugin.logger.info(`[Chat] Query encoded, vector length: ${queryVector.length}`);
                } catch (e) {
                    plugin.logger.warn(`[Chat] Failed to encode query:`, e);
                }
            }

            // 2. 搜索相关笔记
            let context = "";
            let citations: string[] = [];
            if (queryVector && plugin.vectorStore) {
                try {
                    plugin.logger.info(`[Chat] Searching vector store...`);
                    const results = await plugin.vectorStore.search(queryVector, 5);
                    plugin.logger.info(`[Chat] Found ${results.length} relevant chunks`);

                    if (results.length > 0) {
                        context = results.map((r, i) => {
                            citations.push(`[^${i + 1}]`);
                            const filePath = r.chunk.vectorId.split("::")[0];
                            return `\n\n[片段 ${i + 1}] 来自 ${filePath}:\n${r.chunk.text}`;
                        }).join("");
                    }
                } catch (e) {
                    plugin.logger.warn(`[Chat] Failed to search:`, e);
                }
            }

            // 3. 生成回复
            let response = "";
            if (context) {
                // 基于检索结果生成回复
                response = `主公，白泽已从您的笔记中检索到相关内容：\n\n${context}\n\n---\n\n基于上述内容，${text} 的答案如下：\n\n我检索到 ${citations.length} 条相关笔记，建议您查看：` + citations.join(" ");
            } else {
                // 没有找到相关内容
                response = `主公，白泽已遍历您的笔记库，但未找到与 "${text}" 直接相关的内容。\n\n建议您：\n1. 尝试使用不同的关键词\n2. 确保相关笔记已被索引（可在"语义搜索"面板验证）\n3. 检查模型是否已加载完成（状态指示灯变绿）`;
            }

            // 更新 AI 消息内容
            const lastIndex = messages.length - 1;
            messages[lastIndex] = { ...messages[lastIndex], content: response };
            messages = [...messages];
            plugin.logger.info(`[Chat] Response generated, length: ${response.length}`);
        } catch (err: any) {
            if (err.name !== "AbortError") {
                plugin.logger.error("[Chat] Generation failed:", err);
                const lastIndex = messages.length - 1;
                messages[lastIndex] = { ...messages[lastIndex], content: "⚠️ 生成失败：" + (err.message || "未知错误") };
                messages = [...messages];
            }
        } finally {
            isGenerating = false;
            abortController = null;
            await scrollToBottom();
            plugin.logger.info(`[Chat] Generation finished`);
        }
    }

    function stopGeneration() {
        abortController?.abort();
        isGenerating = false;
    }

    function clearChat() {
        plugin.logger.info(`[Chat] clearChat called`);
        if (isGenerating) stopGeneration();
        messages = [];
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    // Markdown 渲染（美化版）
    function renderMarkdown(text: string): string {
        if (!text) return '';

        // 先转义 HTML 特殊字符
        let html = escapeHtml(text);

        // 代码块（优先处理，避免内部内容被转义）
        html = html.replace(
            /```(\w*)\n([\s\S]*?)```/g,
            (_m, lang, code) =>
                `<div class="baize-code-wrapper"><div class="baize-code-header">${lang || 'code'}</div><pre class="baize-code-block"><code>${code.trim()}</code></pre></div>`,
        );

        // 行内代码
        html = html.replace(
            /`([^`]+)`/g,
            '<code class="baize-inline-code">$1</code>',
        );

        // 分隔线
        html = html.replace(/^---+$/gm, '<hr class="baize-divider"/>');

        // 引用块（需要处理多行）
        html = html.replace(
            /^&gt; (.+)$/gm,
            '<div class="baize-quote-line">$1</div>',
        );
        // 合并相邻的引用行
        html = html.replace(
            /(<div class="baize-quote-line">.*?<\/div>\n?)+/g,
            (match) => `<blockquote class="baize-blockquote">${match.replace(/<div class="baize-quote-line">(.*?)<\/div>/g, '$1<br/>')}</blockquote>`,
        );

        // 标题
        html = html.replace(/^#### (.+)$/gm, '<h4 class="baize-h4">$1</h4>');
        html = html.replace(/^### (.+)$/gm, '<h3 class="baize-h3">$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2 class="baize-h2">$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1 class="baize-h1">$1</h1>');

        // 加粗和斜体
        html = html.replace(/\*\*(.+?)\*\*/g, "<strong class='baize-bold'>$1</strong>");
        html = html.replace(/\*(.+?)\*/g, "<em class='baize-italic'>$1</em>");

        // 无序列表
        html = html.replace(/^- (.+)$/gm, '<li class="baize-list-item"><span class="baize-list-marker">•</span><span class="baize-list-content">$1</span></li>');
        html = html.replace(
            /(<li class="baize-list-item"[\s\S]*?<\/li>\n?)+/g,
            '<ul class="baize-list">$&</ul>',
        );

        // 有序列表 - 保留原始序号
        let olCounter = 0;
        html = html.replace(/^\d+\. (.+)$/gm, (_m, content) => {
            olCounter++;
            return `<li class="baize-olist-item"><span class="baize-list-number">${olCounter}.</span><span class="baize-list-content">${content}</span></li>`;
        });
        html = html.replace(
            /(<li class="baize-olist-item"[\s\S]*?<\/li>\n?)+/g,
            (match) => `<ol class="baize-olist">${match}</ol>`,
        );

        // 引用标记 [^1] [^2] 等
        html = html.replace(
            /\[\^(\d+)\]/g,
            '<sup class="baize-citation" data-ref="$1" title="引用 $1">[$1]</sup>',
        );

        // 链接
        html = html.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2" class="baize-link" target="_blank">$1</a>',
        );

        // 标签 #tag（不匹配代码块内的内容）
        html = html.replace(
            /(?<![\w#])#([\w\u4e00-\u9fa5_-]+)/g,
            '<span class="baize-tag">#$1</span>',
        );

        // 高亮 ==text==
        html = html.replace(
            /==(.+?)==/g,
            '<mark class="baize-highlight">$1</mark>',
        );

        // 表格 - 支持多种格式
        // 先处理标准 Markdown 表格（有分隔符行）
        html = html.replace(
            /\|?(.+?)\|?\n\|?[-\s|:]+\|?\n((?:\|?.+?\|?\n?)+)/g,
            (_m, header, rows) => {
                const headers = header.split('|').map((h: string) => h.trim()).filter((h: string) => h);
                if (headers.length === 0) return _m;
                const headerHtml = headers.map((h: string) => `<th class="baize-th">${h}</th>`).join('');
                const rowHtml = rows.trim().split('\n').map((row: string) => {
                    const cells = row.split('|').map((c: string) => c.trim()).filter((c: string) => c);
                    if (cells.length === 0) return '';
                    return `<tr class="baize-tr">${cells.map((c: string) => `<td class="baize-td">${c}</td>`).join('')}</tr>`;
                }).filter(Boolean).join('');
                return `<div class="baize-table-wrapper"><table class="baize-table"><thead class="baize-thead"><tr>${headerHtml}</tr></thead><tbody class="baize-tbody">${rowHtml}</tbody></table></div>`;
            },
        );

        // 处理简单表格（无分隔符行，以 | 分隔的任意行）
        // 匹配包含 | 的行，且不是已处理的表格
        const lines = html.split('\n');
        const result: string[] = [];
        let tableLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // 检查是否是表格行（包含 | 且不是HTML标签行）
            if (line.includes('|') && !line.startsWith('<')) {
                tableLines.push(line);
            } else {
                // 处理积累的表格行
                if (tableLines.length >= 1) {
                    const tableHtml = processSimpleTable(tableLines);
                    result.push(tableHtml);
                    tableLines = [];
                }
                result.push(line);
            }
        }
        // 处理最后可能积累的表格行
        if (tableLines.length >= 1) {
            const tableHtml = processSimpleTable(tableLines);
            result.push(tableHtml);
        }
        html = result.join('\n');

        function processSimpleTable(lines: string[]): string {
            if (lines.length === 0) return '';

            // 解析所有行
            const rows = lines.map(line =>
                line.split('|').map(c => c.trim()).filter(c => c)
            ).filter(row => row.length > 0);

            if (rows.length === 0) return lines.join('\n');

            // 第一行作为表头
            const headers = rows[0];
            const headerHtml = headers.map(h => `<th class="baize-th">${h}</th>`).join('');

            // 剩余行作为数据
            const bodyRows = rows.slice(1);
            let bodyHtml = '';
            if (bodyRows.length > 0) {
                bodyHtml = bodyRows.map(cells =>
                    `<tr class="baize-tr">${cells.map(c => `<td class="baize-td">${c}</td>`).join('')}</tr>`
                ).join('');
                return `<div class="baize-table-wrapper"><table class="baize-table"><thead class="baize-thead"><tr>${headerHtml}</tr></thead><tbody class="baize-tbody">${bodyHtml}</tbody></table></div>`;
            } else {
                // 只有一行，也渲染为表格
                return `<div class="baize-table-wrapper"><table class="baize-table"><thead class="baize-thead"><tr>${headerHtml}</tr></thead></table></div>`;
            }
        }

        // 普通段落（处理换行）
        // 先按空行分段落
        const paragraphs = html.split(/\n\n+/);
        html = paragraphs.map(p => {
            // 如果已经是块级元素，不包裹
            if (p.startsWith('<') && !p.startsWith('<code') && !p.startsWith('<strong') && !p.startsWith('<em')) {
                return p;
            }
            // 将单个换行转为 <br/>
            return `<p class="baize-paragraph">${p.replace(/\n/g, '<br/>')}</p>`;
        }).join('\n');

        // 清理空的段落
        html = html.replace(/<p class="baize-paragraph"><\/p>/g, '');
        return html;
    }

    function escapeHtml(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function handleCitationClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (target.classList.contains("baize-citation")) {
            const ref = target.dataset.ref;
            plugin.logger.info(`[Chat] Citation clicked: [^${ref}]`);
        }
    }
</script>

<div class="baize-chat-panel" data-active={!!plugin}>
    <!-- 消息列表 -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="chat-messages"
        bind:this={messagesContainer}
        onclick={handleCitationClick}
        onkeydown={() => {}}
    >
        {#if messages.length === 0}
            <div class="message assistant">
                <div class="msg-text">
                    主公，白泽已归位。当前笔记《关于灵兽白泽的研究笔记》已被索引，我会为您持续监测关联。
                </div>
            </div>
        {:else}
            {#each messages as msg, i (msg.timestamp + '-' + i)}
                <div class="message {msg.role}">
                    {#if msg.role === "assistant"}
                        <div class="msg-text">
                            {@html renderMarkdown(
                                msg.content,
                            )}{#if isGenerating && i === messages.length - 1}<span
                                    class="typing-cursor"
                                ></span>{/if}
                        </div>

                        <!-- 引用卡片（TODO: 从实际数据中解析） -->
                    {:else}
                        <div class="msg-text">{msg.content}</div>
                    {/if}
                </div>
            {/each}
        {/if}

        {#if isGenerating && messages.length > 0 && messages[messages.length - 1].content === ""}
            <div class="thinking-indicator">
                <span></span><span></span><span></span>
                白泽正于灵海检索...
            </div>
        {/if}
    </div>

    <!-- 底部输入区 -->
    <div class="input-area">
        {#if isGenerating}
            <button class="stop-btn" onclick={stopGeneration}>
                <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="currentColor"
                    ><rect x="6" y="6" width="12" height="12" rx="2" /></svg
                >
                停止生成
            </button>
        {/if}
        <div class="search-box">
            <textarea
                class="chat-textarea"
                placeholder="问问白泽..."
                bind:value={inputText}
                onkeydown={handleKeydown}
                rows="1"
                disabled={isGenerating}
            ></textarea>
            <div class="input-actions">
                <span class="input-hint">
                    {#if isGenerating}
                        白泽正于灵海检索...
                    {:else}
                        本地向量引擎已就绪
                    {/if}
                </span>
                <button
                    class="send-btn"
                    onclick={sendMessage}
                    disabled={!inputText.trim() || isGenerating}
                    title="发送"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                </button>
            </div>
        </div>
    </div>

    <!-- 新建对话浮动按钮 -->
    {#if messages.length > 0}
        <button class="clear-float" onclick={clearChat} title="新建对话">
            <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
            >
                <path d="M12 5v14M5 12h14" />
            </svg>
        </button>
    {/if}
</div>

<style>
    /* 样式已移至 styles/desktop.css */
</style>
