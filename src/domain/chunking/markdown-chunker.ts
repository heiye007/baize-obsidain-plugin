/**
 * 白泽 Baize - Markdown 智能分块器
 * 
 * 核心逻辑：
 * 1. 过滤 YAML Frontmatter
 * 2. 识别代码块，确保代码块不被切断
 * 3. 识别标题层级，作为自然的语义边界
 * 4. 在满足长度限制的前提下，优先在标题、段落、句子边界处切分
 * 5. 保留上下文重叠度 (Overlap)
 */
import type { BaizeChunk } from "../models/baize-chunk";
import type { ChunkingOptions } from "./strategies";
import { DEFAULT_CHUNKING_OPTIONS } from "./strategies";

export class MarkdownChunker {
    private options: ChunkingOptions;

    constructor(options: Partial<ChunkingOptions> = {}) {
        this.options = { ...DEFAULT_CHUNKING_OPTIONS, ...options };
    }

    /**
     * 将 Markdown 文本切分为多个分块
     * 
     * @param text - 原始 Markdown 内容
     * @param filePath - 文件路径（用于生成 vectorId）
     * @param fileTitle - 文件标题
     * @returns 分块数组
     */
    chunk(text: string, filePath: string, fileTitle: string): BaizeChunk[] {
        // 1. 过滤 YAML Frontmatter
        const { content, offset: bodyOffset, lineOffset } = this.stripFrontmatter(text);

        // 2. 预处理：识别代码块位置，避免在代码块内切分
        const codeBlocks = this.findCodeBlocks(content);

        // 3. 初始切分：按标题层级切分
        const sections = this.splitByHeadings(content, bodyOffset, lineOffset);

        const allChunks: BaizeChunk[] = [];
        let chunkGlobalIndex = 0;

        // 4. 处理各章节：如果章节过大，则进行细分
        for (const section of sections) {
            const sectionChunks = this.refineSection(section, codeBlocks, fileTitle);

            for (const sc of sectionChunks) {
                sc.index = chunkGlobalIndex++;
                sc.vectorId = `${filePath}::${sc.index}`;
                allChunks.push(sc);
            }
        }

        return allChunks;
    }

    /** 过滤 YAML 头部 */
    private stripFrontmatter(text: string): { content: string; offset: number; lineOffset: number } {
        const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        if (match && !this.options.keepFrontmatter) {
            const frontmatterLength = match[0].length;
            const lines = match[0].split("\n").length - 1;
            return {
                content: text.slice(frontmatterLength),
                offset: frontmatterLength,
                lineOffset: lines
            };
        }
        return { content: text, offset: 0, lineOffset: 0 };
    }

