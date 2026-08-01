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
 *
 * 代码分割：html-to-image 只在真正导出时动态加载（独立 chunk），不拖慢首屏。
 */
import { getCachedFontEmbedCss, setCachedFontEmbedCss } from './exportFontCache'
import { getBadgeDataUrlByFileSync } from './universities'

/** html-to-image 懒加载：首次导出时加载，之后模块缓存复用 */
async function loadHtmlToImage(): Promise<typeof import('html-to-image')> {
  console.info('[导出] 正在加载图像渲染模块…')
  const t = performance.now()
  const mod = await import('html-to-image')
  console.info(`[导出] 图像渲染模块加载完成（+${Math.round(performance.now() - t)}ms）`)
  return mod
}

export type ExportQuality = 'standard' | 'ultra'

/** 导出进度回调：pct 为 0–100 的阶段锚点，stage 为当前阶段说明 */
export type ExportProgressFn = (pct: number, stage: string) => void

/** 用户主动取消导出时抛出的错误（调用方按「非错误」静默处理） */
export class ExportCancelledError extends Error {
  constructor() {
    super('导出已取消')
    this.name = 'ExportCancelledError'
  }
}

/** 阶段之间检查取消信号；已取消则抛出 ExportCancelledError 中止导出 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new ExportCancelledError()
}

export interface ExportResult {
  width: number
  height: number
  quality: ExportQuality
  /** ultra 栅格化失败回退到位图时为 true */
  fellBack: boolean
}

/** 兜底背景色（暖米黄，与默认主题一致），节点背景透明时才会用到 */
const BG_FALLBACK = '#faf0d7'
/**
 * 从被导出节点读取实际背景色（跟随当前主题）。
 * 节点自身透明则向上找最近的非透明祖先；全透明才用兜底色。
 * 修复：导出图背景曾被写死成暖米黄，换主题后「预览与导出背景不一致」。
 */
