/**
 * GET /api/school-badge?name=清华大学 → image/webp（校徽图片代理）
 *
 * 图片来源为 urongda.com 的公开 CDN（cdn.urongda.com，240w webp）。
 * 按需求：前端不直接访问第三方站点，一律经由本 Pages Function 服务端代理取图。
 *
 * 缓存策略（极致：校徽图片按 slug 内容不变，可放心长缓存）：
 * 1. Cloudflare 边缘缓存（caches.default）命中即回，跨请求/跨节点复用，
 *    未收录的 404 也短缓存，避免重复穿透；
 * 2. 回源 fetch 带 cf.cacheTtl（Workers 子请求缓存 1 年）+ 失败自动重试一次；
 * 3. 响应附加 immutable 缓存头（浏览器/CDN 均 1 年，校徽内容不变故安全）。
 * 未收录校徽时返回 404 JSON，前端据此不渲染图标。
 */
import universitiesData from './_data/universities.json'

type RawEntry = [string | null, (string | null)?, (number | null)?, (string | null)?]
const DATA = universitiesData as unknown as Record<string, RawEntry>
const NAMES = Object.keys(DATA)

function badgeSlugOf(query: string): string | null {
  const name = query.trim()
  if (!name) return null
  const base = name.replace(/[（(].*$/, '').trim()
  const direct = DATA[name]?.[3] ?? DATA[base]?.[3]
  if (direct) return direct
  let best: string | null = null
  for (const k of NAMES) {
    if ((base.includes(k) || k.includes(base)) && DATA[k][3]) {
      if (best === null || k.length > best.length) best = k
    }
  }
  return best ? (DATA[best][3] ?? null) : null
}

const CACHE_HEADERS = {
  // 校徽图片按 slug 内容不变：浏览器与 CDN 都缓存 1 年并标记 immutable
  'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
  'X-Badge-Source': 'urongda-cdn',
}

/** 回源取图：Workers 子请求缓存 + 超时 + 失败重试一次 */
async function fetchUpstream(upstream: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(upstream, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cengfan-map-badge-proxy/1.0)' },
        signal: AbortSignal.timeout(9000),
        cf: { cacheTtl: 31536000, cacheEverything: true },
      } as RequestInit)
      if (res.ok && res.body) return res
    } catch {
      // 超时/网络错误：稍候重试
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 250))
  }
  return null
}

interface CfEvent {
  request: Request
  waitUntil: (p: Promise<unknown>) => void
}

export const onRequestGet = async ({ request, waitUntil }: CfEvent): Promise<Response> => {
  // 紧急关闭（2026-08-01，应要求）：不再回源 urongda，只服务已入边缘缓存的校徽；
  // 缓存未命中一律 503，前端按"取不到"处理（不渲染自动校徽），
  // 用户手动上传的校徽不受影响。恢复时删除此短路块即可。
  {
    const edgeCache0 = (caches as unknown as { default: Cache }).default
    const cacheKey0 = new Request(new URL(request.url).toString(), { method: 'GET' })
    const cached0 = await edgeCache0.match(cacheKey0)
    if (cached0) return cached0
    return Response.json(
      { error: '校徽服务临时维护中，可手动上传校徽图片' },
      { status: 503 },
    )
  }

  const edgeCache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' })

  const name = new URL(request.url).searchParams.get('name') ?? ''
  const slug = badgeSlugOf(name)
  if (!slug) {
    // 未收录：404 也在边缘短缓存 1 天，避免同一校名反复穿透到 Function
    const notFound = Response.json(
      { error: `未收录该校徽：${name}` },
      { status: 404, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } },
    )
    waitUntil(edgeCache.put(cacheKey, notFound.clone()))
    return notFound
  }

  // 1) 边缘缓存命中：直接返回（解决"首次 502、第二次就好"的冷启动问题）
  const cached = await edgeCache.match(cacheKey)
  if (cached) return cached

  // 2) 回源（带子请求缓存与重试）
  const upstream = `https://cdn.urongda.com/images/schools/${slug}/240w/${slug}-240w.webp`
  const res = await fetchUpstream(upstream)
  if (!res) {
    return Response.json({ error: '校徽源站暂时不可用，请稍后重试' }, { status: 502 })
  }

  const resp = new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'image/webp',
      ...CACHE_HEADERS,
    },
  })
  // 3) 写入边缘缓存（异步，不阻塞响应）
  waitUntil(edgeCache.put(cacheKey, resp.clone()))
  return resp
}
