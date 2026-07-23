/**
 * hash 分享链接（纯前端，不经过服务器）：
 * 把画布 JSON（剥离图片二进制后）deflate 压缩 + base64url 编码进 URL 的查询参数，
 * 形如 https://map.linkbrain.top/?import=<payload>。
 *
 * - 用 `?import=` 而非 `#import=`：微信等环境对超长 hash 链接偶发不加载/截断，
 *   查询参数兼容性更好（v1.14 起切换，读取端仍兼容旧 hash 链接）；
 * - 数据随链接传输但不落服务端存储，天然不经服务端审核；
 * - 打开链接的一端先在本地解码出 JSON 预览页，主选项「加载到我的新画布」，
 *   次选项「仅下载 JSON」（不显眼）；
 * - 链接长度受浏览器/微信限制（实测数千字符内稳定），超出时提示改用 JSON 文件分享；
 * - 图片类内容（毛笔字 / 自定义校徽 / 班徽）不随链接传输，弹窗中会明确告知。
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import type { MapData } from '@/types'
import { stripBinary } from '@/utils/share'

export interface ShareLinkPayload {
  name?: unknown
  data?: unknown
  theme?: unknown
  fontSlots?: unknown
  /** 生成时刻（毫秒时间戳）：链接有效期 1 天 */
  ts?: number
  /** 读取端标记：链接已超过有效期（此时不携带画布数据） */
  expired?: boolean
}

/** 分享链接有效期：1 天（24 小时）。过期后打开链接会看到过期提示，无法再导入 */
export const SHARE_LINK_TTL_MS = 24 * 60 * 60 * 1000

/** 超过该长度判定为过长（微信/部分浏览器对超长 URL 处理不稳定） */
const MAX_URL_CHARS = 7000

function u8ToBase64Url(u8: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode(...u8.subarray(i, i + CHUNK))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToU8(s: string): Uint8Array {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4 !== 0) b64 += '='
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8
}

/** 生成分享链接（?import= 格式）；tooLarge = 链接过长，建议改用导出 JSON 文件 */
export function buildShareUrl(canvas: {
  name: string
  data: MapData
  theme: unknown
  fontSlots: unknown
  badge: string | null
}): { url: string; stripped: string[]; tooLarge: boolean } {
  const stripped: string[] = []
  const data = stripBinary(canvas.data, canvas.badge, stripped)
  const payload = {
    f: 'cenfan-map-link',
    v: 1,
    ts: Date.now(),
    name: canvas.name,
    data,
    theme: canvas.theme,
    fontSlots: canvas.fontSlots,
  }
  const packed = u8ToBase64Url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }))
  const url = `${window.location.origin}${window.location.pathname}?import=${packed}`
  return { url, stripped, tooLarge: url.length > MAX_URL_CHARS }
}

/** 从地址栏取出分享画布数据并清理 URL；兼容新版 ?import= 与旧版 #import= 两种格式 */
export function takeSharePayloadFromHash(): ShareLinkPayload | null {
  try {
    let packed: string | null = null
    const q = new URLSearchParams(window.location.search).get('import')
    if (q !== null && q !== '') packed = q
    if (packed === null) {
      const m = window.location.hash.match(/#import=([A-Za-z0-9\-_]+)/)
      if (m && m[1]) packed = m[1]
    }
    if (packed === null) return null
    // 清掉参数：避免刷新重复弹出导入页，也避免用户把带数据的地址误转发
    window.history.replaceState(null, '', window.location.pathname)
    const json = strFromU8(inflateSync(base64UrlToU8(packed)))
    const parsed = JSON.parse(json) as ShareLinkPayload & { f?: string }
    if (parsed.f !== 'cenfan-map-link') return null
    // 有效期 1 天：过期链接返回过期标记（不携带数据），由落地页展示过期提示
    const ts = typeof parsed.ts === 'number' ? parsed.ts : 0
    if (ts === 0 || Date.now() - ts > SHARE_LINK_TTL_MS) {
      return { expired: true }
    }
    return parsed
  } catch (err) {
    console.error('分享链接解析失败', err)
    return null
  }
}
