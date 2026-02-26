<script lang="ts">
    import { tick } from "svelte";
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
        if (!text || isGenerating) return;

        // 添加用户消息
        messages.push({ role: "user", content: text, timestamp: Date.now() });
        inputText = "";
        await scrollToBottom();

        // 开始生成
        isGenerating = true;
        abortController = new AbortController();

        // 添加空的 AI 消息
        const aiMsg: ChatMessage = {
            role: "assistant",
            content: "",
            timestamp: Date.now(),
        };
        messages.push(aiMsg);
        await scrollToBottom();

        try {
            // TODO: 接入 RAGPipeline
            // await plugin.ragPipeline.ask(text, (chunk) => {
            //     aiMsg.content += chunk;
            //     messages = messages; // 触发响应式更新
            //     scrollToBottom();
            // });

            // 模拟流式回复（开发阶段占位）
            plugin.logger.info(`[Chat] Question: "${text}"`);
            const mockResponse = `这是一个模拟回复。当 RAG 管线接入后，白泽将根据你的笔记库回答问题。\n\n> 示例引用 [^1]\n\n**关键词**: ${text}`;
            for (let i = 0; i < mockResponse.length; i++) {
                if (abortController?.signal.aborted) break;
                aiMsg.content += mockResponse[i];
                messages = messages; // Svelte 5 需要重新赋值触发更新
                if (i % 3 === 0) {
                    await new Promise((r) => setTimeout(r, 20));
                    await scrollToBottom();
                }
            }
        } catch (err: any) {
            if (err.name !== "AbortError") {
                plugin.logger.error("[Chat] Generation failed:", err);
                aiMsg.content +=
                    "\n\n⚠️ 生成失败：" + (err.message || "未知错误");
                messages = messages;
            }
        } finally {
            isGenerating = false;
            abortController = null;
            await scrollToBottom();
        }
    }

    // 停止生成
    function stopGeneration() {
        abortController?.abort();
        isGenerating = false;
    }

    // 清空对话
    function clearChat() {
        if (isGenerating) stopGeneration();
        messages = [];
        // TODO: plugin.ragPipeline.clearHistory();
    }

    // 键盘事件
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    // 简易 Markdown 渲染
    function renderMarkdown(text: string): string {
        let html = escapeHtml(text);

        // 代码块 ```
        html = html.replace(
            /```(\w*)\n([\s\S]*?)```/g,
            (_m, lang, code) =>
                `<pre class="baize-code-block"><code class="language-${lang}">${code.trim()}</code></pre>`,
        );

        // 行内代码
        html = html.replace(
            /`([^`]+)`/g,
            '<code class="baize-inline-code">$1</code>',
        );

        // 粗体
        html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

        // 斜体
        html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

        // 引用块
        html = html.replace(
            /^&gt; (.+)$/gm,
            '<blockquote class="baize-blockquote">$1</blockquote>',
        );

        // 无序列表
        html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
        html = html.replace(
            /(<li>[\s\S]*?<\/li>)/g,
            '<ul class="baize-list">$1</ul>',
        );
        // 清理连续 ul
        html = html.replace(/<\/ul>\s*<ul class="baize-list">/g, "");

        // 引用标记 [^N] → 可点击链接
        html = html.replace(
            /\[\^(\d+)\]/g,
            '<a class="baize-citation" data-ref="$1" title="引用 $1">[^$1]</a>',
        );

        // 换行
        html = html.replace(/\n/g, "<br/>");

        return html;
    }

    function escapeHtml(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // 处理引用点击
    function handleCitationClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (target.classList.contains("baize-citation")) {
            const ref = target.dataset.ref;
            plugin.logger.info(`[Chat] Citation clicked: [^${ref}]`);
            // TODO: 跳转到对应笔记
        }
    }

    function formatTime(ts: number): string {
        const d = new Date(ts);
        return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    }
</script>

<div class="baize-chat-panel" data-active={!!plugin}>
    <!-- 顶部工具栏 -->
    <div class="chat-toolbar">
        <span class="chat-title">AI 对话</span>
        <button class="chat-toolbar-btn" onclick={clearChat} title="新建对话">
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
    </div>

    <!-- 消息列表 -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="chat-messages"
        bind:this={messagesContainer}
        onclick={handleCitationClick}
        onkeydown={() => {}}
    >
        {#if messages.length === 0}
            <div class="chat-welcome">
                <div class="welcome-icon">🐉</div>
                <p>你好，我是白泽</p>
                <p class="welcome-hint">基于你的笔记库回答问题</p>
            </div>
        {:else}
            {#each messages as msg, i}
                <div class="chat-message {msg.role}">
                    <div class="msg-avatar">
                        {#if msg.role === "user"}
                            <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <circle cx="12" cy="8" r="5" /><path
                                    d="M20 21a8 8 0 0 0-16 0"
                                />
                            </svg>
                        {:else}
                            <span class="ai-avatar">泽</span>
                        {/if}
                    </div>
                    <div class="msg-body">
                        {#if msg.role === "assistant"}
                            <div class="msg-content markdown">
                                {@html renderMarkdown(
                                    msg.content,
                                )}{#if isGenerating && i === messages.length - 1}<span
                                        class="typing-cursor"
                                    ></span>{/if}
                            </div>
                        {:else}
                            <div class="msg-content">{msg.content}</div>
                        {/if}
                        <span class="msg-time">{formatTime(msg.timestamp)}</span
                        >
                    </div>
                </div>
            {/each}
        {/if}

        {#if isGenerating && messages.length > 0 && messages[messages.length - 1].content === ""}
            <div class="thinking-indicator">
                <span></span><span></span><span></span>
                白泽正在思考...
            </div>
        {/if}
    </div>

    <!-- 底部输入区 -->
    <div class="chat-input-area">
        {#if isGenerating}
            <button class="stop-btn" onclick={stopGeneration}>
                <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="currentColor"
                >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                停止生成
            </button>
        {/if}
        <div class="chat-input-wrapper">
            <textarea
                class="chat-input"
                placeholder="向白泽提问..."
                bind:value={inputText}
                onkeydown={handleKeydown}
                rows="1"
                disabled={isGenerating}
            ></textarea>
            <button
                class="send-btn"
                onclick={sendMessage}
                disabled={!inputText.trim() || isGenerating}
                title="发送 (Enter)"
            >
                <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path d="m22 2-7 20-4-9-9-4z" /><path d="m22 2-10 10" />
                </svg>
            </button>
        </div>
    </div>
</div>

<style>
    .baize-chat-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
    }

    /* 工具栏 */
    .chat-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px var(--baize-spacing-md);
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .chat-title {
        font-size: var(--baize-font-size-sm);
        font-weight: 600;
        color: var(--text-normal);
    }

    .chat-toolbar-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        border-radius: var(--baize-radius-sm);
        box-shadow: none !important;
        transition: all var(--baize-transition-fast);
    }

    .chat-toolbar-btn:hover {
        background: var(--background-modifier-hover);
        color: var(--text-normal);
    }

    /* 消息列表 */
    .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: var(--baize-spacing-md);
        display: flex;
        flex-direction: column;
        gap: var(--baize-spacing-md);
    }

    .chat-welcome {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        color: var(--text-muted);
        text-align: center;
        gap: 4px;
    }

    .welcome-icon {
        font-size: 48px;
        margin-bottom: 8px;
    }

    .welcome-hint {
        font-size: var(--baize-font-size-xs);
        color: var(--text-faint);
    }

    /* 单条消息 */
    .chat-message {
        display: flex;
        gap: 8px;
        align-items: flex-start;
    }

    .chat-message.user {
        flex-direction: row-reverse;
    }

    .msg-avatar {
        width: 28px;
        height: 28px;
        border-radius: var(--baize-radius-full);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 12px;
    }

    .chat-message.user .msg-avatar {
        background: var(--interactive-accent);
        color: white;
    }

    .chat-message.assistant .msg-avatar {
        background: linear-gradient(
            135deg,
            var(--baize-gold),
            var(--baize-gold-dark)
        );
        color: white;
    }

    .ai-avatar {
        font-weight: bold;
        font-size: 13px;
    }

    .msg-body {
        max-width: 85%;
        min-width: 0;
    }

    .msg-content {
        padding: 8px 12px;
        border-radius: var(--baize-radius-md);
        font-size: var(--baize-font-size-sm);
        line-height: 1.6;
        word-break: break-word;
    }

    .chat-message.user .msg-content {
        background: var(--interactive-accent);
        color: white;
        border-bottom-right-radius: var(--baize-radius-sm);
    }

    .chat-message.assistant .msg-content {
        background: var(--baize-bg-secondary);
        color: var(--text-normal);
        border-bottom-left-radius: var(--baize-radius-sm);
    }

    .msg-time {
        font-size: 10px;
        color: var(--text-faint);
        display: block;
        margin-top: 2px;
    }

    .chat-message.user .msg-time {
        text-align: right;
    }

    /* 打字光标 */
    .typing-cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        background: var(--baize-gold);
        animation: blink 0.8s infinite;
        vertical-align: text-bottom;
        margin-left: 1px;
    }

    @keyframes blink {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0;
        }
    }

    /* Markdown 内容样式 */
    :global(.baize-code-block) {
        background: var(--background-primary-alt, #1e1e1e);
        border-radius: var(--baize-radius-sm);
        padding: 8px 12px;
        margin: 6px 0;
        overflow-x: auto;
        font-size: var(--baize-font-size-xs);
        font-family: var(--font-monospace);
    }

    :global(.baize-inline-code) {
        background: var(--background-modifier-border);
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 0.9em;
        font-family: var(--font-monospace);
    }

    :global(.baize-blockquote) {
        border-left: 3px solid var(--baize-gold);
        padding-left: 10px;
        margin: 6px 0;
        color: var(--text-muted);
    }

    :global(.baize-list) {
        margin: 4px 0;
        padding-left: 20px;
    }

    :global(.baize-citation) {
        color: var(--baize-gold);
        cursor: pointer;
        text-decoration: underline;
        text-decoration-style: dotted;
    }

    :global(.baize-citation:hover) {
        color: var(--baize-gold-light);
    }

    /* 思考中指示器 */
    .thinking-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--text-faint);
        font-size: var(--baize-font-size-xs);
        padding: 4px 0;
    }

    .thinking-indicator span {
        width: 6px;
        height: 6px;
        background: var(--baize-gold);
        border-radius: 50%;
        animation: thinking-pulse 1.4s infinite ease-in-out;
    }

    .thinking-indicator span:nth-child(2) {
        animation-delay: 0.2s;
    }
    .thinking-indicator span:nth-child(3) {
        animation-delay: 0.4s;
    }

    @keyframes thinking-pulse {
        0%,
        80%,
        100% {
            opacity: 0.3;
            transform: scale(0.8);
        }
        40% {
            opacity: 1;
            transform: scale(1);
        }
    }

    /* 输入区域 */
    .chat-input-area {
        border-top: 1px solid var(--background-modifier-border);
        padding: var(--baize-spacing-sm) var(--baize-spacing-md);
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .stop-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: 100%;
        padding: 6px;
        border: 1px solid var(--background-modifier-border);
        background: transparent;
        color: var(--text-muted);
        border-radius: var(--baize-radius-md);
        cursor: pointer;
        font-size: var(--baize-font-size-xs);
        transition: all var(--baize-transition-fast);
        box-shadow: none !important;
    }

    .stop-btn:hover {
        border-color: var(--text-error);
        color: var(--text-error);
    }

    .chat-input-wrapper {
        display: flex;
        gap: 6px;
        align-items: flex-end;
    }

    .chat-input {
        flex: 1;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-modifier-form-field);
        border-radius: var(--baize-radius-md);
        padding: 8px 12px;
        font-size: var(--baize-font-size-md);
        color: var(--text-normal);
        resize: none;
        min-height: 36px;
        max-height: 120px;
        outline: none;
        font-family: inherit;
        line-height: 1.4;
        transition: border-color var(--baize-transition-fast);
    }

    .chat-input:focus {
        border-color: var(--baize-gold);
        box-shadow: 0 0 0 2px rgba(201, 169, 110, 0.15);
    }

    .chat-input::placeholder {
        color: var(--text-faint);
    }

    .chat-input:disabled {
        opacity: 0.5;
    }

    .send-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        background: var(--baize-gold);
        color: white;
        border-radius: var(--baize-radius-md);
        cursor: pointer;
        flex-shrink: 0;
        transition: all var(--baize-transition-fast);
        box-shadow: none !important;
    }

    .send-btn:hover:not(:disabled) {
        background: var(--baize-gold-dark);
        transform: scale(1.05);
    }

    .send-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
</style>
