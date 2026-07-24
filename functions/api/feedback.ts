/**
 * 问题反馈接口（公开反馈板）：
 *
 *   GET  /api/feedback            → { items: FeedbackItem[] }（最新 50 条，公开）
 *   POST /api/feedback            body: { name, kind, content } → 提交一条反馈
 *
 * 防护设计（防 DDoS / 防存储冲撞）：
 * 1. 同源校验：Origin/Referer 存在时必须指向本站域名（跨域脚本直接 403）；
 * 2. 体积闸门：Content-Length 预检 + 实际读取双重 ≤ 8KB；
 * 3. 限流：POST 全局 150/min + 单 IP 5/min；GET 全局 600/min + 单 IP 60/min
 *    （cf-connecting-ip，bucket key TTL 130 秒，不沉淀垃圾数据）；
 * 4. 内容防护：控制字符过滤、逐项长度截断、kind 白名单（bug/suggestion/experience）、
 *    用户名格式校验（「用户」+ 4~10 位数字，不符则由服务端重新生成）；
 * 5. 读放大防护：列表结果在 KV 内缓存 60 秒（KV TTL 下限），写入后即时失效；
 * 6. 存储有界：记录 90 天 TTL 自动过期；key 设计 fb:r:<倒序时间戳>:<随机>，
 *    list 字典序即时间倒序，无需额外索引。
 *
 * 隐私说明：反馈内容会公开展示，请勿写入姓名、联系方式等个人信息；
 * IP 地址仅用于限流计数（130 秒后消失），不写入反馈记录。
 */

interface Env {
  cenfan_share?: KVNamespace
}

/** 单条请求体积上限（字节） */
const MAX_BODY_BYTES = 8192
/** POST 限流 */
const POST_GLOBAL_PER_MIN = 150
const POST_IP_PER_MIN = 5
/** GET 限流（宽松，防抓取刷接口） */
const GET_GLOBAL_PER_MIN = 600
const GET_IP_PER_MIN = 60
/** 反馈正文上限（字符） */
const MAX_CONTENT_CHARS = 1000
/** 列表返回条数上限 */
const LIST_LIMIT = 50
/** 列表缓存（秒；KV TTL 下限为 60） */
const LIST_CACHE_TTL = 60
/** 反馈记录保留 90 天（秒） */
const RECORD_TTL = 90 * 24 * 60 * 60
/** 时间戳倒序基数（13 位，够用至 2286 年） */
const TS_CEILING = 9999999999999

const LIST_CACHE_KEY = 'fb:list:v1'
const KINDS = ['bug', 'suggestion', 'experience'] as const
type FeedbackKind = (typeof KINDS)[number]

interface FeedbackItem {
  id: string
  name: string
  kind: FeedbackKind
  content: string
  ts: number
}

function json(data: unknown, status = 200, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store',
    },
  })
}

/** 本站允许的 Origin 主机名（与 error-report.ts 保持一致） */
function originAllowed(request: Request): boolean {
  const raw = request.headers.get('Origin') ?? request.headers.get('Referer')
  if (!raw) return true
  try {
    const h = new URL(raw).hostname
    return (
      h === 'map.linkbrain.top' ||
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h.slice(-22) === '.cengfan-map.pages.dev'
    )
  } catch {
    return false
  }
}

/** 截断 + 去控制字符（保留换行；逐字符过滤，不用正则转义） */
function sanitize(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return Array.from(v)
    .filter((c) => {
      const n = c.codePointAt(0) ?? 32
      return n === 10 || (n >= 32 && n !== 127)
    })
    .join('')
    .slice(0, max)
    .trim()
}

/** 用户名校验：「用户」+ 4~10 位数字（逐字符判断，不用正则） */
function nameValid(v: string): boolean {
  if (!v.startsWith('用户')) return false
  const rest = v.slice(2)
  if (rest.length < 4 || rest.length > 10) return false
  for (const c of rest) {
    const n = c.codePointAt(0) ?? 0
    if (n < 48 || n > 57) return false
  }
  return true
}

/** 服务端兜底用户名：用户 + 7 位数字 */
function randomName(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return `用户${1000000 + (buf[0] % 9000000)}`
}

