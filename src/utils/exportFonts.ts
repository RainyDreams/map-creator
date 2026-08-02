/**
 * 导出用的字体嵌入 CSS 构建器（v1.42.2）。
 *
 * 为什么不用 html-to-image 的 getFontEmbedCSS：
 * 它对每个字体 URL 裸 fetch()、无超时——慢网络/边缘节点抖动时永不 resolve，
 * 把 SVG 序列化、分层渲染、位图回退三条路径连环拖死（2026-08-01 用户日志实锤：
 * 字体嵌入 60s、背景层 45s、位图 90s 全部超时）。
 *
 * 本构建器的策略：
 * 1. 只嵌入画布实际用到的字体分片——document.fonts.check 判定（浏览器按需
 *    加载 unicode-range 分片，已加载即画面在用），没用到生僻字就不嵌 cjk-b；
 * 2. 每个文件独立 25s 超时、并行抓取，失败/超时只跳过该文件（导出降级为
 *    回退字体继续，与 font-display:swap 下用户屏幕上看到的画面一致），
 *    绝不让整个导出失败；
 * 3. fetch 用 force-cache 吃满浏览器 HTTP 缓存（/fonts/* 是 immutable），
 *    主站失败时若配置了静态镜像（window.__CF_MIRROR_ORIGIN__）自动走镜像重试；
 * 4. 用户上传的自定义字体本就是 dataURL，直接内嵌，零网络请求。
 */
import { getExportCustomFonts } from './exportFontCache'
import { customFontFamilyName } from './fonts'

/** 单个字体分片描述（与 index.css / components/map/fonts.css 的 @font-face 一一对应） */
interface FontFileDef {
  family: string
  /** public/fonts 下的文件名 */
  file: string
  weight: number
  /** unicode-range（无则省略，如 AlimamaShuHeiTi 全量小文件） */
  range?: string
  /** document.fonts.check 用的字体简写与代表字符（命中该分片的 unicode-range） */
  checkFont: string
  checkText: string
}

const RANGE_LATIN = 'U+0000-00FF, U+2000-206F, U+3000-303F, U+FF00-FFEF'
const RANGE_CJK_A = 'U+4E00-7FFF'
const RANGE_CJK_B = 'U+8000-9FFF'

/** 三片分族的通用定义生成器 */
function splitFamily(family: string): FontFileDef[] {
  return [
    {
      family,
      file: `${family}-subset-latin.woff2`,
      weight: 400,
      range: RANGE_LATIN,
      checkFont: `20px "${family}"`,
      checkText: 'A',
    },
    {
      family,
      file: `${family}-subset-cjk-a.woff2`,
      weight: 400,
      range: RANGE_CJK_A,
      checkFont: `20px "${family}"`,
      checkText: '中', // U+4E2D，落在 cjk-a
    },
    {
      family,
      file: `${family}-subset-cjk-b.woff2`,
      weight: 400,
      range: RANGE_CJK_B,
      checkFont: `20px "${family}"`,
      checkText: '蹭', // U+8E6D，落在 cjk-b
    },
  ]
}

const FONT_FILES: FontFileDef[] = [
  {
    family: 'AlimamaShuHeiTi',
    file: 'AlimamaShuHeiTi-Bold-subset.woff2',
    weight: 700,
    checkFont: '700 20px "AlimamaShuHeiTi"',
    checkText: '2',
  },
  ...splitFamily('MaShanZheng'),
  {
    family: 'Excalifont',
    file: 'Excalifont-Regular.woff2',
    weight: 400,
    checkFont: '20px "Excalifont"',
    checkText: 'm',
  },
  ...splitFamily('XiaolaiSC'),
  {
    family: 'ComicShanns',
    file: 'ComicShanns-Regular.woff2',
    weight: 400,
    checkFont: '20px "ComicShanns"',
    checkText: 'm',
  },
  ...splitFamily('NotoSansSC'),
  ...splitFamily('ZCOOLXiaoWei'),
  ...splitFamily('ZCOOLQingKeHuangYou'),
  {
    family: 'JetBrainsMono',
    file: 'jetbrains-mono-latin-400.woff2',
    weight: 400,
    checkFont: '20px "JetBrainsMono"',
    checkText: 'm',
  },
  {
    family: 'JetBrainsMono',
    file: 'jetbrains-mono-latin-500.woff2',
    weight: 500,
    checkFont: '500 20px "JetBrainsMono"',
    checkText: 'm',
  },
]

