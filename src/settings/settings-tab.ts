import { App, PluginSettingTab, Setting, Notice, normalizePath } from "obsidian";
import type BaizePlugin from "../main";
import {
    EMBEDDING_MODELS
} from "../shared/constants";
import { OpenAIClient } from "../infrastructure/models/llm-clients/openai";
import { DeepSeekClient } from "../infrastructure/models/llm-clients/deepseek";
import { OllamaClient } from "../infrastructure/models/llm-clients/ollama";

export class BaizeSettingTab extends PluginSettingTab {
    plugin: BaizePlugin;
    private cacheSize: string = "正在计算...";
    private dbStats: string = "正在读取...";

    constructor(app: App, plugin: BaizePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "白泽 Baize 设置" });

        // 刷新统计信息
        await this.updateStats();

        // ── 1. 模型设置 (Embedding) ──
        containerEl.createEl("h3", { text: "模型设置 (Local Embedding)" });

        new Setting(containerEl)
            .setName("Embedding 模型")
            .setDesc("用于文本向量化的本地模型。切换模型后需要重新构建索引。")
            .addDropdown(drop => {
                EMBEDDING_MODELS.forEach(m => drop.addOption(m.id, m.name));
                drop.setValue(this.plugin.settings.embeddingModel)
                    .onChange(async (value) => {
                        this.plugin.settings.embeddingModel = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("模型精度")
            .setDesc("自动模式下，桌面端使用 FP16，移动端使用 Q4")
            .addDropdown(drop => drop
                .addOption("auto", "自动")
                .addOption("fp16", "FP16 (高精度)")
                .addOption("q4", "Q4 (轻量/量化)")
                .setValue(this.plugin.settings.modelPrecision)
                .onChange(async (value) => {
                    this.plugin.settings.modelPrecision = value as "auto" | "fp16" | "q4";
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("模型缓存管理")
            .setDesc(`本地模型存储占用: ${this.cacheSize}`)
            .addButton(btn => btn
                .setButtonText("清除模型缓存")
                .setWarning()
                .onClick(async () => {
                    await this.clearCache();
                    this.display();
                }));

        // ── 2. LLM 设置 (RAG 对话) ──
        containerEl.createEl("h3", { text: "LLM 设置 (RAG 对话)" });

        new Setting(containerEl)
            .setName("LLM 提供商")
            .setDesc("选择对话所使用的大语言模型提供商")
            .addDropdown(drop => drop
                .addOption("deepseek", "DeepSeek")
                .addOption("openai", "OpenAI")
                .addOption("ollama", "Ollama (本地)")
                .addOption("custom", "自定义 (OpenAI 兼容)")
                .setValue(this.plugin.settings.llmProvider)
                .onChange(async (value) => {
                    this.plugin.settings.llmProvider = value as any;
                    // 设置默认 URL
                    if (value === "ollama" && !this.plugin.settings.apiBaseUrl) {
                        this.plugin.settings.apiBaseUrl = "http://localhost:11434";
                    } else if (value === "deepseek") {
                        this.plugin.settings.apiBaseUrl = "https://api.deepseek.com/v1";
                    } else if (value === "openai") {
                        this.plugin.settings.apiBaseUrl = "https://api.openai.com/v1";
                    }
                    await this.plugin.saveSettings();
                    this.display();
                }));

        new Setting(containerEl)
            .setName("API Key")
            .setDesc("API 密钥（本地保存，加密存储）")
            .addText(text => text
                .setPlaceholder("sk-...")
                .setValue(this.plugin.settings.apiKey)
                .then(t => t.inputEl.type = "password")
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("API Base URL")
            .setDesc("API 端点地址")
            .addText(text => text
                .setPlaceholder("https://api.openai.com/v1")
                .setValue(this.plugin.settings.apiBaseUrl)
                .onChange(async (value) => {
                    this.plugin.settings.apiBaseUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("对话模型")
            .setDesc("模型名称 (如 gpt-4o, deepseek-chat, llama3)")
            .addText(text => text
                .setPlaceholder("gpt-3.5-turbo")
                .setValue(this.plugin.settings.chatModel)
                .onChange(async (value) => {
                    this.plugin.settings.chatModel = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("连接测试")
            .setDesc("验证 API Key 与 URL 是否有效")
            .addButton(btn => btn
                .setButtonText("测试连接")
                .onClick(async () => {
                    btn.setDisabled(true);
                    btn.setButtonText("测试中...");
                    const ok = await this.testConnection();
                    btn.setDisabled(false);
                    btn.setButtonText("测试连接");
                    if (ok) {
                        new Notice("✅ 连接成功！");
                    } else {
                        new Notice("❌ 连接失败，请检查配置或网络");
                    }
                }));

        // ── 3. 索引设置 ──
        containerEl.createEl("h3", { text: "索引设置" });

        new Setting(containerEl)
            .setName("排除路径")
            .setDesc("不索引的目录或文件，每行一个（支持 glob 模式，如 templates/**）")
            .addTextArea(text => text
                .setPlaceholder("templates/\n.trash/\n_archive/")
                .setValue(this.plugin.settings.excludePaths.join("\n"))
                .onChange(async (value) => {
                    this.plugin.settings.excludePaths = value.split("\n").map(s => s.trim()).filter(Boolean);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("分块策略")
            .setDesc("文本切分方式：标题分割能更好保留语义结构")
            .addDropdown(drop => drop
                .addOption("heading", "标题分割")
                .addOption("fixed", "固定长度")
                .addOption("semantic", "语义段落")
                .setValue(this.plugin.settings.chunkStrategy)
                .onChange(async (value) => {
                    this.plugin.settings.chunkStrategy = value as any;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("分块大小")
            .setDesc("每个分块的最大 Token 数（推荐 512）")
            .addText(text => text
                .setValue(String(this.plugin.settings.maxChunkTokens))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.maxChunkTokens = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName("移动端索引触发")
            .setDesc("移动端环境下的自动索引策略")
            .addDropdown(drop => drop
                .addOption("auto", "自动 (前台空闲时)")
                .addOption("charging", "仅充电时")
                .addOption("manual", "手动触发")
                .setValue(this.plugin.settings.mobileIndexMode)
                .onChange(async (value) => {
                    this.plugin.settings.mobileIndexMode = value as any;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("全量索引")
            .setDesc("清空数据库并重新扫描全库笔记。")
            .addButton(btn => btn
                .setButtonText("重建索引")
                .setWarning()
                .onClick(async () => {
                    if (confirm("确定要删除现有索引并完全重新构建吗？这可能需要一些时间。")) {
                        // TODO: 触发 IndexScheduler.fullSync()
                        new Notice("开始重建全量索引...");
                        if (this.plugin.indexScheduler) {
                            this.plugin.indexScheduler.fullSync();
                        } else {
                            new Notice("索引调度器尚未就绪");
                        }
                    }
                }));

        // ── 4. 搜索设置 ──
        containerEl.createEl("h3", { text: "搜索设置" });

        new Setting(containerEl)
            .setName("返回结果数 (Top-K)")
            .setDesc("语义搜索返回的最大片段数")
            .addSlider(slider => slider
                .setLimits(1, 50, 1)
                .setValue(this.plugin.settings.topK)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.topK = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("最低相似度")
            .setDesc("低于此阈值的结果将被过滤 (0.0 - 1.0)")
            .addSlider(slider => slider
                .setLimits(0, 1, 0.05)
                .setValue(this.plugin.settings.minScore)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.minScore = value;
                    await this.plugin.saveSettings();
                }));

        // ── 5. 高级设置 ──
        containerEl.createEl("h3", { text: "高级设置" });

        new Setting(containerEl)
            .setName("Worker 线程数")
            .setDesc("设置并行处理的 Web Worker 数量 (0 为自动)。仅桌面端有效。")
            .addText(text => text
                .setValue(String(this.plugin.settings.workerCount))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num >= 0) {
                        this.plugin.settings.workerCount = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName("日志级别")
            .setDesc("Debug 模式会记录更多详细信息到控制台")
            .addDropdown(drop => drop
                .addOption("debug", "Debug")
                .addOption("info", "Info")
                .addOption("warn", "Warn")
                .addOption("error", "Error")
                .setValue(this.plugin.settings.logLevel)
                .onChange(async (value) => {
                    this.plugin.settings.logLevel = value as any;
                    await this.plugin.saveSettings();
                }));

        // ── 6. 关于 ──
        containerEl.createEl("h3", { text: "关于白泽" });

        const aboutDiv = containerEl.createDiv("baize-about-box");
        aboutDiv.createEl("p", { text: `版本: ${this.plugin.manifest.version}` });
        aboutDiv.createEl("p", { text: `数据库统计: ${this.dbStats}` });
        aboutDiv.createEl("p", { text: "作者: heiye007" });
        const link = aboutDiv.createEl("a", {
            text: "GitHub 仓库",
            href: "https://github.com/heiye007/Baize-obsidian-plugin"
        });
        link.style.color = "var(--text-accent)";
    }

    // ─── 工具方法 ───

    private async updateStats() {
        try {
            // 计算缓存大小
            const cachePath = normalizePath(`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/cache`);
            const exists = await this.app.vault.adapter.exists(cachePath);
            if (exists) {
                const size = await this.getFolderSize(cachePath);
                this.cacheSize = this.formatBytes(size);
            } else {
                this.cacheSize = "0 B";
            }

            // 获取数据库统计
            if (this.plugin.vectorStore) {
                const stats = await this.plugin.vectorStore.getStats();
                this.dbStats = `${stats.totalRecords} 条记录 / ${stats.totalFiles} 个文件`;
            } else {
                this.dbStats = "向量库未初始化";
            }
        } catch (e) {
            this.cacheSize = "获取失败";
            this.dbStats = "获取失败";
        }
        // 由于是异步的，可能需要再次调用 display 或手动更新 DOM 元素
        // 这里采用简单的直接修改 DOM (如果 display 已经完成)
    }

    private async getFolderSize(path: string): Promise<number> {
        let size = 0;
        const list = await this.app.vault.adapter.list(path);
        for (const file of list.files) {
            const stat = await this.app.vault.adapter.stat(file);
            if (stat) size += stat.size;
        }
        for (const folder of list.folders) {
            size += await this.getFolderSize(folder);
        }
        return size;
    }

    private formatBytes(bytes: number, decimals = 2) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
    }

    private async clearCache() {
        try {
            const cachePath = normalizePath(`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/cache`);
            await this.app.vault.adapter.rmdir(cachePath, true);
            new Notice("✅ 缓存已清除");
        } catch (e) {
            new Notice("❌ 清除缓存失败");
        }
    }

    private async testConnection(): Promise<boolean> {
        const { llmProvider, apiKey, apiBaseUrl, chatModel } = this.plugin.settings;
        try {
            let client;
            if (llmProvider === "deepseek") {
                client = new DeepSeekClient(apiKey, this.plugin.logger);
            } else if (llmProvider === "openai" || llmProvider === "custom") {
                client = new OpenAIClient(apiKey, apiBaseUrl, this.plugin.logger, chatModel);
            } else if (llmProvider === "ollama") {
                client = new OllamaClient(apiBaseUrl, this.plugin.logger, chatModel);
            }

            if (!client) return false;
            return await client.testConnection();
        } catch (e) {
            return false;
        }
    }
}
