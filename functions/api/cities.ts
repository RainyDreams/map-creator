/**
 * GET /api/cities?province=广东省 → { "cities": [{ "name": "广州市", "center": [lng, lat] }, ...] }
 * 省份不存在时返回 404 JSON { "error": "..." }。
 */
import citiesData from './_data/cities.json'

interface CityInfo {
  name: string
  center: [number, number]
}

const data = citiesData as unknown as Record<string, CityInfo[]>

export const onRequestGet = ({ request }: { request: Request }): Response => {
  const province = new URL(request.url).searchParams.get('province')

  if (!province) {
    return Response.json(
      { error: '缺少必填查询参数 province' },
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

  return Response.json(
    { cities },
    {
      headers: {
        // 静态数据集：浏览器 1 天、CDN 7 天、30 天内可用陈旧副本
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
      },
    },
  )
}
