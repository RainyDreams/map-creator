/**
 * 导出用的字体嵌入 CSS 缓存（会话级）：
 * html-to-image 每次 toSvg 都会重新抓取并 base64 内嵌全部 @font-face 字体
 * （~10MB 子集，约占 SVG 序列化耗时的大头）。字体文件本身是静态子集，
 * 只有用户切换字体槽位 / 增删自定义字体时才需要重新内嵌——
 * 因此把 getFontEmbedCSS 的结果缓存起来跨导出复用，变更时由
 * MapDataContext 调用 invalidateFontEmbedCache() 失效。
 *
 * 独立成微型模块是为了让 store 失效缓存时不把 exportImage 拉进主包
 * （exportImage 走动态 import 做代码分割）。
 */
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