/** 单文件抓取超时：HTTP 缓存命中是毫秒级，25s 只兜冷缓存+慢网络 */
const FETCH_TIMEOUT_MS = 25000

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('字体数据读取失败'))
    reader.readAsDataURL(blob)
  })
}

async function fetchFontDataUrl(url: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'force-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await blobToDataUrl(await res.blob())
  } finally {
    clearTimeout(timer)
  }
}

/** 主站失败时走静态镜像重试一次（镜像未配置则直接抛原错误）；
    返回数据来源（主站/镜像）供详细日志记录 */
async function fetchFontWithMirror(url: string): Promise<{ dataUrl: string; via: string }> {
  try {
    return { dataUrl: await fetchFontDataUrl(url), via: '主站' }
  } catch (err) {
    const mirror = (
      (window as unknown as { __CF_MIRROR_ORIGIN__?: string }).__CF_MIRROR_ORIGIN__ ?? ''
    ).replace(/\/+$/, '')
    if (!mirror) throw err
    console.warn(`[导出] 字体分片主站抓取失败，走镜像重试：${url}（${err instanceof Error ? err.message : String(err)}）`)
    return { dataUrl: await fetchFontDataUrl(`${mirror}${url}`), via: '镜像' }
  }
}

/**
 * 导出前确保画布字体已加载，否则 SVG/位图里会渲染成兜底字体。
 * 注意：不要 await document.fonts.ready——它会等文档里所有挂起的字体
 * （包括未使用、还在懒加载的），永远等不完。只显式 load 画布
 * 实际用到的家族即可；会话内第一次等过后，后续只做极短兜底确认。
 * （v1.42.4 从 exportImage 移到本模块：闲时预热与导出共用同一路径，
 *   保证预热产出的字体覆盖集与导出时一致）
 */
let fontsSettled = false
export async function ensureCanvasFontsLoaded(): Promise<void> {
  const cap = fontsSettled ? 400 : 2500
  // 逐家族记录加载结果：慢网络下部分家族超预算时，日志能看出是哪几个没就绪
  const FAMILIES: [string, string][] = [
    ['20px "MaShanZheng"', '蹭饭图'],
    ['20px "Excalifont"', 'map'],
    ['20px "XiaolaiSC"', '北京'],
    ['20px "ComicShanns"', 'map'],
    ['700 20px "AlimamaShuHeiTi"', '2026'],
    ['20px "NotoSansSC"', '北京'],
    ['20px "ZCOOLXiaoWei"', '北京'],
    ['20px "ZCOOLQingKeHuangYou"', '北京'],
    ['20px "JetBrainsMono"', 'map'],
  ]
  let done = false
  try {
    await Promise.race([
      (async () => {
        const results = await Promise.allSettled(
          FAMILIES.map(([font, text]) => document.fonts.load(font, text)),
        )
        done = true
        const failed = results
          .map((r, i) => (r.status === 'rejected' ? FAMILIES[i][0] : null))
          .filter(Boolean)
        if (failed.length > 0) {
          console.warn(`[导出] 部分画布字体加载失败（导出将用回退字体）：${failed.join('、')}`)
        }
      })(),
      new Promise((resolve) => setTimeout(resolve, cap)),
    ])
    if (!done) {
      console.warn(
        `[导出] 画布字体加载超出预算（${cap}ms）仍未就绪——网络较慢，按当前已加载字体继续（与屏幕所见一致使用回退字体）`,
      )
    }
    fontsSettled = true
  } catch {
    // 字体加载失败不阻断导出，按兜底字体出图
    fontsSettled = true
  }
}

/**
 * 构建字体嵌入 CSS。永不 reject：任何文件失败都只跳过并告警，
 * 全失败时返回空串（html-to-image 收到空串同样跳过自己的字体抓取，
 * 导出以回退字体完成）。
 */
