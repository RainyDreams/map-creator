/**
 * 画布导出：把蹭饭图画布 DOM 序列化为 PNG 并触发浏览器下载。
 *
 * 离屏高清导出核心：
 * 导出画面与页面所见严格一致——先把画布节点克隆到隐藏离屏容器
 * （position:fixed; left:-99999px），克隆宽度取画布在屏幕上的实际布局宽度
 * （同文档内克隆，class/字体/CSS 变量全部生效），等字体与布局就绪后再序列化 SVG
 * 并按 ≥4000px 宽矢量栅格化，导出后移除克隆节点。因此无论用户屏幕分辨率多低，
 * 导出 PNG 既与屏幕排版一致（不挤压、不换行差异），又保持超清。
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

/** 导出进度回调：pct 为 0–100 的阶段锚点，stage 为当前阶段说明 */
export type ExportProgressFn = (pct: number, stage: string) => void

export interface ExportResult {
  width: number
  height: number
  quality: ExportQuality
  /** ultra 栅格化失败回退到位图时为 true */
  fellBack: boolean
}

const BG = '#faf0d7'
/** 屏幕画布宽度小于该值时，离屏克隆按此宽度排版（避免极小屏导出布局过窄） */
const EXPORT_MIN_W = 800
/** 超清档目标宽度（px），不足 4000 一律拉到此宽度 */
const ULTRA_MIN_W = 4000
/** 超清档宽度上限，避免极端宽画布撑爆内存 */
const ULTRA_MAX_W = 8000
/** Chrome 单边 canvas 上限留出余量 */
const MAX_SIDE = 16000

function sanitize(s: string): string {
  return s.trim().replace(/[\\/:*?"<>|\s]+/g, '-')
}

/**
 * 导出流程调试日志：每一步输出耗时（相对上一步）。
 * 导出"卡死"时打开控制台，最后一条 [导出] 日志停在哪一步，问题就在哪一步。
 */
function logStep(step: string, since: number): number {
  const now = performance.now()
  console.info(`[导出] ${step}（+${Math.round(now - since)}ms）`)
  return now
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
 * 把画布节点克隆到隐藏离屏容器，克隆宽度 = 画布屏幕实际宽度（所见即所得，
 * 最低 800px 兜底），待字体/布局就绪后执行 fn，最后移除克隆。
 * 同文档内克隆，样式表、@font-face、CSS 变量照常生效。
 */
async function withOffscreenClone<T>(
  node: HTMLElement,
  fn: (clone: HTMLElement) => Promise<T>,
): Promise<T> {
  let t = performance.now()
  const holder = document.createElement('div')
  // 注意：不能用 visibility:hidden / opacity:0——会被 html-to-image 作为计算样式
  // 内联进序列化结果，导致导出整张空白。离屏定位本身已足够隐藏。
  holder.style.cssText =
    'position:fixed;left:-99999px;top:0;pointer-events:none;'
  const clone = node.cloneNode(true) as HTMLElement
  const baseW = Math.max(node.offsetWidth || 0, EXPORT_MIN_W)
  clone.style.width = `${baseW}px`
  clone.style.maxWidth = 'none'
  clone.style.margin = '0'
  holder.appendChild(clone)
  document.body.appendChild(holder)
  t = logStep(`离屏克隆完成，排版宽度 ${baseW}px`, t)
  try {
    await ensureFontsLoaded()
    t = logStep('画布字体就绪', t)
    // 双 rAF：确保克隆节点完成排版与字体应用
    await nextFrame()
    logStep('离屏排版就绪', t)
    return await fn(clone)
  } finally {
    holder.remove()
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // 超时兜底：SVG 巨大或内存紧张时 onload 可能永远不来，30s 后按失败处理，
    // 让 ultra 流程回退位图导出而不是无限卡死
    const timer = setTimeout(() => reject(new Error('SVG 图片加载超时（30s）')), 30000)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error('SVG 栅格化失败'))
    }
    img.src = src
  })
}

