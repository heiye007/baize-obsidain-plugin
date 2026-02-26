/**
 * 白泽 Baize - 运行时平台检测
 * 
 * 通过 Obsidian Platform API 检测当前运行平台
 * 返回统一的 PlatformType 供各模块消费
 */
import { Platform } from "obsidian";
import type { PlatformType } from "../../shared/types";

/** 检测当前运行平台 */
export function getPlatform(): PlatformType {
    if (Platform.isAndroidApp) return "android";
    if (Platform.isIosApp) return "ios";
    return "desktop";
}

/** 是否为移动端 */
export function isMobile(): boolean {
    return Platform.isMobile;
}

/** 是否为桌面端 */
export function isDesktop(): boolean {
    return !Platform.isMobile;
}

/** 获取平台显示名称 */
export function getPlatformLabel(platform: PlatformType): string {
    switch (platform) {
        case "desktop": return "桌面端";
        case "android": return "Android";
        case "ios": return "iOS";
    }
}
