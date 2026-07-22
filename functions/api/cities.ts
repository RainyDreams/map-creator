/**
 * GET /api/cities?province=广东省   → { "cities": [{ "name": "广州市", "center": [lng, lat] }, ...] }
 * GET /api/cities?provinces=湖南省,广东省 → { "results": { "湖南省": { cities: [...] }, "广东省": { cities: [...] } } }
 *
 * 批量模式（provinces，逗号分隔，至多 34 个）：把多个省份合并到一个请求里，
 * 节约请求数（地图定位点预取一次拿全）；单个省份不存在时该键返回空数组，不整体 404。
 * 单省模式（province）保持原行为：省份不存在返回 404 JSON { "error": "..." }。
 */
import citiesData from './_data/cities.json'

interface CityInfo {
  name: string
  center: [number, number]
}

const data = citiesData as unknown as Record<string, CityInfo[]>

/** 静态数据集缓存策略：浏览器 1 天、CDN 7 天、30 天内可用陈旧副本 */
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
}

/** 批量查询省份数上限（34 个省级行政区） */
const MAX_BATCH = 34

export const onRequestGet = ({ request }: { request: Request }): Response => {
  const params = new URL(request.url).searchParams

  // —— 批量模式：provinces=湖南省,广东省 ——
  const batch = params.get('provinces')
  if (batch !== null) {
    const names = [...new Set(batch.split(',').map((s) => s.trim()).filter((s) => s !== ''))]
    if (names.length === 0) {
      return Response.json({ error: 'provinces 参数为空' }, { status: 400 })
    }
    if (names.length > MAX_BATCH) {
      return Response.json(
        { error: `一次最多查询 ${MAX_BATCH} 个省份` },
        { status: 400 },
      )
    }
    const results: Record<string, { cities: CityInfo[] }> = {}
    for (const name of names) {
      results[name] = { cities: data[name] ?? [] }
    }
    return Response.json({ results }, { headers: CACHE_HEADERS })
  }

  // —— 单省模式：province=广东省 ——
  const province = params.get('province')
  if (!province) {
    return Response.json(
      { error: '缺少必填查询参数 province（或批量参数 provinces）' },
      { status: 400 },
    )
  }

  const cities = data[province]
  if (!cities) {
    return Response.json(
      { error: `未找到省份：${province}` },
      { status: 404 },
    )
  }

  return Response.json({ cities }, { headers: CACHE_HEADERS })
}
