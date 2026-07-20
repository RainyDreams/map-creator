/**
 * 城市数据前端客户端 —— 通过 Cloudflare Pages Functions 按需查询，不打包全量数据。
 *
 * 后端接口（functions/api/ 下实现）：
 *   GET /api/provinces            → { provinces: string[] }                省份全称列表
 *   GET /api/cities?province=广东省 → { cities: CityInfo[] }                该省全部市级城市（含中心经纬度）
 *
 * 本模块只做调用与缓存；接口不可用（如纯 vite dev 无 Functions）时返回空结果并标记不可用，
 * UI 需优雅降级（下拉退回手动输入）。
 */

export interface CityInfo {
  /** 城市全称，如“广州市”；直辖市为“北京市”等 */
  name: string
  /** 城市中心经纬度 [lng, lat]，用于地图定位点 */
  center: [number, number]
}

const provinceCache = new Map<string, CityInfo[]>()
let provinceListCache: string[] | null = null
let apiAvailable: boolean | null = null

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    apiAvailable = true
    return (await res.json()) as T
  } catch {
    apiAvailable = false
    return null
  }
}

/** 城市 API 当前是否可用（首次调用任意接口后才有结论） */
export function isCityApiAvailable(): boolean | null {
  return apiAvailable
}

/** 全部省份（全称）。接口不可用时返回空数组。 */
export async function fetchProvinces(): Promise<string[]> {
  if (provinceListCache) return provinceListCache
  const data = await getJson<{ provinces: string[] }>('/api/provinces')
  provinceListCache = data?.provinces ?? []
  return provinceListCache
}

/** 某省的全部市级城市（带省内缓存）。接口不可用时返回空数组。 */
export async function fetchCities(province: string): Promise<CityInfo[]> {
  const cached = provinceCache.get(province)
  if (cached) return cached
  const data = await getJson<{ cities: CityInfo[] }>(
    `/api/cities?province=${encodeURIComponent(province)}`,
  )
  const cities = data?.cities ?? []
  provinceCache.set(province, cities)
  return cities
}

/** 批量预取多个省份的城市（地图定位点用），返回 城市名 → 经纬度 的查找表 */
export async function prefetchCityCenters(
  provinces: string[],
): Promise<Map<string, [number, number]>> {
  const map = new Map<string, [number, number]>()
  await Promise.all(
    [...new Set(provinces)].map(async (p) => {
      const cities = await fetchCities(p)
      for (const c of cities) {
        map.set(c.name, c.center)
        map.set(c.name.replace(/市$/, ''), c.center)
      }
    }),
  )
  return map
}
