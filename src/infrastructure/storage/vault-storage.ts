/**
 * 白泽 Baize - 统一存储层
 * 
 * 封装 Obsidian DataAdapter，提供插件级别的文件 I/O 抽象
 * 
 * 设计原则：
 * - 不自建存储抽象，直接使用 Obsidian 原生 DataAdapter
 * - Desktop → Node.js fs | Android → Capacitor 原生 | iOS → 沙箱文件系统
 * - 本模块仅负责：路径拼接、目录确保、二进制读写、错误处理
 */
import type { App, DataAdapter } from "obsidian";
import { Logger } from "../../shared/logger";
import { StorageError } from "../../shared/errors";
import { PLUGIN_ID } from "../../shared/constants";

export class VaultStorage {
    private adapter: DataAdapter;
    private logger: Logger;

    /** 插件数据根目录（相对于 Vault 根） */
    private readonly basePath: string;

    constructor(app: App, logger: Logger) {
        this.adapter = app.vault.adapter;
        this.logger = logger;
        this.basePath = `${app.vault.configDir}/plugins/${PLUGIN_ID}`;
    }

    // ─── 路径工具 ───

    /**
     * 将插件相对路径转为完整 Vault 路径
     * 
     * @example resolve("data.lance/index") → ".obsidian/plugins/baize-obsidian-plugin/data.lance/index"
     */
    resolve(relativePath: string): string {
        // 规范化：去除开头的斜杠
        const clean = relativePath.replace(/^[/\\]+/, "");
        return `${this.basePath}/${clean}`;
    }

    // ─── 目录操作 ───

    /**
     * 确保目录存在，不存在则递归创建
     * 
     * Obsidian DataAdapter 不提供 mkdirp，需手动逐级创建
     */
    async ensureDir(relativePath: string): Promise<void> {
        const fullPath = this.resolve(relativePath);
        const parts = fullPath.split("/");
        let current = "";

        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            try {
                const exists = await this.adapter.exists(current);
                if (!exists) {
                    await this.adapter.mkdir(current);
                }
            } catch {
                // 某些平台 exists() 对目录可能报错，尝试直接创建
                try {
                    await this.adapter.mkdir(current);
                } catch {
                    // 已存在则忽略
                }
            }
        }
    }

    // ─── 二进制读写 ───

    /**
     * 读取二进制文件
     * 
     * @returns ArrayBuffer 内容
     * @throws StorageError 文件不存在时
     */
    async readBinary(relativePath: string): Promise<ArrayBuffer> {
        const fullPath = this.resolve(relativePath);
        try {
            return await this.adapter.readBinary(fullPath);
        } catch (e) {
            throw new StorageError(
                `读取文件失败: ${fullPath} — ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    /**
     * 写入二进制文件
     * 
     * 自动确保父目录存在
     */
    async writeBinary(relativePath: string, data: ArrayBuffer): Promise<void> {
        const fullPath = this.resolve(relativePath);
        try {
            // 确保父目录存在
            const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
            if (parentDir) {
                await this.ensureDir(
                    parentDir.replace(`${this.basePath}/`, "")
                );
            }
            await this.adapter.writeBinary(fullPath, data);
        } catch (e) {
            throw new StorageError(
                `写入文件失败: ${fullPath} — ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    // ─── 文本读写 ───

    /** 读取文本文件 */
    async readText(relativePath: string): Promise<string> {
        const fullPath = this.resolve(relativePath);
        try {
            return await this.adapter.read(fullPath);
        } catch (e) {
            throw new StorageError(
                `读取文件失败: ${fullPath} — ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    /** 写入文本文件（自动确保父目录存在） */
    async writeText(relativePath: string, content: string): Promise<void> {
        const fullPath = this.resolve(relativePath);
        try {
            const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
            if (parentDir) {
                await this.ensureDir(
                    parentDir.replace(`${this.basePath}/`, "")
                );
            }
            await this.adapter.write(fullPath, content);
        } catch (e) {
            throw new StorageError(
                `写入文件失败: ${fullPath} — ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    // ─── 文件操作 ───

    /** 检查文件或目录是否存在 */
    async exists(relativePath: string): Promise<boolean> {
        const fullPath = this.resolve(relativePath);
        try {
            return await this.adapter.exists(fullPath);
        } catch {
            return false;
        }
    }

    /** 删除文件 */
    async remove(relativePath: string): Promise<void> {
        const fullPath = this.resolve(relativePath);
        try {
            if (await this.adapter.exists(fullPath)) {
                await this.adapter.remove(fullPath);
                this.logger.debug(`已删除: ${relativePath}`);
            }
        } catch (e) {
            throw new StorageError(
                `删除文件失败: ${fullPath} — ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    /**
     * 列出目录内容
     * 
     * @returns { files: string[], folders: string[] }
     */
    async list(relativePath: string): Promise<{ files: string[]; folders: string[] }> {
        const fullPath = this.resolve(relativePath);
        try {
            const result = await this.adapter.list(fullPath);
            return {
                files: result.files.map(f => f.replace(`${this.basePath}/`, "")),
                folders: result.folders.map(f => f.replace(`${this.basePath}/`, "")),
            };
        } catch (e) {
            throw new StorageError(
                `列出目录失败: ${fullPath} — ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    // ─── 便捷方法 ───

    /** 读取 JSON 文件并解析 */
    async readJSON<T>(relativePath: string): Promise<T> {
        const text = await this.readText(relativePath);
        try {
            return JSON.parse(text) as T;
        } catch (e) {
            throw new StorageError(
                `JSON 解析失败: ${relativePath} — ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    /** 将对象序列化为 JSON 并写入 */
    async writeJSON(relativePath: string, data: unknown): Promise<void> {
        const text = JSON.stringify(data, null, 2);
        await this.writeText(relativePath, text);
    }

    /** 获取插件数据根目录的完整路径 */
    getBasePath(): string {
        return this.basePath;
    }
}
