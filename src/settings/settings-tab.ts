/**
 * 白泽 Baize - 设置面板
 * Obsidian PluginSettingTab 实现
 */
import { App, PluginSettingTab, Setting } from "obsidian";
import type BaizePlugin from "../main";

export class BaizeSettingTab extends PluginSettingTab {
    plugin: BaizePlugin;

    constructor(app: App, plugin: BaizePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "白泽 Baize 设置" });

        // ── 模型设置 ──
        new Setting(containerEl)
            .setName("Embedding 模型")
            .setDesc("用于文本向量化的本地模型")
            .addText(text => text
                .setPlaceholder("Xenova/all-MiniLM-L6-v2")
                .setValue(this.plugin.settings.embeddingModel)
                .onChange(async (value) => {
                    this.plugin.settings.embeddingModel = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("模型精度")
            .setDesc("自动模式下，桌面端使用 FP16，移动端使用 Q4")
            .addDropdown(drop => drop
                .addOption("auto", "自动")
                .addOption("fp16", "FP16 (高精度)")
                .addOption("q4", "Q4 (轻量)")
                .setValue(this.plugin.settings.modelPrecision)
                .onChange(async (value) => {
                    this.plugin.settings.modelPrecision = value as "auto" | "fp16" | "q4";
                    await this.plugin.saveSettings();
                }));

        // ── LLM 设置 ──
        containerEl.createEl("h3", { text: "LLM 大模型" });

        new Setting(containerEl)
            .setName("LLM 提供商")
            .setDesc("选择对话所使用的大语言模型")
            .addDropdown(drop => drop
                .addOption("deepseek", "DeepSeek")
                .addOption("openai", "OpenAI")
                .addOption("ollama", "Ollama (本地)")
                .addOption("custom", "自定义")
                .setValue(this.plugin.settings.llmProvider)
                .onChange(async (value) => {
                    this.plugin.settings.llmProvider = value as "deepseek" | "openai" | "ollama" | "custom";
                    await this.plugin.saveSettings();
                    this.display(); // 刷新面板
                }));

        new Setting(containerEl)
            .setName("API Key")
            .setDesc("API 密钥（本地保存，不会上传）")
            .addText(text => text
                .setPlaceholder("sk-...")
                .setValue(this.plugin.settings.apiKey)
                .then(t => t.inputEl.type = "password")
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        if (this.plugin.settings.llmProvider === "custom" || this.plugin.settings.llmProvider === "ollama") {
            new Setting(containerEl)
                .setName("API Base URL")
                .setDesc("自定义 API 端点地址")
                .addText(text => text
                    .setPlaceholder("http://localhost:11434")
                    .setValue(this.plugin.settings.apiBaseUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.apiBaseUrl = value;
                        await this.plugin.saveSettings();
                    }));
        }

        new Setting(containerEl)
            .setName("对话模型")
            .setDesc("用于 RAG 对话的模型名称")
            .addText(text => text
                .setPlaceholder("deepseek-chat")
                .setValue(this.plugin.settings.chatModel)
                .onChange(async (value) => {
                    this.plugin.settings.chatModel = value;
                    await this.plugin.saveSettings();
                }));

        // ── 索引设置 ──
        containerEl.createEl("h3", { text: "索引设置" });

        new Setting(containerEl)
            .setName("分块策略")
            .setDesc("文本切分方式")
            .addDropdown(drop => drop
                .addOption("heading", "标题分割")
                .addOption("fixed", "固定长度")
                .addOption("semantic", "语义段落")
                .setValue(this.plugin.settings.chunkStrategy)
                .onChange(async (value) => {
                    this.plugin.settings.chunkStrategy = value as "heading" | "fixed" | "semantic";
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("分块大小")
            .setDesc("每个分块的最大 token 数")
            .addText(text => text
                .setPlaceholder("512")
                .setValue(String(this.plugin.settings.maxChunkTokens))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.maxChunkTokens = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName("排除路径")
            .setDesc("不索引的目录或文件，每行一个（支持 glob）")
            .addTextArea(text => text
                .setPlaceholder("templates/\n.trash/\n_archive/")
                .setValue(this.plugin.settings.excludePaths.join("\n"))
                .onChange(async (value) => {
                    this.plugin.settings.excludePaths = value.split("\n").map(s => s.trim()).filter(Boolean);
                    await this.plugin.saveSettings();
                }));

        // ── 搜索设置 ──
        containerEl.createEl("h3", { text: "搜索设置" });

        new Setting(containerEl)
            .setName("返回结果数 (Top-K)")
            .setDesc("语义搜索返回的最大结果数")
            .addText(text => text
                .setPlaceholder("10")
                .setValue(String(this.plugin.settings.topK))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.topK = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName("最低相似度")
            .setDesc("低于此阈值的结果将被过滤 (0.0 - 1.0)")
            .addText(text => text
                .setPlaceholder("0.3")
                .setValue(String(this.plugin.settings.minScore))
                .onChange(async (value) => {
                    const num = parseFloat(value);
                    if (!isNaN(num) && num >= 0 && num <= 1) {
                        this.plugin.settings.minScore = num;
                        await this.plugin.saveSettings();
                    }
                }));

        // ── 高级设置 ──
        containerEl.createEl("h3", { text: "高级设置" });

        new Setting(containerEl)
            .setName("日志级别")
            .addDropdown(drop => drop
                .addOption("debug", "Debug")
                .addOption("info", "Info")
                .addOption("warn", "Warn")
                .addOption("error", "Error")
                .setValue(this.plugin.settings.logLevel)
                .onChange(async (value) => {
                    this.plugin.settings.logLevel = value as "debug" | "info" | "warn" | "error";
                    await this.plugin.saveSettings();
                }));
    }
}
