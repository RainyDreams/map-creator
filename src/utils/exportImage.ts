/**
 * 画布导出：把蹭饭图画布 DOM 序列化为 PNG 并触发浏览器下载。
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
/** 超清档目标宽度（px），不足 4000 一律拉到此宽度 */
const ULTRA_MIN_W = 4000
/** 超清档宽度上限，避免极端宽画布撑爆内存 */
const ULTRA_MAX_W = 8000
/** Chrome 单边 canvas 上限留出余量 */
const MAX_SIDE = 16000

function sanitize(s: string): string {
  return s.trim().replace(/[\\/:*?"<>|\s]+/g, '-')
}

/** 导出前确保书法字体已加载，否则 SVG/位图里会渲染成兜底楷体 */
async function ensureFontsLoaded(): Promise<void> {
  try {
    await Promise.race([
      (async () => {
        await document.fonts.load('20px "MaShanZheng"', '蹭饭图')
        await document.fonts.ready
      })(),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ])
  } catch {
    // 字体加载失败不阻断导出，按兜底字体出图
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
 */
export async function renderNodeToPngDataUrl(
  node: HTMLElement,
  quality: ExportQuality = 'ultra',
): Promise<{ dataUrl: string } & ExportResult> {
  await ensureFontsLoaded()
  if (quality === 'ultra') {
    try {
      const r = await renderUltra(node)
      return { dataUrl: r.dataUrl, width: r.width, height: r.height, quality, fellBack: false }
    } catch (err) {
      console.warn('SVG 矢量栅格化失败，回退 pixelRatio 4 位图导出', err)
      const dataUrl = await toPng(node, { pixelRatio: 4, cacheBust: true, backgroundColor: BG })
      const w = node.offsetWidth * 4
      const h = node.offsetHeight * 4
      return { dataUrl, width: w, height: h, quality, fellBack: true }
    }
  }
  const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: BG })
  return {
    dataUrl,
    width: node.offsetWidth * 2,
    height: node.offsetHeight * 2,
    quality,
    fellBack: false,
  }
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
