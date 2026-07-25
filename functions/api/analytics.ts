/**
 * 匿名使用统计接口（为管理端「统计与分析」提供数据）—— D1 版：
 *
 *   POST /api/analytics   body: { name, v? }   name ∈ session / pv / export / feedback / log / share
 *                         → stats_daily 表按天 upsert 计数
 *
 * 设计原则：
 * - 只记「次数」，不记任何内容、路径参数、名单数据或身份标识；
 * - 前端仅在用户同意协议后发送；
 * - 防护：同源校验 + 2KB 体积闸门 + isolate 内存限流（全局 300/min + 单 IP 30/min，0 KV 写入）；
 * - 存储：D1 每天一行计数器（upsert 原子累加），数据量极小（每天至多 1 行）；
 * - IP 仅用于内存限流（不持久化），不写入任何统计记录。
 */

import { rateLimitOk, clientIp } from '../_lib/ratelimit'

interface Env {
  cenfan_db?: D1Database
}

const MAX_BODY_BYTES = 2048
const GLOBAL_PER_MIN = 300
const IP_PER_MIN = 30

const EVENTS = ['session', 'pv', 'export', 'feedback', 'log', 'share'] as const
type EventName = (typeof EVENTS)[number]
/** 事件名 → 列名（export 是保留字，列用 exports） */
const COLUMN: Record<EventName, string> = {
  session: 'session',
  pv: 'pv',
  export: 'exports',
  feedback: 'feedback',
  log: 'log',
  share: 'share',
}

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
  if (text.length === 0 || text.length > MAX_BODY_BYTES) return json({ error: 'bad_body' }, 400)

  let name = ''
  try {
    const body = JSON.parse(text) as Record<string, unknown>
    name = typeof body.name === 'string' ? body.name : ''
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!(EVENTS as readonly string[]).includes(name)) return json({ error: 'invalid_event' }, 400)

  if (!rateLimitOk('an:global', GLOBAL_PER_MIN)) return json({ error: 'rate_limited' }, 429)
  if (!rateLimitOk(`an:${clientIp(request)}`, IP_PER_MIN)) return json({ error: 'rate_limited' }, 429)

  const col = COLUMN[name as EventName]
  const day = new Date().toISOString().slice(0, 10)
  // 统计只保留最近 31 天（用户要求：几周~一个月，防止无限增长）
  const cutoff = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  try {
    // 低频写路径顺带清理 31 天前的旧行（0 额外请求）；原子累加（upsert）
    await env.cenfan_db.prepare('DELETE FROM stats_daily WHERE day < ?').bind(cutoff).run()
    await env.cenfan_db
      .prepare(
        `INSERT INTO stats_daily (day, ${col}) VALUES (?, 1)
         ON CONFLICT(day) DO UPDATE SET ${col} = ${col} + 1`,
      )
      .bind(day)
      .run()
    return json({ ok: true })
  } catch {
    return json({ error: 'storage_failed' }, 503)
  }
}

export const onRequestGet: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
export const onRequestPut: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
export const onRequestDelete: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