    /** 查找代码块范围 [start, end] */
    private findCodeBlocks(text: string): [number, number][] {
        const blocks: [number, number][] = [];
        const regex = /```[\s\S]*?```/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            blocks.push([match.index, regex.lastIndex]);
        }
        return blocks;
    }

    /** 按标题切分初步章节 */
    private splitByHeadings(text: string, baseOffset: number, baseLineOffset: number): Section[] {
        const sections: Section[] = [];
        const headingRegex = /^(#{1,6})\s+(.+)$/gm;

        let match;
        let lastIndex = 0;
        let lastLineCount = 0;
        let currentHeadings: string[] = [];

        while ((match = headingRegex.exec(text)) !== null) {
            // 保存之前的章节
            if (match.index > lastIndex) {
                const sectionText = text.slice(lastIndex, match.index);
                if (sectionText.trim()) {
                    sections.push({
                        text: sectionText,
                        offsetStart: baseOffset + lastIndex,
                        lineStart: baseLineOffset + lastLineCount + 1,
                        headings: [...currentHeadings]
                    });
                }
            }

            // 更新当前标题层级
            const level = match[1].length;
            const title = match[2].trim();
            currentHeadings = currentHeadings.slice(0, level - 1);
            currentHeadings[level - 1] = `# ${title}`;

            lastIndex = match.index;
            lastLineCount = text.slice(0, lastIndex).split("\n").length - 1;
        }

        // 最后一个章节
        const remainingText = text.slice(lastIndex);
        if (remainingText.trim()) {
            sections.push({
                text: remainingText,
                offsetStart: baseOffset + lastIndex,
                lineStart: baseLineOffset + lastLineCount + 1,
                headings: [...currentHeadings]
            });
        }

        return sections;
    }

    /** 细化过大的章节 */
    private refineSection(section: Section, codeBlocks: [number, number][], fileTitle: string): BaizeChunk[] {
        if (section.text.length <= this.options.chunkSize) {
            return [this.createChunk(section, section.text, 0, fileTitle)];
        }

        const chunks: BaizeChunk[] = [];
        let cursor = 0;
        const text = section.text;
        const overlap = Math.floor(this.options.chunkSize * this.options.overlapThreshold);

        while (cursor < text.length) {
            let end = cursor + this.options.chunkSize;

            if (end < text.length) {
                // 尝试在换行符或句子边界切分
                const lookbackRange = text.slice(Math.max(cursor, end - 100), end);
                const lastNewline = lookbackRange.lastIndexOf("\n");
                const lastSentence = Math.max(
                    lookbackRange.lastIndexOf("。"),
                    lookbackRange.lastIndexOf("."),
                    lookbackRange.lastIndexOf("?"),
                    lookbackRange.lastIndexOf("!")
                );

                if (lastNewline > 50) {
                    end = Math.max(cursor, end - 100) + lastNewline + 1;
                } else if (lastSentence > 50) {
                    end = Math.max(cursor, end - 100) + lastSentence + 1;
                }

                // 检查是否切断了代码块
                const sectionGlobalStart = section.offsetStart + cursor;
                const sectionGlobalEnd = section.offsetStart + end;
                for (const [bStart, bEnd] of codeBlocks) {
                    if (sectionGlobalEnd > bStart && sectionGlobalEnd < bEnd) {
                        // 如果切断了代码块，直接延申到代码块结束（如果不太长）
                        // 或者在代码块开始前切断
                        if (bEnd - sectionGlobalStart <= this.options.chunkSize * 1.5) {
                            end = bEnd - section.offsetStart;
                        } else {
                            end = bStart - section.offsetStart;
                        }
                        break;
                    }
                }
            }

            const chunkText = text.slice(cursor, end);
            if (chunkText.trim().length >= this.options.minChunkSize || cursor === 0) {
                chunks.push(this.createChunk(section, chunkText, cursor, fileTitle));
            }

            // 移动游标，考虑重合度
            const nextCursor = end - overlap;
            if (nextCursor <= cursor) {
                cursor = end; // 防止死循环
            } else {
                cursor = nextCursor;
            }

            if (cursor >= text.length - overlap && cursor < text.length) break;
        }

        return chunks;
    }

    /** 创建分块模型实例 */
    private createChunk(section: Section, chunkText: string, relativeOffset: number, fileTitle: string): BaizeChunk {
        const lineCount = (chunkText.match(/\n/g) || []).length;
        const precedingText = section.text.slice(0, relativeOffset);
        const precedingLines = (precedingText.match(/\n/g) || []).length;

        return {
            index: 0, // 外部统编号
            text: chunkText,
            offsetStart: section.offsetStart + relativeOffset,
            offsetEnd: section.offsetStart + relativeOffset + chunkText.length,
            lineStart: section.lineStart + precedingLines,
            lineEnd: section.lineStart + precedingLines + lineCount,
            vectorId: "", // 外部填充
            metadata: {
                title: fileTitle,
                headings: section.headings,
                tags: [], // 等待外部提取
                file_size: 0, // 等待外部填充
                file_mtime: 0, // 等待外部填充
            }
        };
    }
}

interface Section {
    text: string;
    offsetStart: number;
    lineStart: number;
    headings: string[];
}