export async function buildFontEmbedCSS(): Promise<string> {
  const t = performance.now()
  try {
    // 只嵌实际用到的分片：浏览器按需加载 unicode-range 分片，
    // check 通过 = 画面在用该分片（离屏克隆与屏幕画布同文同字体）
    const used = FONT_FILES.filter((def) => {
      try {
        return document.fonts.check(def.checkFont, def.checkText)
      } catch {
        return false
      }
    })
    // 分片判定明细（详细轨）：排查「导出字体不对/嵌入体积异常」时看这一行
    console.info(
      `[导出] 字体分片判定：待嵌 ${used.length} 个（${used.map((d) => d.file).join('、') || '无'}）；` +
        `未使用跳过 ${FONT_FILES.length - used.length} 个`,
    )
    const okFiles: string[] = []
    const results = await Promise.all(
      used.map(async (def) => {
        const t1 = performance.now()
        try {
          const { dataUrl, via } = await fetchFontWithMirror(`/fonts/${def.file}`)
          console.info(
            `[导出] 字体分片就绪：${def.file}（${Math.round(performance.now() - t1)}ms，${via}）`,
          )
          okFiles.push(def.file)
          const range = def.range ? `unicode-range:${def.range};` : ''
          return `@font-face{font-family:'${def.family}';font-style:normal;font-weight:${def.weight};${range}src:${`url("${dataUrl}")`} format('woff2');}`
        } catch (err) {
          console.warn(
            `[导出] 字体分片嵌入失败已跳过：${def.family}（${def.file}，耗时 ${Math.round(performance.now() - t1)}ms），` +
              `该部分文字将以回退字体导出。原因：${err instanceof Error ? err.message : String(err)}`,
          )
          return ''
        }
      }),
    )
    // 用户上传的自定义字体：FontFace API 注册、不在样式表里，html-to-image 从来
    // 嵌不进去（自定义字体导出曾静默变回退字体）；dataURL 直接内嵌，零请求
    const customIds: string[] = []
    for (const font of getExportCustomFonts()) {
      results.push(
        `@font-face{font-family:'${customFontFamilyName(font)}';src:url("${font.dataUrl}");}`,
      )
      customIds.push(`c:${font.id}`)
    }
    // 覆盖标记（v1.42.4）：记录本份 CSS 实际嵌入了哪些分片/自定义字体——
    // 闲时预热的缓存可能被后续字体变更甩在身后，导出前用
    // fontEmbedCssCoversNow() 对照标记与当前需求，不一致就重建
    const marker = `${MARK_PREFIX}${[...okFiles, ...customIds].join(',')} */`
    const css = `${marker}\n${results.filter(Boolean).join('\n')}`
    const ok = results.filter(Boolean).length
    console.info(
      `[导出] 字体嵌入构建完成（${Math.round(css.length / 1024)}KB，${ok}/${used.length} 个分片` +
        `${customIds.length > 0 ? `，含 ${customIds.length} 个自定义字体` : ''}` +
        `，+${Math.round(performance.now() - t)}ms）`,
    )
    return css
  } catch (err) {
    console.warn(
      `[导出] 字体嵌入构建异常，按回退字体继续导出：${err instanceof Error ? err.message : String(err)}`,
    )
    return ''
  }
}

/** 覆盖标记前缀：CSS 首行注释里记录已嵌入的分片文件名与自定义字体 id */
const MARK_PREFIX = '/* cf-fonts:v1:'

/**
 * 校验缓存的字体嵌入 CSS 是否仍覆盖当前画布所需：
 * 逐个对照「现在通过 document.fonts.check 的分片 / 已注册的自定义字体」
 * 与 CSS 首行标记——任一缺失即视为不覆盖（预热后字体有变化 / 预热时
 * 网络慢导致分片缺失），调用方应丢弃缓存重新构建。
 */
export function fontEmbedCssCoversNow(css: string): boolean {
  if (!css.startsWith(MARK_PREFIX)) return false
  const end = css.indexOf(' */')
  if (end < 0) return false
  const marked = new Set(css.slice(MARK_PREFIX.length, end).split(',').filter(Boolean))
  for (const def of FONT_FILES) {
    let on = false
    try {
      on = document.fonts.check(def.checkFont, def.checkText)
    } catch {
      on = false
    }
    if (on && !marked.has(def.file)) return false
  }
  for (const font of getExportCustomFonts()) {
    if (!marked.has(`c:${font.id}`)) return false
  }
  return true
}