function randomId(): string {
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 限流计数：bucket key 自增，返回当前计数（key TTL 130 秒，过期自动清零） */
async function hit(kv: KVNamespace, key: string): Promise<number> {
  const cur = await kv.get(key)
  const n = cur === null ? 0 : Number(cur) || 0
  await kv.put(key, String(n + 1), { expirationTtl: 130 })
  return n + 1
}

/** 限流检查：返回 null 放行，否则 429 响应 */
async function rateLimit(
  kv: KVNamespace,
  request: Request,
  scope: 'g' | 'p',
  globalMax: number,
  ipMax: number,
): Promise<Response | null> {
  const minBucket = Math.floor(Date.now() / 60000)
  const g = await hit(kv, `fb:rl:${scope}:g:${minBucket}`)
  if (g > globalMax) return json({ error: 'rate_limited' }, 429)
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const n = await hit(kv, `fb:rl:${scope}:ip:${ip}:${minBucket}`)
  if (n > ipMax) return json({ error: 'rate_limited' }, 429)
  return null
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.cenfan_share) return json({ error: 'not_configured' }, 503)
  if (!originAllowed(request)) return json({ error: 'forbidden_origin' }, 403)
  const kv = env.cenfan_share

  try {
    const blocked = await rateLimit(kv, request, 'g', GET_GLOBAL_PER_MIN, GET_IP_PER_MIN)
    if (blocked) return blocked

    // 列表缓存：命中直接返回（45 秒内的新提交延迟可见，可接受）
    const cached = await kv.get(LIST_CACHE_KEY)
    if (cached !== null) {
      return new Response(cached, {
        status: 200,
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          'Cache-Control': 'public, max-age=20',
        },
      })
    }

    // key 字典序 = 时间倒序（revTs 越小越新）
    const listed = await kv.list({ prefix: 'fb:r:', limit: LIST_LIMIT })
    const values = await Promise.all(listed.keys.map((k) => kv.get(k.name)))
    const items: FeedbackItem[] = []
    for (let i = 0; i < values.length; i++) {
      const raw = values[i]
      if (raw === null) continue
      try {
        const rec = JSON.parse(raw) as Omit<FeedbackItem, 'id'>
        items.push({
          id: listed.keys[i].name.slice(5),
          name: rec.name,
          kind: rec.kind,
          content: rec.content,
          ts: rec.ts,
        })
      } catch {
        // 单条损坏不影响整体列表
      }
    }

    const payload = JSON.stringify({ items })
    await kv.put(LIST_CACHE_KEY, payload, { expirationTtl: LIST_CACHE_TTL })
    return new Response(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Cache-Control': 'public, max-age=20',
      },
    })
  } catch {
    return json({ error: 'storage_failed' }, 503)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.cenfan_share) return json({ error: 'not_configured' }, 503)
  if (!originAllowed(request)) return json({ error: 'forbidden_origin' }, 403)

  // 体积闸门：头预检 + 实读双保险
  const declared = Number(request.headers.get('Content-Length') ?? '0')
  if (declared > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)
  let text: string
  try {
    text = await request.text()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  if (text.length === 0) return json({ error: 'empty_body' }, 400)
  if (text.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)

  let body: Record<string, unknown>
  try {
    body = JSON.parse(text) as Record<string, unknown>
    if (!body || typeof body !== 'object') return json({ error: 'invalid_payload' }, 400)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const content = sanitize(body.content, MAX_CONTENT_CHARS)
  if (content === '') return json({ error: 'empty_content' }, 400)
  const kindRaw = sanitize(body.kind, 20)
  const kind: FeedbackKind = (KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as FeedbackKind)
    : 'suggestion'
  let name = sanitize(body.name, 30)
  if (!nameValid(name)) name = randomName()

  const kv = env.cenfan_share
  try {
    const blocked = await rateLimit(kv, request, 'p', POST_GLOBAL_PER_MIN, POST_IP_PER_MIN)
    if (blocked) return blocked

    const now = Date.now()
    const revTs = String(TS_CEILING - now).padStart(13, '0')
    const id = `${revTs}:${randomId()}`
    const rec = { name, kind, content, ts: now }
    await kv.put(`fb:r:${id}`, JSON.stringify(rec), { expirationTtl: RECORD_TTL })
    // 列表缓存即时失效（尽力而为，失败则等 TTL 自然过期）
    try {
      await kv.delete(LIST_CACHE_KEY)
    } catch {
      // 忽略
    }
    return json({ ok: true, item: { id, ...rec } })
  } catch {
    return json({ error: 'storage_failed' }, 503)
  }
}

export const onRequestPut: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
export const onRequestDelete: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
