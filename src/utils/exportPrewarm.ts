/**
 * 闲时导出预热（v1.42.4）。
 *
 * 用户看画布、填名单的空档，提前完成导出前的三项准备工作：
 * ① 渲染引擎 chunk（html-to-image）下载——与导出共享模块缓存；
 * ② 画布字体加载（ensureCanvasFontsLoaded，与导出同一路径）；
 * ③ 字体嵌入 CSS 构建（buildFontEmbedCSS）并写入会话缓存。
 * 点「导出为图片」时直接命中缓存进入渲染，省掉前几秒的等待。
 *
 * 一致性保障：预热产物首行带覆盖标记，导出前 fontEmbedCssCoversNow
 * 对照当前画布字体需求，预热后字体有变化会自动重建（见 exportFonts）。
 *
 * 克制策略：
 * - 省流量模式（saveData）与 2G/slow-2g 弱网不预热——尊重用户流量；
 * - 用 requestIdleCallback（Safari 无此 API，回退 setTimeout 2.5s）；
 * - 已有缓存直接跳过；预热失败静默（导出时走正常构建路径兜底）。
 */
import { getCachedFontEmbedCss, setCachedFontEmbedCss } from './exportFontCache'

let scheduled = false

export function scheduleExportPrewarm(): void {
  if (scheduled) return
  if (getCachedFontEmbedCss() !== null) return
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection
  if (conn?.saveData === true || conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') {
    return
  }
  scheduled = true
  const ric: (cb: () => void) => void =
    typeof window.requestIdleCallback === 'function'
      ? (cb) => window.requestIdleCallback(cb, { timeout: 5000 })
      : (cb) => {
          window.setTimeout(cb, 2500)
        }
  ric(() => {
    scheduled = false
    void (async () => {
      try {
        if (getCachedFontEmbedCss() !== null) return
        const t = performance.now()
        console.info('[预热] 闲时预热导出：渲染引擎与字体嵌入…')
        // 引擎 chunk 提前下载（与导出的动态 import 指向同一模块，共享缓存）
        void import('html-to-image')
        const { ensureCanvasFontsLoaded, buildFontEmbedCSS } = await import('./exportFonts')
        await ensureCanvasFontsLoaded()
        if (getCachedFontEmbedCss() !== null) return
        const css = await buildFontEmbedCSS()
        if (css !== '') {
          setCachedFontEmbedCss(css)
          console.info(
            `[预热] 字体嵌入已就绪（${Math.round(css.length / 1024)}KB，+${Math.round(performance.now() - t)}ms），导出将直接使用`,
          )
        }
      } catch {
        // 预热失败静默：导出时会走正常构建路径
      }
    })()
  })
}
