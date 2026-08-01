/**
 * 导出用的字体嵌入 CSS 缓存（会话级）：
 * 字体嵌入 CSS 需要把字体文件 base64 内嵌（数 MB），字体文件本身是静态子集，
 * 只有用户切换字体槽位 / 增删自定义字体时才需要重新内嵌——
 * 因此把构建结果缓存起来跨导出复用，变更时由
 * MapDataContext 调用 invalidateFontEmbedCache() 失效。
 *
 * 独立成微型模块是为了让 store 失效缓存时不把 exportImage 拉进主包
 * （exportImage 走动态 import 做代码分割）。
 */
import type { CustomFont } from './fonts'

let cachedFontEmbedCss: string | null = null

export function getCachedFontEmbedCss(): string | null {
  return cachedFontEmbedCss
}

export function setCachedFontEmbedCss(css: string): void {
  cachedFontEmbedCss = css
}

export function invalidateFontEmbedCache(): void {
  cachedFontEmbedCss = null
}

/** 用户上传的自定义字体注册表：由 MapDataContext 在 customFonts 变更时同步，
    供导出构建字体嵌入 CSS 时内嵌（dataURL，零网络请求） */
let exportCustomFonts: CustomFont[] = []

export function setExportCustomFonts(fonts: CustomFont[]): void {
  exportCustomFonts = fonts
}

export function getExportCustomFonts(): CustomFont[] {
  return exportCustomFonts
}
