/**
 * 分享短链接 / 多端协同接口（D1 版）：
 *
 *   POST /api/share              body: 画布 JSON（format = cenfan-map-share）
 *                                → 创建协同文档（D1 shares 表，7 天滚动有效期），返回短 id；
 *                                  通过 Set-Cookie 把「创建者 = 管理员」身份写进浏览器
 *   GET  /api/share?id=xxx       → 返回文档全文 + 调用方角色（admin/member）；
 *                                  首次访问的设备种「成员」cookie
 *        GET /api/share?id&rev=n → 轮询模式：rev 已是最新时只回 changed:false（省流量）
 *   PUT  /api/share              body: { id, name, data, theme, fontSlots }
 *                                → 持有有效角色 cookie（管理员或成员）的设备可写；
 *                                  rev +1，有效期顺延 7 天（活跃画布不过期）
 *
 * 身份模型（按需求用 cookie 界定）：
 * - 创建分享时，服务器为该 id 种下 cenfan_role_<id> = "a:<adminKey>"，管理员；
 * - 任何首次 GET 且无角色 cookie 的设备，种下 "m:<随机>"，成员；
 * - PUT 必须带合法角色 cookie（管理员 key 匹配或任意成员 cookie），否则 403。
 *
 * 数据合规说明：
 * - 只有用户主动点击「分享为链接」时，画布数据才会上传到本接口；
 * - 数据在无编辑活动 7 天后过期（访问时判定 + 写入时顺手清理过期行），
 *   服务端不做任何阅读、分析或二次利用；
 * - 短 id 与 adminKey 均为加密随机数，不可枚举。
 *
 * 存储说明（v1.34.0 起从 KV 迁至 D1）：
 * - KV 免费额度（写 1000 次/天）对协同场景太小；D1 免费额度 10 万行写/天、
 *   500 万行读/天，重开分享功能时不会再烧穿额度。
 */

interface Env {
  cenfan_db?: D1Database
}

/**
 * v1.11.0 起分享链接功能暂时关闭（实时协同对 KV 读写量过大，暂停开放）。
 * 协同实现（POST/GET/PUT、rev 版本、角色 cookie、前端同步引擎）全部保留，
 * 仅关闭 API 入口：所有请求统一 503。重新开放时把 SHARE_DISABLED 置 false 即可。
 */
const SHARE_DISABLED = true

function disabledResponse(): Response {
  return json(
    { error: 'share_disabled', message: '分享链接功能暂时关闭，请改用导出图片或 JSON 文件分享' },
    503,
  )
}

/** 7 天有效期（秒）；每次成功 PUT 顺延 */
const TTL_SECONDS = 7 * 24 * 60 * 60
const TTL_MS = TTL_SECONDS * 1000
/** 单条分享数据上限（字符数），防止滥用 */
const MAX_BODY_CHARS = 2_000_000
/** 短 id 字符表（URL 安全、无歧义） */
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

function randomString(len: number): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length]
  return s
}

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      // 协同文档必须实时：禁止任何缓存
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })
}

interface ShareRow {
  id: string
  rev: number
  updated_at: number
  name: string
  /** 画布数据（JSON 字符串） */
  data: string
  theme: string | null
  font_slots: string | null
  /** 管理员密钥（cookie 比对用），不随任何响应返回 */
  admin: string
}

function parseJsonColumn(text: string | null): unknown {
  if (text === null || text === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 读取一行；过期即删并按不存在处理（7 天滚动有效期） */
async function loadShare(db: D1Database, id: string): Promise<ShareRow | null> {
  const row = await db
    .prepare('SELECT id, rev, updated_at, name, data, theme, font_slots, admin FROM shares WHERE id = ?')
    .bind(id)
    .first<ShareRow>()
  if (!row) return null
  if (Date.now() > row.updated_at + TTL_MS) {
    await db.prepare('DELETE FROM shares WHERE id = ?').bind(id).run()
    return null
  }
  return row
}

function roleCookieName(id: string): string {
  return `cenfan_role_${id}`
}

function roleCookie(id: string, value: string): string {
  return `${roleCookieName(id)}=${value}; Path=/; Max-Age=${TTL_SECONDS}; SameSite=Lax; Secure`
}

/** 从 Cookie 头解析该 id 的角色：'admin' | 'member' | null */
function resolveRole(request: Request, id: string, adminKey: string): 'admin' | 'member' | null {
  const header = request.headers.get('Cookie') ?? ''
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== roleCookieName(id)) continue
    const value = part.slice(eq + 1).trim()
    if (value === `a:${adminKey}`) return 'admin'
    if (value.startsWith('m:') && value.length > 4) return 'member'
    return null
  }
  return null
}

