/**
 * 分享短链接接口：
 *   POST /api/share         body: 画布 JSON（format = cenfan-map-share）
 *                           → 存入 KV（7 天 TTL，到期自动删除），返回短 id
 *   GET  /api/share?id=xxx  → 返回画布 JSON；不存在或已过期返回 404
 *
 * 数据合规说明：
 * - 只有用户主动点击「分享为链接」时，画布数据才会上传到本接口；
 * - 数据保存 7 天后由 Cloudflare KV 自动删除（expirationTtl = 604800 秒），
 *   服务端不做任何阅读、分析或二次利用；
 * - 短 id 为 128 位随机数的 URL 安全编码，不可枚举。
 */

interface Env {
  cenfan_share?: KVNamespace
}

/** 7 天有效期（秒） */
const TTL_SECONDS = 7 * 24 * 60 * 60
/** 单条分享数据上限（字符数），防止滥用 */
const MAX_BODY_CHARS = 2_000_000
/** 短 id 字符表（URL 安全、无歧义） */
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

function newShareId(len = 10): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let id = ''
  for (const b of bytes) id += ID_ALPHABET[b % ID_ALPHABET.length]
  return id
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.cenfan_share) return json({ error: 'share_not_configured' }, 503)

  let text: string
  try {
    text = await request.text()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  if (text.length === 0) return json({ error: 'empty_body' }, 400)
  if (text.length > MAX_BODY_CHARS) return json({ error: 'payload_too_large' }, 413)

  // 基本校验：必须是带 format 标识的 JSON 对象，防止接口被当免费存储滥用
  try {
    const parsed = JSON.parse(text) as { format?: unknown }
    if (!parsed || parsed.format !== 'cenfan-map-share') {
      return json({ error: 'invalid_payload' }, 400)
    }
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const id = newShareId()
  const expiresAt = Date.now() + TTL_SECONDS * 1000
  await env.cenfan_share.put(`share:${id}`, text, { expirationTtl: TTL_SECONDS })
  return json({ id, expiresAt, ttlDays: 7 })
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.cenfan_share) return json({ error: 'share_not_configured' }, 503)

  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!/^[A-Za-z0-9]{10}$/.test(id)) return json({ error: 'invalid_id' }, 400)

  const text = await env.cenfan_share.get(`share:${id}`)
  if (text === null) {
    return json({ error: 'not_found', message: '链接不存在或已超过 7 天有效期' }, 404)
  }
  return new Response(text, {
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      // 短缓存即可：数据静态不变，但过期后必须能立刻 404
      'Cache-Control': 'public, max-age=300',
    },
  })
}
