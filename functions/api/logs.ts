/**
 * 会话日志上传接口（配合「问题反馈」使用）—— D1 版：
 *
 *   POST /api/logs   body: { entries: [{t, level, text}], meta?: {version?, ua?, page?} }
 *                    → { ok, id }（id 可随反馈一同提交，供管理员定位问题）
 *
 * 日志语义：仅用户主动在反馈表单勾选「附带本次会话日志」时上传；
 * 内容为用户浏览器当次会话的控制台记录（内存环形缓冲，刷新即清空），
 * 不含名单数据本身（除非代码把名单打进了控制台）。
 *
 * 存储：D1（logs 表）。原 KV 版在免费额度下每日写限额极易被烧穿
 * （2026-07-25 线上事故：put() limit exceeded，用户日志全部写入失败），
 * D1 免费额度 10 万行写/天，对这个量级绰绰有余。
 * 记录保留 2 天：低频写路径顺带 DELETE 过期行（0 额外请求）。
 *
 * 防护设计：
 * 1. 同源校验（Origin/Referer 白名单）；
 * 2. 体积闸门：请求体 ≤ 64KB；条数 ≤ 300；单条文本 ≤ 500 字符；
 * 3. 限流（isolate 内存，0 KV 写入）：全局 60/min + 单 IP 3/min；
 * 4. 只写不读：本接口不提供 GET，日志读取只能经由管理端（另一个项目、独立鉴权）。
 *
 * 隐私说明：IP 仅用于内存限流计数（不持久化），不写入日志记录。
 */

import { rateLimitOk, clientIp } from '../_lib/ratelimit'

interface Env {
  cenfan_db?: D1Database
}

const MAX_BODY_BYTES = 65536
const MAX_ENTRIES = 300
const MAX_TEXT = 500
const GLOBAL_PER_MIN = 60
const IP_PER_MIN = 3
/** 日志保留 2 天（毫秒） */
const RECORD_MAX_AGE = 2 * 24 * 60 * 60 * 1000
const TS_CEILING = 9999999999999

const LEVELS = ['log', 'info', 'warn', 'error'] as const

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

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

/** 截断 + 去控制字符（逐字符过滤，不用正则转义） */
function sanitize(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return Array.from(v)
    .filter((c) => {
      const n = c.codePointAt(0) ?? 32
      return n === 10 || (n >= 32 && n !== 127)
    })
    .join('')
    .slice(0, max)
}

function idCharsOk(v: string): boolean {
  for (const c of v) {
    const n = c.codePointAt(0) ?? 0
    const ok = (n >= 48 && n <= 57) || (n >= 97 && n <= 122) || c === ':'
    if (!ok) return false
  }
  return true
}

function randomId(): string {
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

interface LogEntry {
  t: number
  level: string
  text: string
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.cenfan_db) return json({ error: 'not_configured' }, 503)
  if (!originAllowed(request)) return json({ error: 'forbidden_origin' }, 403)

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

  if (!Array.isArray(body.entries)) return json({ error: 'invalid_entries' }, 400)
  const entries: LogEntry[] = []
  for (const raw of body.entries.slice(0, MAX_ENTRIES)) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    const level = sanitize(e.level, 8)
    const t = typeof e.t === 'number' && Number.isFinite(e.t) ? Math.round(e.t) : 0
    const entryText = sanitize(e.text, MAX_TEXT)
    if (entryText === '') continue
    entries.push({
      t,
      level: (LEVELS as readonly string[]).includes(level) ? level : 'log',
      text: entryText,
    })
  }
  if (entries.length === 0) return json({ error: 'empty_log' }, 400)

  const meta = (body.meta ?? {}) as Record<string, unknown>
  const rec = {
    ts: Date.now(),
    version: sanitize(meta.version, 20),
    ua: sanitize(meta.ua, 200),
    page: sanitize(meta.page, 120),
    viewport: sanitize(meta.viewport, 30),
    lang: sanitize(meta.lang, 20),
    net: sanitize(meta.net, 20),
    // Microsoft Clarity 标识：管理员据此在 Clarity 后台定位该用户的会话录屏
    clarityUser: sanitize(meta.clarityUser, 40),
    claritySession: sanitize(meta.claritySession, 40),
    count: entries.length,
    entries,
  }

  const db = env.cenfan_db
  try {
    if (!rateLimitOk('log:global', GLOBAL_PER_MIN)) return json({ error: 'rate_limited' }, 429)
    if (!rateLimitOk(`log:${clientIp(request)}`, IP_PER_MIN)) return json({ error: 'rate_limited' }, 429)

    const revTs = String(TS_CEILING - rec.ts).padStart(13, '0')
    const id = `${revTs}:${randomId()}`
    if (!idCharsOk(id)) return json({ error: 'id_failed' }, 500)
    // 低频写路径顺带清理 2 天前的过期日志（存储有界，0 额外请求）
    await db.prepare('DELETE FROM logs WHERE ts < ?').bind(rec.ts - RECORD_MAX_AGE).run()
    await db.prepare('INSERT INTO logs (id, ts, data) VALUES (?, ?, ?)').bind(id, rec.ts, JSON.stringify(rec)).run()
    return json({ ok: true, id })
  } catch {
    return json({ error: 'storage_failed' }, 503)
  }
}

export const onRequestGet: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
export const onRequestPut: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
export const onRequestDelete: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
