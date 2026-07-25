/**
 * 作者追加回复接口（反馈对话流水）：
 *
 *   POST /api/feedback/reply   body: { id, key, text } → { ok, entry }
 *
 * 设计：
 * - 用户创建反馈时服务端生成一次性作者凭证 akey 并随响应返回（仅此一次），
 *   浏览器把它和反馈 id 一起存在本机（cenfan-my-feedback）；
 * - 追加回复必须带上 id + key，与服务端 akey 匹配才允许写入——
 *   公开反馈板的 id 人人可见，没有凭证就无法冒充作者；
 * - 追加内容写入 feedback.thread（JSON 对话流水），by='user'；
 * - 作者追问说明问题未解决：状态为 done/shelved/closed 时自动重开为 open，
 *   让管理端重新看到它；
 * - 追问不更新 reply/reply_ts（那是「最新管理员回复」快照，驱动页脚红点），
 *   所以用户自己的追问不会给自己触发红点。
 *
 * 防护：同源校验、体积闸门（4KB）、限流（全局 100/min + 单 IP 8/min）、
 * 内容清洗（控制字符过滤 + 500 字截断）、凭证格式校验（24 位小写十六进制）。
 */

import { rateLimitOk, clientIp } from '../../_lib/ratelimit'

interface Env {
  cenfan_db?: D1Database
}

const MAX_BODY_BYTES = 4096
const MAX_TEXT_CHARS = 500
const GLOBAL_PER_MIN = 100
const IP_PER_MIN = 8
/** 对话流水最多保留的条数（超出丢弃最旧） */
const MAX_THREAD_ENTRIES = 20

interface ThreadEntry {
  by: 'admin' | 'user'
  text: string
  ts: number
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

/** 截断 + 去控制字符（保留换行） */
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

/** id 校验：13 位数字 + 冒号 + 12 位小写十六进制 */
function idOk(id: string): boolean {
  if (id.length !== 26) return false
  for (let i = 0; i < id.length; i++) {
    const n = id.charCodeAt(i)
    if (i === 13) {
      if (id[i] !== ':') return false
    } else if (i < 13) {
      if (n < 48 || n > 57) return false
    } else {
      const ok = (n >= 48 && n <= 57) || (n >= 97 && n <= 102)
      if (!ok) return false
    }
  }
  return true
}

/** 作者凭证校验：24 位小写十六进制 */
function keyOk(k: string): boolean {
  if (k.length !== 24) return false
  for (const c of k) {
    const n = c.codePointAt(0) ?? 0
    const ok = (n >= 48 && n <= 57) || (n >= 97 && n <= 102)
    if (!ok) return false
  }
  return true
}

function parseThread(raw: string | null): ThreadEntry[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as ThreadEntry[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.cenfan_db) return json({ error: 'not_configured' }, 503)
  if (!originAllowed(request)) return json({ error: 'forbidden_origin' }, 403)

  const declared = Number(request.headers.get('Content-Length') ?? '0')
  if (declared > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)
  let raw: string
  try {
    raw = await request.text()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  if (raw.length === 0 || raw.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
    if (!body || typeof body !== 'object') return json({ error: 'invalid_payload' }, 400)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const id = typeof body.id === 'string' ? body.id : ''
  const key = typeof body.key === 'string' ? body.key : ''
  const text = sanitize(body.text, MAX_TEXT_CHARS)
  if (!idOk(id)) return json({ error: 'invalid_id' }, 400)
  if (!keyOk(key)) return json({ error: 'invalid_key' }, 400)
  if (text === '') return json({ error: 'empty_content' }, 400)

  if (!rateLimitOk('fbr:p:global', GLOBAL_PER_MIN)) return json({ error: 'rate_limited' }, 429)
  if (!rateLimitOk(`fbr:p:${clientIp(request)}`, IP_PER_MIN)) return json({ error: 'rate_limited' }, 429)

  const db = env.cenfan_db
  try {
    const row = await db
      .prepare('SELECT akey, status, thread FROM feedback WHERE id = ?')
      .bind(id)
      .first<{ akey: string | null; status: string | null; thread: string | null }>()
    if (!row) return json({ error: 'not_found' }, 404)
    // 老数据没有 akey：无法验证作者身份，礼貌拒绝（新反馈均带凭证）
    if (!row.akey || row.akey !== key) return json({ error: 'forbidden_key' }, 403)

    const thread = parseThread(row.thread)
    const entry: ThreadEntry = { by: 'user', text, ts: Date.now() }
    thread.push(entry)
    const trimmed = thread.slice(-MAX_THREAD_ENTRIES)

    // 追问 = 问题未解决：已完结/搁置/关闭的反馈自动重开，让管理端重新看到
    const reopen = row.status === 'done' || row.status === 'shelved' || row.status === 'closed'
    await db
      .prepare(`UPDATE feedback SET thread = ?${reopen ? ", status = 'open'" : ''} WHERE id = ?`)
      .bind(JSON.stringify(trimmed), id)
      .run()
    return json({ ok: true, entry, ...(reopen ? { status: 'open' } : {}) })
  } catch {
    return json({ error: 'storage_failed' }, 503)
  }
}

export const onRequestGet: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
export const onRequestPut: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
export const onRequestDelete: PagesFunction<Env> = async () => json({ error: 'method_not_allowed' }, 405)