/** ultra：SVG 序列化 → 按目标宽度矢量栅格化，返回 PNG dataURL 与实际尺寸 */
async function renderUltra(
  node: HTMLElement,
  onProgress?: ExportProgressFn,
): Promise<{ dataUrl: string; width: number; height: number }> {
  let t = performance.now()
  const w = node.offsetWidth
  const h = node.offsetHeight
  if (w === 0 || h === 0) throw new Error('画布尺寸为 0')
  onProgress?.(30, '正在序列化矢量图（内嵌字体）…')
  const svgUrl = await toSvg(node, { cacheBust: true, backgroundColor: BG })
  t = logStep(`SVG 序列化完成（${Math.round(svgUrl.length / 1024)}KB）`, t)
  const targetW = Math.min(Math.max(ULTRA_MIN_W, Math.round(w * 2)), ULTRA_MAX_W)
  const scale = targetW / w
  let cw = targetW
  let ch = Math.round(h * scale)
  if (ch > MAX_SIDE) {
    // 超长画布等比收敛到浏览器上限内
    ch = MAX_SIDE
    cw = Math.round(w * (MAX_SIDE / h))
  }
  onProgress?.(62, `正在按 ${cw}×${ch} 超清栅格化…`)
  const img = await loadImage(svgUrl)
  t = logStep(`SVG 载入完成，开始栅格化到 ${cw}×${ch}`, t)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 2D 画布')
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, cw, ch)
  ctx.drawImage(img, 0, 0, cw, ch)
  t = logStep('canvas 绘制完成', t)
  onProgress?.(88, '正在编码 PNG…')
  const dataUrl = canvas.toDataURL('image/png')
  logStep(`PNG 编码完成（${Math.round(dataUrl.length / 1024)}KB）`, t)
  return { dataUrl, width: cw, height: ch }
}

/**
 * 渲染画布为 PNG dataURL（不触发下载），供导出与测试复用。
 * 在按画布屏幕实际宽度排版的离屏克隆上渲染，再矢量放大到超清尺寸，
 * 与用户屏幕分辨率无关且与页面所见一致。
 */
export async function renderNodeToPngDataUrl(
  node: HTMLElement,
  quality: ExportQuality = 'ultra',
  onProgress?: ExportProgressFn,
): Promise<{ dataUrl: string } & ExportResult> {
  const tStart = performance.now()
  console.info(
    `[导出] 开始导出：清晰度=${quality}，画布屏幕尺寸 ${node.offsetWidth}×${node.offsetHeight}`,
  )
  onProgress?.(8, '正在准备离屏画布与字体…')
  const result = await withOffscreenClone(node, async (clone) => {
    if (quality === 'ultra') {
      try {
        const r = await renderUltra(clone, onProgress)
        return { dataUrl: r.dataUrl, width: r.width, height: r.height, quality, fellBack: false }
      } catch (err) {
        console.warn('[导出] SVG 矢量栅格化失败，回退 pixelRatio 4 位图导出：', err)
        onProgress?.(40, '矢量栅格化失败，回退高清位图导出…')
        let t = performance.now()
        const dataUrl = await toPng(clone, { pixelRatio: 4, cacheBust: true, backgroundColor: BG })
        logStep(`位图回退导出完成（${Math.round(dataUrl.length / 1024)}KB）`, t)
        const w = clone.offsetWidth * 4
        const h = clone.offsetHeight * 4
        return { dataUrl, width: w, height: h, quality, fellBack: true }
      }
    }
    onProgress?.(35, '正在渲染高清位图…')
    let t = performance.now()
    const dataUrl = await toPng(clone, { pixelRatio: 2, cacheBust: true, backgroundColor: BG })
    logStep(`位图渲染完成（${Math.round(dataUrl.length / 1024)}KB）`, t)
    onProgress?.(88, '正在编码 PNG…')
    return {
      dataUrl,
      width: clone.offsetWidth * 2,
      height: clone.offsetHeight * 2,
      quality,
      fellBack: false,
    }
  })
  console.info(`[导出] 渲染全部完成，总耗时 ${Math.round(performance.now() - tStart)}ms`)
  return result
}

/**
 * @param node 画布根元素
 * @param title 大标题（用于文件名，可空）
 * @param quality 清晰度档位，默认 ultra（≥4000px 宽）
 * @param onProgress 进度回调（阶段锚点 + 说明文案）
 */
export async function exportNodeToPng(
  node: HTMLElement,
  title: string,
  quality: ExportQuality = 'ultra',
  onProgress?: ExportProgressFn,
): Promise<ExportResult> {
  const { dataUrl, ...meta } = await renderNodeToPngDataUrl(node, quality, onProgress)
  onProgress?.(96, '正在保存文件…')
  const base = sanitize(title) || '蹭饭图'
  const filename = `${base}${quality === 'ultra' ? '-超清' : ''}.png`
  const a = document.createElement('a')
  a.download = filename
  a.href = dataUrl
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  console.info(`[导出] 已触发浏览器下载：${filename}`)
  onProgress?.(100, '完成')
  return meta
}