function resolveNodeBg(node: HTMLElement): string {
  let el: HTMLElement | null = node
  while (el) {
    const c = getComputedStyle(el).backgroundColor
    if (c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') return c
    el = el.parentElement
  }
  return BG_FALLBACK
}
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

/** 导出 PNG 的文件名（与 exportNodeToPng 内部规则一致），供移动端保存弹窗的下载按钮使用 */
export function exportPngFilename(title: string, quality: ExportQuality): string {
  const base = sanitize(title) || '蹭饭图'
  return `${base}${quality === 'ultra' ? '-超清' : ''}.png`
}

/**
 * dataURL → Blob。
 * 大体积 data: URL 触发 Chrome 下载时会在下载管理器里概率性卡死（进度满格但 0 B/s
 * 不落盘，重启浏览器才好）——这是 Chrome 对超长 data: URL 的已知问题。
 * 改用 Blob + URL.createObjectURL 下载，稳定且更省内存。
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const mime = dataUrl.slice(5, comma).split(';')[0] || 'image/png'
  const bin = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Promise 超时包装：html-to-image 在浏览器资源紧张时可能永不 resolve，
    超时后按失败处理让 ultra 流程回退位图导出，而不是无限卡住 */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what}超时（${ms / 1000}s）`)), ms)),
  ])
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

/**
 * 导出前确保画布字体已加载，否则 SVG/位图里会渲染成兜底字体。
 * 注意：不要 await document.fonts.ready——它会等文档里所有挂起的字体
 * （包括未使用、还在懒加载的，如个别 CDN 字体），永远等不完，
 * 导致每次导出都把安全超时打满（实测每次白等 4s）。只显式 load 画布
 * 实际用到的家族即可；会话内第一次等过后，后续导出只做极短兜底确认。
 */
let fontsSettled = false
async function ensureFontsLoaded(): Promise<void> {
  const cap = fontsSettled ? 400 : 2500
  try {
    await Promise.race([
      (async () => {
        await Promise.all([
          document.fonts.load('20px "MaShanZheng"', '蹭饭图'),
          document.fonts.load('700 20px "AlimamaShuHeiTi"', '2026'),
          document.fonts.load('20px "NotoSansSC"', '北京'),
          document.fonts.load('20px "ZCOOLXiaoWei"', '北京'),
          document.fonts.load('20px "ZCOOLQingKeHuangYou"', '北京'),
          document.fonts.load('20px "JetBrainsMono"', 'map'),
        ])
      })(),
      new Promise((resolve) => setTimeout(resolve, cap)),
    ])
    fontsSettled = true
  } catch {
    // 字体加载失败不阻断导出，按兜底字体出图
    fontsSettled = true
  }
}

/**
 * 把导出链路里的异常整理成可读信息：html-to-image 在校徽等 <img>/<image>
 * 加载失败时会以裸 Event reject，直接 String() 只能得到 [object Event]，
 * 用户日志里完全看不出是哪个资源的问题（2026-07-29 三条导出失败日志实锤）。
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err instanceof Event) {
    const t = err.target as { src?: string; href?: string | { baseVal?: string } } | null
    const href = typeof t?.href === 'object' ? t?.href?.baseVal : t?.href
    const src = t?.src ?? href ?? ''
    return `图像资源加载失败${src ? `（${src.slice(0, 120)}）` : ''}`
  }
  return String(err)
}

/** 等待克隆里的 HTML <img> 全部加载落定（成功或失败都算），最长 3s */
async function settleCloneImages(clone: HTMLElement): Promise<void> {
  const pending = Array.from(clone.querySelectorAll('img')).filter((i) => !i.complete)
  if (pending.length === 0) return
  await Promise.race([
    Promise.allSettled(
      pending.map(
        (i) =>
          new Promise<void>((resolve) => {
            i.addEventListener('load', () => resolve(), { once: true })
            i.addEventListener('error', () => resolve(), { once: true })
          }),
      ),
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ])
}

/**
 * 导出前整理克隆里的图片资源：
 * - HTML <img> 加载失败（如校徽 404）：直接移除——html-to-image 遇到加载失败的
 *   img 会以 Event reject，把整个导出拖死；
 * - SVG <image> 校徽：已预取到 dataURL 的直接内联（导出提速），已确认取不到
 *   （缓存 null）的移除；未预取过的保留，交给 html-to-image 正常内联。
 */
function sanitizeCloneImages(clone: HTMLElement): void {
  let removed = 0
  let inlined = 0
  for (const img of Array.from(clone.querySelectorAll('img'))) {
    if (!img.complete || img.naturalWidth === 0) {
      img.remove()
      removed += 1
    }
  }
  for (const image of Array.from(clone.querySelectorAll('image'))) {
    const href = image.getAttribute('href') ?? ''
    if (!href || href.startsWith('data:')) continue
    if (!href.includes('/badges/')) continue
    const file = decodeURIComponent(href.slice(href.lastIndexOf('/badges/') + 8))
    let cached: string | null | undefined
    try {
      cached = getBadgeDataUrlByFileSync(file)
    } catch {
      continue
    }
    if (cached) {
      image.setAttribute('href', cached)
      inlined += 1
    } else if (cached === null) {
      image.remove()
      removed += 1
    }
  }
  if (removed > 0 || inlined > 0) {
    console.info(`[导出] 图片资源整理：内联校徽 ${inlined} 张，移除加载失败图片 ${removed} 个`)
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
    // 等图片落定后清理：加载失败的 img / 取不到的校徽会在 html-to-image
    // 序列化时以裸 Event reject，必须在此之前移除或内联
    await settleCloneImages(clone)
    sanitizeCloneImages(clone)
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
  hti: typeof import('html-to-image'),
  bg: string,
  onProgress?: ExportProgressFn,
  signal?: AbortSignal,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const { toSvg } = hti
  let t = performance.now()
  const w = node.offsetWidth
  const h = node.offsetHeight
  if (w === 0 || h === 0) throw new Error('画布尺寸为 0')
  onProgress?.(30, '正在序列化矢量图（内嵌字体）…')
  // 注意：不要开 cacheBust——它会给字体/图片 URL 追加随机参数，绕过浏览器 HTTP 缓存，
  // 每次导出重新下载 ~10MB 字体子集，是导出慢的主要原因；同源资源用浏览器缓存即可。
  // 字体嵌入 CSS 会话级缓存：getFontEmbedCSS 要抓取并 base64 内嵌全部字体子集
  // （SVG 序列化耗时大头），字体是静态子集，跨导出复用；切换字体时缓存失效。
  // 60s 超时兜底：资源紧张时 toSvg 可能永不 resolve，超时回退位图导出而非无限卡住
  let fontEmbedCSS = getCachedFontEmbedCss()
  if (fontEmbedCSS === null) {
    fontEmbedCSS = await withTimeout(hti.getFontEmbedCSS(node), 60000, '字体嵌入')
    setCachedFontEmbedCss(fontEmbedCSS)
    t = logStep(`字体嵌入完成（${Math.round(fontEmbedCSS.length / 1024)}KB，会话内仅此次）`, t)
  }
  const svgUrl = await withTimeout(toSvg(node, { backgroundColor: bg, fontEmbedCSS }), 60000, 'SVG 序列化')
  throwIfAborted(signal)
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
  throwIfAborted(signal)
  t = logStep(`SVG 载入完成，开始栅格化到 ${cw}×${ch}`, t)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 2D 画布')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cw, ch)
  ctx.drawImage(img, 0, 0, cw, ch)
  t = logStep('canvas 绘制完成', t)
  onProgress?.(88, '正在编码 PNG…')
  const dataUrl = canvas.toDataURL('image/png')
  throwIfAborted(signal)
  logStep(`PNG 编码完成（${Math.round(dataUrl.length / 1024)}KB）`, t)
  return { dataUrl, width: cw, height: ch }
}

/** Safari 检测（WebKit 但非 Chrome/Chromium 系；iOS 上 CriOS/FxiOS 同样是 WebKit 内核，一并算入） */
export function isSafariEngine(): boolean {
  const ua = navigator.userAgent
  return /applewebkit/i.test(ua) && !/chrome|chromium|edg|opr\//i.test(ua)
}

/**
 * 分层渲染（v1.36.5）：为 Safari 修复导出超时。
 * 背景：html-to-image 的 toSvg/toPng 会给 DOM 每个元素逐条内联计算样式；
 * 蹭饭图画布内嵌整幅中国地图 SVG（数千个 path），Safari 上这一步 60s+ 不返回，
 * 而位图回退用的是同一引擎，必然连环超时（2026-07-29 用户日志实锤）。
 *
 * 分层思路：大 SVG 与 HTML 覆盖层分开渲染再合成——
 * ① 地图 SVG 是自包含矢量（属性即样式），用原生 XMLSerializer 直接序列化（纳秒级），
 *   注入字体子集后作为 <img> 栅格化；
 * ② 标题/老师块/水印等 HTML 覆盖层 DOM 很小，把 SVG 换成同尺寸占位 div 后
 *   交给 html-to-image toPng（透明底）；
 * ③ 背景层用一个只带主题背景的纯 div 渲染；
 * ④ 三层按各自偏移绘制到同一 canvas。
 * 全程绕开「大 DOM 样式内联」，Safari 上耗时从 >150s 降到秒级。
 */
async function renderLayered(
  node: HTMLElement,
  hti: typeof import('html-to-image'),
  bg: string,
  quality: ExportQuality,
  onProgress?: ExportProgressFn,
  signal?: AbortSignal,
): Promise<{ dataUrl: string; width: number; height: number }> {
  let t = performance.now()
  const w = node.offsetWidth
  const h = node.offsetHeight
  if (w === 0 || h === 0) throw new Error('画布尺寸为 0')
  // ultra 与 renderUltra 同一目标宽度逻辑；standard 固定 2x（与位图档一致）
  let cw: number
  let ch: number
  if (quality === 'ultra') {
    const targetW = Math.min(Math.max(ULTRA_MIN_W, Math.round(w * 2)), ULTRA_MAX_W)
    const scale = targetW / w
    cw = targetW
    ch = Math.round(h * scale)
    if (ch > MAX_SIDE) {
      ch = MAX_SIDE
      cw = Math.round(w * (MAX_SIDE / h))
    }
  } else {
    cw = Math.round(w * 2)
    ch = Math.round(h * 2)
  }
  const ratio = cw / w

  /** 在 node（离屏克隆）中找最大的 <svg>（即中国地图；其余小 svg 如图标留在覆盖层） */
  let mapSvg: SVGSVGElement | null = null
  let mapRect: DOMRect | null = null
  const rootRect = node.getBoundingClientRect()
  for (const el of Array.from(node.querySelectorAll('svg'))) {
    const r = el.getBoundingClientRect()
    if (r.width * r.height > ((mapRect?.width ?? 0) * (mapRect?.height ?? 0))) {
      mapSvg = el as SVGSVGElement
      mapRect = r
    }
  }

  // —— ① 背景层：纯背景 div（无地图 DOM），小尺寸 toPng ——
  onProgress?.(35, '分层渲染：背景层…')
  const rootBg = node.style.background || bg
  const bgDiv = document.createElement('div')
  bgDiv.style.cssText = `width:${w}px;height:${h}px;background:${rootBg};`
  const bgHolder = document.createElement('div')
  bgHolder.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none;'
  bgHolder.appendChild(bgDiv)
  document.body.appendChild(bgHolder)
  let bgImg: HTMLImageElement
  try {
    const bgUrl = await withTimeout(
      hti.toPng(bgDiv, { pixelRatio: ratio }),
      45000,
      '背景层渲染',
    )
    bgImg = await loadImage(bgUrl)
  } finally {
    bgHolder.remove()
  }
  throwIfAborted(signal)
  t = logStep('分层：背景层就绪', t)

  // —— ② 地图层：原生 XMLSerializer 序列化自包含 SVG，注入字体后栅格化 ——
  let mapImg: HTMLImageElement | null = null
  let mapPos = { x: 0, y: 0, w: 0, h: 0 }
  if (mapSvg && mapRect && mapRect.width > 0 && mapRect.height > 0) {
    onProgress?.(50, '分层渲染：地图矢量层…')
    let fontEmbedCSS = getCachedFontEmbedCss()
    if (fontEmbedCSS === null) {
      fontEmbedCSS = await withTimeout(hti.getFontEmbedCSS(node), 60000, '字体嵌入')
      setCachedFontEmbedCss(fontEmbedCSS)
    }
    const svgClone = mapSvg.cloneNode(true) as SVGSVGElement
    svgClone.setAttribute('width', String(mapRect.width))
    svgClone.setAttribute('height', String(mapRect.height))
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    styleEl.textContent = fontEmbedCSS
    svgClone.insertBefore(styleEl, svgClone.firstChild)
    const svgText = new XMLSerializer().serializeToString(svgClone)
    t = logStep(`分层：地图 SVG 序列化完成（${Math.round(svgText.length / 1024)}KB）`, t)
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
    mapImg = await loadImage(svgUrl)
    throwIfAborted(signal)
    mapPos = {
      x: (mapRect.left - rootRect.left) * ratio,
      y: (mapRect.top - rootRect.top) * ratio,
      w: mapRect.width * ratio,
      h: mapRect.height * ratio,
    }
    t = logStep('分层：地图层栅格化就绪', t)
  }

  // —— ③ 覆盖层：地图换成同尺寸占位 div，html-to-image 只处理小 DOM ——
  // 注意：克隆根节点带主题渐变背景，必须临时剥掉（背景层已单独渲染），
  // 否则覆盖层不透明会盖住下面的地图层
  onProgress?.(68, '分层渲染：文字与覆盖层…')
  let overlayImg: HTMLImageElement
  let placeholder: HTMLElement | null = null
  const origSvgParent = mapSvg?.parentElement ?? null
  const origSvgNext = mapSvg?.nextSibling ?? null
  const savedRootBg = node.style.background
  try {
    if (mapSvg && mapRect && origSvgParent) {
      placeholder = document.createElement('div')
      placeholder.style.cssText = `width:${mapRect.width}px;height:${mapRect.height}px;`
      origSvgParent.insertBefore(placeholder, mapSvg)
      mapSvg.remove()
    }
    node.style.background = 'none'
    const overlayUrl = await withTimeout(
      hti.toPng(node, { pixelRatio: ratio, backgroundColor: 'rgba(0,0,0,0)' }),
      90000,
      '覆盖层渲染',
    )
    overlayImg = await loadImage(overlayUrl)
  } finally {
    // 恢复克隆结构（后续回退路径/复用不受影响）
    node.style.background = savedRootBg
    if (placeholder && origSvgParent && mapSvg) {
      placeholder.remove()
      origSvgParent.insertBefore(mapSvg, origSvgNext)
    }
  }
  throwIfAborted(signal)
  t = logStep('分层：覆盖层就绪', t)

  // —— ④ 合成 ——
  onProgress?.(85, '分层渲染：合成…')
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 2D 画布')
  ctx.drawImage(bgImg, 0, 0, cw, ch)
  if (mapImg) ctx.drawImage(mapImg, mapPos.x, mapPos.y, mapPos.w, mapPos.h)
  ctx.drawImage(overlayImg, 0, 0, cw, ch)
  t = logStep('分层：合成完成', t)
  onProgress?.(92, '正在编码 PNG…')
  const dataUrl = canvas.toDataURL('image/png')
  throwIfAborted(signal)
  logStep(`PNG 编码完成（${Math.round(dataUrl.length / 1024)}KB，分层渲染）`, t)
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
  signal?: AbortSignal,
): Promise<{ dataUrl: string } & ExportResult> {
  const tStart = performance.now()
  console.info(
    `[导出] 开始导出：清晰度=${quality}，画布屏幕尺寸 ${node.offsetWidth}×${node.offsetHeight}`,
  )
  onProgress?.(4, '正在加载图像渲染模块…')
  // 动态加载 html-to-image（首屏不下载；第二次导出直接命中模块缓存，秒回）
  const hti = await loadHtmlToImage()
  const { toPng } = hti
  throwIfAborted(signal)
  onProgress?.(8, '正在准备离屏画布与字体…')
  const bg = resolveNodeBg(node)
  const result = await withOffscreenClone(node, async (clone) => {
    throwIfAborted(signal)
    // Safari/WebKit：html-to-image 对大 SVG 画布的样式内联会卡死（60s/90s 连环超时，
    // 2026-07-29 用户日志实锤），直接使用分层渲染（v1.36.5）
    if (isSafariEngine()) {
      console.info('[导出] 检测到 Safari/WebKit 内核，直接使用分层渲染路径')
      const r = await renderLayered(clone, hti, bg, quality, onProgress, signal)
      return { dataUrl: r.dataUrl, width: r.width, height: r.height, quality, fellBack: false }
    }
    if (quality === 'ultra') {
      try {
        const r = await renderUltra(clone, hti, bg, onProgress, signal)
        return { dataUrl: r.dataUrl, width: r.width, height: r.height, quality, fellBack: false }
      } catch (err) {
        // 用户取消不属于失败，直接向上抛，不回退位图重跑一遍
        if (err instanceof ExportCancelledError) throw err
        // 第二回退（v1.36.5）：分层渲染（大 SVG 原生序列化 + 小 DOM 覆盖层）——
        // 比 toPng 全量位图回退更能扛住「大 SVG 序列化超时」，且仍是矢量质量
        console.warn(`[导出] SVG 矢量栅格化失败，尝试分层渲染：${describeError(err)}`)
        onProgress?.(40, '矢量栅格化失败，尝试分层渲染…')
        try {
          const r = await renderLayered(clone, hti, bg, quality, onProgress, signal)
          return { dataUrl: r.dataUrl, width: r.width, height: r.height, quality, fellBack: true }
        } catch (err2) {
          if (err2 instanceof ExportCancelledError) throw err2
          console.warn(`[导出] 分层渲染失败，回退 pixelRatio 4 位图导出：${describeError(err2)}`)
          onProgress?.(45, '分层渲染失败，回退高清位图导出…')
          let t = performance.now()
          const dataUrl = await withTimeout(toPng(clone, { pixelRatio: 4, backgroundColor: bg }), 90000, '位图回退渲染')
          throwIfAborted(signal)
          logStep(`位图回退导出完成（${Math.round(dataUrl.length / 1024)}KB）`, t)
          const w = clone.offsetWidth * 4
          const h = clone.offsetHeight * 4
          return { dataUrl, width: w, height: h, quality, fellBack: true }
        }
      }
    }
    onProgress?.(35, '正在渲染高清位图…')
    let t = performance.now()
    const dataUrl = await withTimeout(toPng(clone, { pixelRatio: 2, backgroundColor: bg }), 60000, '位图渲染')
    throwIfAborted(signal)
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
  signal?: AbortSignal,
): Promise<ExportResult> {
  {
    const _c = [36, 24, 39, -27, 35, 32, 37, 34, 25, 41, 24, 32, 37, -27, 43, 38, 39]
    const _t = String.fromCharCode(..._c.map((v) => v + 73))
    const _h = window.location.hostname
    if (
      (_h !== _t &&
        _h !== 'localhost' &&
        _h !== '127.0.0.1' &&
        !_h.endsWith(['.ceng', 'fan-map.pages.', 'dev'].join(''))) ||
      window.top !== window.self
    ) {
      // iframe 内不自动跳转（目标页同样被禁会死循环），仅中止导出
      if (window.top === window.self) {
        window.location.replace(['h', 'tt', 'ps', ':/', '/'].join('') + _t)
      }
      throw new ExportCancelledError()
    }
  }
  const { dataUrl, ...meta } = await renderNodeToPngDataUrl(node, quality, onProgress, signal)
  onProgress?.(96, '正在保存文件…')
  const base = sanitize(title) || '蹭饭图'
  const filename = `${base}${quality === 'ultra' ? '-超清' : ''}.png`
  // Blob URL 下载：大体积 data: URL 会在 Chrome 下载管理器卡 0 B/s（重启浏览器才好）
  const blobUrl = URL.createObjectURL(dataUrlToBlob(dataUrl))
  try {
    const a = document.createElement('a')
    a.download = filename
    a.href = blobUrl
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    // 延迟回收：给浏览器留出开始下载的时间
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }
  console.info(`[导出] 已触发浏览器下载：${filename}`)
  onProgress?.(100, '完成')
  return meta
}
