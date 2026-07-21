/**
 * GET /api/wechat/signature?url=<encodeURIComponent(当前页URL，不含 # 及之后部分)>
 *
 * 微信 JS-SDK 签名接口（算法见微信官方文档「JS-SDK 使用权限签名算法 · 附录1」）：
 *   1. 用 env.WECHAT_APPID / WECHAT_SECRET 调用 cgi-bin/token 换取 access_token（有效期 7200s）；
 *   2. 用 access_token 调用 cgi-bin/ticket/getticket?type=jsapi 换取 jsapi_ticket（有效期 7200s）；
 *   3. 将 jsapi_ticket、noncestr、timestamp、url 四个参数按 key 字典序 ASCII 升序拼成
 *      key1=value1&key2=value2...（值为原始值，不做 URL 编码），对该字符串做 SHA-1 得签名；
 *   4. 返回 { appId, timestamp, nonceStr, signature }，前端用于 wx.config。
 *
 * 缓存说明：access_token 与 jsapi_ticket 缓存在模块级全局变量中。Cloudflare Pages Functions
 * 的模块在单个 isolate 内是单例，因此同一 isolate 内可复用缓存；但缓存不跨 isolate 共享，
 * 冷启动或扩缩容时会重新向上游换取——换取接口有每日调用额度，此实现在流量规模较小时足够。
 *
 * 未配置 secret 时返回 503 JSON { "error": "wechat_not_configured" }，前端据此静默降级，
 * 不产生任何报错。
 */

interface Env {
  WECHAT_APPID?: string
  WECHAT_SECRET?: string
}

interface CacheEntry {
  value: string
  /** 过期时间戳（毫秒），预留 300s 安全余量 */
  expiresAt: number
}

let cachedAccessToken: CacheEntry | null = null
let cachedJsapiTicket: CacheEntry | null = null

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token'
const TICKET_URL = 'https://api.weixin.qq.com/cgi-bin/ticket/getticket'
/** 微信返回的有效期（秒），缓存时预留 300s 安全余量 */
const SAFETY_MARGIN_MS = 300_000

async function fetchAccessToken(appid: string, secret: string): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.value
  }
  const url = `${TOKEN_URL}?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`token http ${res.status}`)
  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
  }
  if (!data.access_token || !data.expires_in) {
    throw new Error(`token errcode ${data.errcode ?? 'unknown'}: ${data.errmsg ?? ''}`)
  }
  cachedAccessToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - SAFETY_MARGIN_MS,
  }
  return data.access_token
}

async function fetchJsapiTicket(accessToken: string): Promise<string> {
  if (cachedJsapiTicket && cachedJsapiTicket.expiresAt > Date.now()) {
    return cachedJsapiTicket.value
  }
  const url = `${TICKET_URL}?access_token=${encodeURIComponent(accessToken)}&type=jsapi`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ticket http ${res.status}`)
  const data = (await res.json()) as {
    ticket?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
  }
  // 微信约定 errcode 为 0 表示成功
  if (data.errcode !== 0 || !data.ticket || !data.expires_in) {
    throw new Error(`ticket errcode ${data.errcode ?? 'unknown'}: ${data.errmsg ?? ''}`)
  }
  cachedJsapiTicket = {
    value: data.ticket,
    expiresAt: Date.now() + data.expires_in * 1000 - SAFETY_MARGIN_MS,
  }
  return data.ticket
}

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const onRequestGet = async ({
  request,
  env,
}: {
  request: Request
  env: Env
}): Promise<Response> => {
  const appid = env.WECHAT_APPID
  const secret = env.WECHAT_SECRET
  if (!appid || !secret) {
    return Response.json({ error: 'wechat_not_configured' }, { status: 503 })
  }

  // 参与签名的 url 必须是调用 JS-SDK 页面的完整 URL（不含 # 及其后部分），前端负责编码传入
  const pageUrl = new URL(request.url).searchParams.get('url')
  if (!pageUrl || !/^https?:\/\//.test(pageUrl)) {
    return Response.json(
      { error: '缺少或非法的必填查询参数 url（需为编码后的完整页面 URL，不含 #）' },
      { status: 400 },
    )
  }

  try {
    const accessToken = await fetchAccessToken(appid, secret)
    const ticket = await fetchJsapiTicket(accessToken)
    const timestamp = Math.floor(Date.now() / 1000)
    const nonceStr = crypto.randomUUID().replace(/-/g, '')
    // 附录1：参数按 key 字典序（jsapi_ticket < noncestr < timestamp < url）拼接，sha1
    const string1 = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${pageUrl}`
    const signature = await sha1Hex(string1)

    return Response.json(
      { appId: appid, timestamp, nonceStr, signature },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    // 上游换取失败：不向前端泄露细节，前端静默降级
    return Response.json({ error: 'wechat_upstream_error' }, { status: 502 })
  }
}
