/**
 * 画布导出：把蹭饭图画布 DOM 序列化为 PNG 并触发浏览器下载。
 *
 * 离屏高清导出核心：
 * 用户屏幕分辨率/画布显示尺寸不影响导出清晰度——先把画布节点克隆到隐藏离屏容器
 * （position:fixed; left:-99999px），强制宽度 1600px（同文档内克隆，class/字体/CSS 变量
 * 全部生效），等字体与布局就绪后再序列化 SVG 并按 ≥4000px 宽栅格化，导出后移除克隆节点。
 *
 * 两档清晰度：
 * - ultra（默认）：html-to-image 先序列化为 SVG（矢量，含内嵌字体），
 *   再按 ≥4000px 宽栅格化到 canvas——文字按矢量重绘，放大不糊；
 *   失败时回退 html-to-image pixelRatio 4 直接位图化。
 * - standard：html-to-image pixelRatio 2，体积小、速度快。
 *
 * 无外部图片、字体为本地子集，无跨域污染风险。
 */
import { toPng, toSvg } from 'html-to-image'

export type ExportQuality = 'standard' | 'ultra'

export interface ExportResult {
  width: number
  height: number
  quality: ExportQuality
  /** ultra 栅格化失败回退到位图时为 true */
  fellBack: boolean
}

const BG = '#faf0d7'
/** 离屏克隆的固定布局宽度（px）：导出清晰度与用户屏幕无关 */
const EXPORT_BASE_W = 1600
/** 超清档目标宽度（px），不足 4000 一律拉到此宽度 */
const ULTRA_MIN_W = 4000
/** 超清档宽度上限，避免极端宽画布撑爆内存 */
const ULTRA_MAX_W = 8000
/** Chrome 单边 canvas 上限留出余量 */
const MAX_SIDE = 16000

function sanitize(s: string): string {
  return s.trim().replace(/[\\/:*?"<>|\s]+/g, '-')
}

/** 导出前确保画布字体已加载，否则 SVG/位图里会渲染成兜底字体 */
async function ensureFontsLoaded(): Promise<void> {
  try {
    await Promise.race([
      (async () => {
        await document.fonts.load('20px "MaShanZheng"', '蹭饭图')
        await document.fonts.load('700 20px "AlimamaShuHeiTi"', '2026')
        await document.fonts.load('20px "NotoSansSC"', '北京')
        await document.fonts.load('20px "ZCOOLXiaoWei"', '北京')
        await document.fonts.load('20px "ZCOOLQingKeHuangYou"', '北京')
        await document.fonts.ready
      })(),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ])
  } catch {
    // 字体加载失败不阻断导出，按兜底字体出图
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
}

/**
 * 把画布节点克隆到隐藏离屏容器并强制 1600px 宽，待字体/布局就绪后执行 fn，最后移除克隆。
 * 同文档内克隆，样式表、@font-face、CSS 变量照常生效。
 */
async function withOffscreenClone<T>(
  node: HTMLElement,
  fn: (clone: HTMLElement) => Promise<T>,
): Promise<T> {
  const holder = document.createElement('div')
  // 注意：不能用 visibility:hidden / opacity:0——会被 html-to-image 作为计算样式
  // 内联进序列化结果，导致导出整张空白。离屏定位本身已足够隐藏。
  holder.style.cssText =
    'position:fixed;left:-99999px;top:0;pointer-events:none;'
  const clone = node.cloneNode(true) as HTMLElement
  clone.style.width = `${EXPORT_BASE_W}px`
  clone.style.maxWidth = 'none'
  clone.style.margin = '0'
  holder.appendChild(clone)
  document.body.appendChild(holder)
  try {
    await ensureFontsLoaded()
    // 双 rAF：确保克隆节点完成排版与字体应用
    await nextFrame()
    return await fn(clone)
  } finally {
    holder.remove()
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('SVG 栅格化失败'))
    img.src = src
  })
}

/** ultra：SVG 序列化 → 按目标宽度矢量栅格化，返回 PNG dataURL 与实际尺寸 */
async function renderUltra(
  node: HTMLElement,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const w = node.offsetWidth
  const h = node.offsetHeight
  if (w === 0 || h === 0) throw new Error('画布尺寸为 0')
  const svgUrl = await toSvg(node, { cacheBust: true, backgroundColor: BG })
  const targetW = Math.min(Math.max(ULTRA_MIN_W, Math.round(w * 2)), ULTRA_MAX_W)
  const scale = targetW / w
  let cw = targetW
  let ch = Math.round(h * scale)
  if (ch > MAX_SIDE) {
    // 超长画布等比收敛到浏览器上限内
    ch = MAX_SIDE
    cw = Math.round(w * (MAX_SIDE / h))
  }
  const img = await loadImage(svgUrl)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 2D 画布')
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, cw, ch)
  ctx.drawImage(img, 0, 0, cw, ch)
  return { dataUrl: canvas.toDataURL('image/png'), width: cw, height: ch }
}

/**
 * 渲染画布为 PNG dataURL（不触发下载），供导出与测试复用。
 * 始终在 1600px 宽的离屏克隆上渲染，与用户屏幕分辨率无关。
 */
export async function renderNodeToPngDataUrl(
  node: HTMLElement,
  quality: ExportQuality = 'ultra',
): Promise<{ dataUrl: string } & ExportResult> {
  return withOffscreenClone(node, async (clone) => {
    if (quality === 'ultra') {
      try {
        const r = await renderUltra(clone)
        return { dataUrl: r.dataUrl, width: r.width, height: r.height, quality, fellBack: false }
      } catch (err) {
        console.warn('SVG 矢量栅格化失败，回退 pixelRatio 4 位图导出', err)
        const dataUrl = await toPng(clone, { pixelRatio: 4, cacheBust: true, backgroundColor: BG })
        const w = clone.offsetWidth * 4
        const h = clone.offsetHeight * 4
        return { dataUrl, width: w, height: h, quality, fellBack: true }
      }
    }
    const dataUrl = await toPng(clone, { pixelRatio: 2, cacheBust: true, backgroundColor: BG })
    return {
      dataUrl,
      width: clone.offsetWidth * 2,
      height: clone.offsetHeight * 2,
      quality,
      fellBack: false,
    }
  })
}

/**
 * @param node 画布根元素
 * @param title 班级标题（用于文件名，可空）
 * @param year 届数/年份（用于文件名，可空）
 * @param quality 清晰度档位，默认 ultra（≥4000px 宽）
 */
export async function exportNodeToPng(
  node: HTMLElement,
  title: string,
  year: string,
  quality: ExportQuality = 'ultra',
): Promise<ExportResult> {
  const { dataUrl, ...meta } = await renderNodeToPngDataUrl(node, quality)
  const parts = [sanitize(title), sanitize(year)].filter((p) => p !== '')
  const base = parts.length > 0 ? parts.join('-') : '蹭饭图'
  const filename = `${base}${quality === 'ultra' ? '-超清' : ''}.png`
  const a = document.createElement('a')
  a.download = filename
  a.href = dataUrl
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  return meta
}
