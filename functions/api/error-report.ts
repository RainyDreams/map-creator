/**
 * JavaScript 错误自动反馈接口：
 *
 *   POST /api/error-report   body: { kind, message, stack?, page, version, ua, line?, col? }
 *                            → 聚合写入 KV（err:sig:<hash>），同签名错误只累加次数
 *
 * 防护设计（防 DDoS / 防数据库冲撞）：
 * 1. 同源校验：Origin/Referer 存在时必须指向本站域名（跨域脚本直接 403）；
 * 2. 体积闸门：Content-Length 预检 + 实际读取双重 ≤ 8KB；字段逐项截断；
 * 3. 限流（isolate 内存，0 KV 写入）：全局 150/min + 单 IP 5/min；
 * 4. 签名聚合：相同（kind+message+堆栈首帧+版本）只存一条记录、累加 count——
 *    同一代码错误的刷屏不会产生新 key，RMW 偶发丢计数可接受；
 * 5. 新签名日配额：每天最多新建 200 个签名（防止随机 message 撑爆 key 空间），
 *    配额用完后未知签名丢弃但已知签名照常累加；
 * 6. 所有记录 30 天 TTL 自动过期，存储量有界。
 *
 * 隐私说明：记录只含错误技术信息（消息/堆栈/页面路径/UA/版本），
 * 不含名单等任何用户数据；IP 仅用于内存限流计数（不持久化），不写入错误记录。
 */

import { rateLimitOk, clientIp } from '../_lib/ratelimit'

interface Env {
  cenfan_share?: KVNamespace
}

/** 单条请求体积上限（字节） */
const MAX_BODY_BYTES = 8192
/** 每分钟全局限额 */
const GLOBAL_PER_MIN = 150
/** 每分钟单 IP 限额 */
const IP_PER_MIN = 5
/** 每日新建签名限额 */
const NEW_SIG_PER_DAY = 200
/** 错误记录保留 30 天（秒） */
const RECORD_TTL = 30 * 24 * 60 * 60

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

/** 本站允许的 Origin 主机名（与 main.tsx 域名白名单一致） */
function originAllowed(request: Request): boolean {
  const raw = request.headers.get('Origin') ?? request.headers.get('Referer')
  if (!raw) return true // 同源导航/sendBeacon 通常带 Origin；缺失时放行由限流兜底
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

/** 截断 + 去控制字符（防日志注入/控制符污染；逐字符过滤，不用正则转义） */
function sanitize(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return Array.from(v).filter((c) => { const n = c.codePointAt(0) ?? 32; return n >= 32 && n !== 127 }).join("").slice(0, max)
}

/** FNV-1a 32 位哈希（签名用，非加密） */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

interface ErrorRecord {
  kind: string
  message: string
  stack: string
  page: string
  version: string
  ua: string
  line: number
  col: number
  firstSeen: number
  lastSeen: number
  count: number
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

  const kind = sanitize(body.kind, 24)
  if (!['error', 'unhandledrejection', 'resource'].includes(kind)) {
    return json({ error: 'invalid_kind' }, 400)
  }
  const message = sanitize(body.message, 500)
  if (message === '') return json({ error: 'empty_message' }, 400)
  const stack = sanitize(body.stack, 2000)
  let page = sanitize(body.page, 120)
  if (!page.startsWith('/')) page = '/'
  const version = sanitize(body.version, 20)
  const ua = sanitize(body.ua, 200)
  const toInt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)
  const line = toInt(body.line)
  const col = toInt(body.col)

  const kv = env.cenfan_share
  const now = Date.now()
  const dayBucket = new Date(now).toISOString().slice(0, 10)

  try {
    // 内存限流（0 KV 写入）：全局 + 单 IP
    if (!rateLimitOk('err:global', GLOBAL_PER_MIN)) return json({ error: 'rate_limited' }, 429)
    if (!rateLimitOk(`err:${clientIp(request)}`, IP_PER_MIN)) return json({ error: 'rate_limited' }, 429)

    // 签名聚合：同类错误只存一条
    const stackTop = stack.split('\n').find((l) => l.trim() !== '') ?? ''
    const sig = fnv1a(`${kind}|${message}|${stackTop}|${version}`)
    const key = `err:sig:${sig}`
    const existing = await kv.get(key)
    if (existing !== null) {
      const rec = JSON.parse(existing) as ErrorRecord
      rec.count += 1
      rec.lastSeen = now
      // 新版本的同签名错误刷新版本号（旧版本错误随 TTL 自然消失）
      rec.version = version || rec.version
      rec.page = page || rec.page
      await kv.put(key, JSON.stringify(rec), { expirationTtl: RECORD_TTL })
      return json({ ok: true, deduped: true, count: rec.count })
    }

    // 新签名日配额（防随机 message 撑爆 key 空间；内存计数，0 KV 写入）
    if (!rateLimitOk(`err:cap:${dayBucket}`, NEW_SIG_PER_DAY, 24 * 60 * 60 * 1000)) {
      return json({ ok: true, throttled: 'sig_cap' })
    }

    const rec: ErrorRecord = {
      kind,
      message,
      stack,
      page,
      version,
      ua,
      line,
      col,
      firstSeen: now,
      lastSeen: now,
      count: 1,
    }
    await kv.put(key, JSON.stringify(rec), { expirationTtl: RECORD_TTL })
    return json({ ok: true, deduped: false })
  } catch {
    return json({ error: 'storage_failed' }, 503)
  }
}

export const onRequestGet: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
export const onRequestPut: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
export const onRequestDelete: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