function isValidId(id: string): boolean {
  return /^[A-Za-z0-9]{10}$/.test(id)
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (SHARE_DISABLED) return disabledResponse()
  if (!env.cenfan_db) return json({ error: 'share_not_configured' }, 503)

  let text: string
  try {
    text = await request.text()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  if (text.length === 0) return json({ error: 'empty_body' }, 400)
  if (text.length > MAX_BODY_CHARS) return json({ error: 'payload_too_large' }, 413)

  let parsed: { format?: unknown; name?: unknown; data?: unknown; theme?: unknown; fontSlots?: unknown }
  try {
    parsed = JSON.parse(text)
    if (!parsed || parsed.format !== 'cenfan-map-share' || !parsed.data) {
      return json({ error: 'invalid_payload' }, 400)
    }
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const id = randomString(10)
  const adminKey = randomString(16)
  const now = Date.now()
  await env.cenfan_db
    .prepare('INSERT INTO shares (id, rev, updated_at, name, data, theme, font_slots, admin) VALUES (?, 1, ?, ?, ?, ?, ?, ?)')
    .bind(
      id,
      now,
      typeof parsed.name === 'string' ? parsed.name : '',
      JSON.stringify(parsed.data),
      parsed.theme == null ? null : JSON.stringify(parsed.theme),
      parsed.fontSlots == null ? null : JSON.stringify(parsed.fontSlots),
      adminKey,
    )
    .run()
  // 顺手清理过期行（7 天无编辑活动的文档）
  await env.cenfan_db.prepare('DELETE FROM shares WHERE updated_at < ?').bind(now - TTL_MS).run()
  return json(
    { id, rev: 1, expiresAt: now + TTL_MS, ttlDays: 7, role: 'admin' },
    200,
    { 'Set-Cookie': roleCookie(id, `a:${adminKey}`) },
  )
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (SHARE_DISABLED) return disabledResponse()
  if (!env.cenfan_db) return json({ error: 'share_not_configured' }, 503)

  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? ''
  if (!isValidId(id)) return json({ error: 'invalid_id' }, 400)

  const doc = await loadShare(env.cenfan_db, id)
  if (doc === null) {
    return json({ error: 'not_found', message: '链接不存在或已超过 7 天有效期' }, 404)
  }

  // 角色：管理员 cookie 匹配 → admin；否则种成员 cookie（首次访问）
  let role = resolveRole(request, id, doc.admin)
  const headers: Record<string, string> = {}
  if (role === null) {
    role = 'member'
    headers['Set-Cookie'] = roleCookie(id, `m:${randomString(12)}`)
  }
  const expiresAt = doc.updated_at + TTL_MS

  // 轮询模式：客户端 rev 已最新 → 只回元信息
  const revParam = Number(url.searchParams.get('rev') ?? '0')
  if (Number.isFinite(revParam) && revParam >= doc.rev) {
    return json({ changed: false, rev: doc.rev, role, expiresAt }, 200, headers)
  }
  return json(
    {
      changed: true,
      rev: doc.rev,
      updatedAt: doc.updated_at,
      expiresAt,
      role,
      name: doc.name,
      data: parseJsonColumn(doc.data),
      theme: parseJsonColumn(doc.theme),
      fontSlots: parseJsonColumn(doc.font_slots),
    },
    200,
    headers,
  )
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (SHARE_DISABLED) return disabledResponse()
  if (!env.cenfan_db) return json({ error: 'share_not_configured' }, 503)

  let body: { id?: unknown; name?: unknown; data?: unknown; theme?: unknown; fontSlots?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!isValidId(id)) return json({ error: 'invalid_id' }, 400)
  if (!body.data || typeof body.data !== 'object') return json({ error: 'invalid_payload' }, 400)

  const doc = await loadShare(env.cenfan_db, id)
  if (doc === null) {
    return json({ error: 'not_found', message: '链接不存在或已超过 7 天有效期' }, 404)
  }

  // 写权限：管理员或成员均可编辑（协同的意义）；无角色 cookie 的设备拒绝
  const role = resolveRole(request, id, doc.admin)
  if (role === null) {
    return json({ error: 'forbidden', message: '请先通过分享链接打开画布，再进行同步编辑' }, 403)
  }

  // 滑动续期：有编辑活动即顺延 7 天
  const now = Date.now()
  const nextRev = doc.rev + 1
  await env.cenfan_db
    .prepare('UPDATE shares SET rev = ?, updated_at = ?, name = ?, data = ?, theme = ?, font_slots = ? WHERE id = ?')
    .bind(
      nextRev,
      now,
      typeof body.name === 'string' ? body.name : doc.name,
      JSON.stringify(body.data),
      body.theme == null ? doc.theme : JSON.stringify(body.theme),
      body.fontSlots == null ? doc.font_slots : JSON.stringify(body.fontSlots),
      id,
    )
    .run()
  return json({ ok: true, rev: nextRev, updatedAt: now, expiresAt: now + TTL_MS, role })
}
