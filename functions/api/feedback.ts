/**
 * 问题反馈接口（公开反馈板）—— D1 版：
 *
 *   GET  /api/feedback            → { items: FeedbackItem[] }（最新 50 条，公开；不含 logId）
 *   POST /api/feedback            body: { name, kind, content, logId? } → 提交一条反馈
 *
 * 存储：D1（feedback 表）。反馈是「写多查多 + 需要管理端标记/删除」的结构化数据，
 * 放 KV 每次列表都要 list + 逐条 get，太烧额度；D1 一次 SQL 解决。
 *
 * 防护设计（防 DDoS / 防滥用）：
 * 1. 同源校验：Origin/Referer 存在时必须指向本站域名；
 * 2. 体积闸门：Content-Length 预检 + 实际读取双重 ≤ 8KB；
 * 3. 限流（isolate 内存，0 KV 写入）：POST 全局 150/min + 单 IP 5/min；GET 全局 600/min + 单 IP 60/min；
 * 4. 内容防护：控制字符过滤、逐项长度截断、kind 白名单（bug/suggestion/experience）、
 *    用户名格式校验（「用户」+ 4~10 位数字，不符则由服务端重新生成）、logId 格式校验；
 * 5. 存储有界：每次写入时顺带删除 90 天前的旧记录（低频写路径顺带清理，0 额外请求）。
 *
 * 隐私说明：反馈内容会公开展示，请勿写入姓名、联系方式等个人信息；
 * IP 地址仅用于内存限流计数（不持久化），不写入反馈记录。
 */

import { rateLimitOk, clientIp } from '../_lib/ratelimit'

interface Env {
  cenfan_db?: D1Database
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
/** 反馈保留 90 天（毫秒） */
const RECORD_MAX_AGE = 90 * 24 * 60 * 60 * 1000
/** 时间戳倒序基数（13 位；与旧 KV 数据 id 格式保持一致） */
const TS_CEILING = 9999999999999

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

/** 本站允许的 Origin 主机名 */
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

/** 日志 id 字符校验（小写字母/数字/冒号；逐字符判断） */
function logIdOk(v: string): boolean {
  if (v.length < 8) return false
  for (const c of v) {
    const n = c.codePointAt(0) ?? 0
    const ok = (n >= 48 && n <= 57) || (n >= 97 && n <= 122) || c === ':'
    if (!ok) return false
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.cenfan_db) return json({ error: 'not_configured' }, 503)
  if (!originAllowed(request)) return json({ error: 'forbidden_origin' }, 403)
  if (!rateLimitOk('fb:g:global', GET_GLOBAL_PER_MIN)) return json({ error: 'rate_limited' }, 429)
  if (!rateLimitOk(`fb:g:${clientIp(request)}`, GET_IP_PER_MIN)) return json({ error: 'rate_limited' }, 429)

  try {
    // 公开列表：不返回 logId（日志只供管理端查看）
    const r = await env.cenfan_db
      .prepare('SELECT id, name, kind, content, ts FROM feedback ORDER BY ts DESC LIMIT ?')
      .bind(LIST_LIMIT)
      .all<FeedbackItem>()
    return json({ items: r.results ?? [] }, 200, 20)
  } catch {
    return json({ error: 'storage_failed' }, 503)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.cenfan_db) return json({ error: 'not_configured' }, 503)
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
  // 可选：随反馈附带的会话日志 id（/api/logs 返回；仅校验格式）
  let logId = sanitize(body.logId, 48)
  if (logId !== '' && !logIdOk(logId)) logId = ''

  if (!rateLimitOk('fb:p:global', POST_GLOBAL_PER_MIN)) return json({ error: 'rate_limited' }, 429)
  if (!rateLimitOk(`fb:p:${clientIp(request)}`, POST_IP_PER_MIN)) return json({ error: 'rate_limited' }, 429)

  const db = env.cenfan_db
  try {
    const now = Date.now()
    const revTs = String(TS_CEILING - now).padStart(13, '0')
    const id = `${revTs}:${randomId()}`
    // 低频写路径顺带清理 90 天前的旧记录（存储有界，0 额外请求）
    await db.prepare('DELETE FROM feedback WHERE ts < ?').bind(now - RECORD_MAX_AGE).run()
    await db
      .prepare('INSERT INTO feedback (id, name, kind, content, ts, logId, done) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .bind(id, name, kind, content, now, logId === '' ? null : logId)
      .run()
    return json({ ok: true, item: { id, name, kind, content, ts: now } })
  } catch {
    return json({ error: 'storage_failed' }, 503)
  }
}

export const onRequestPut: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
export const onRequestDelete: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
