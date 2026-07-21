/**
 * GET /api/school-badge?name=清华大学 → image/webp（校徽图片代理）
 *
 * 图片来源为 urongda.com 的公开 CDN（cdn.urongda.com，240w webp）。
 * 按需求：前端不直接访问第三方站点，一律经由本 Pages Function 服务端代理取图，
 * 并附加长缓存头（浏览器 1 天 / CDN 30 天 / SWR 90 天），命中后不再回源。
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

export const onRequestGet = async ({ request }: { request: Request }): Promise<Response> => {
  const name = new URL(request.url).searchParams.get('name') ?? ''
  const slug = badgeSlugOf(name)
  if (!slug) {
    return Response.json({ error: `未收录该校徽：${name}` }, { status: 404 })
  }

  const upstream = `https://cdn.urongda.com/images/schools/${slug}/240w/${slug}-240w.webp`
  let res: Response
  try {
    res = await fetch(upstream, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cengfan-map-badge-proxy/1.0)' },
    })
  } catch {
    return Response.json({ error: '校徽源站连接失败' }, { status: 502 })
  }
  if (!res.ok || !res.body) {
    return Response.json({ error: `校徽源站返回 ${res.status}` }, { status: 502 })
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'image/webp',
      'Cache-Control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=7776000',
      'X-Badge-Source': 'urongda-cdn',
    },
  })
}
