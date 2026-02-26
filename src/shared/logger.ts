/**
 * 白泽 Baize - 统一日志服务
 * 支持分级日志，生产环境可关闭 debug 输出
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const PREFIX = "🐉 [Baize]";

export class Logger {
    private level: LogLevel;

    constructor(level: LogLevel = "info") {
        this.level = level;
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    private shouldLog(level: LogLevel): boolean {
        return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
    }

    debug(...args: unknown[]): void {
        if (this.shouldLog("debug")) {
            console.debug(PREFIX, ...args);
        }
    }

    info(...args: unknown[]): void {
        if (this.shouldLog("info")) {
            console.info(PREFIX, ...args);
        }
    }

    warn(...args: unknown[]): void {
        if (this.shouldLog("warn")) {
            console.warn(PREFIX, ...args);
        }
    }

    error(...args: unknown[]): void {
        if (this.shouldLog("error")) {
            console.error(PREFIX, ...args);
        }
    }
}
