/**
 * 城市数据前端客户端 —— 通过 Cloudflare Pages Functions 按需查询，不打包全量数据。
 *
 * 后端接口（functions/api/ 下实现）：
 *   GET /api/provinces            → { provinces: string[] }                省份全称列表
 *   GET /api/cities?province=广东省 → { cities: CityInfo[] }                该省全部市级城市（含中心经纬度）
 *   GET /api/cities?provinces=湖南省,广东省 → { results: { 省: { cities } } }  批量合并查询（省请求数）
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
/** 进行中的请求 Promise —— 结果缓存是"先查后写"，并发首次调用会发出 N 个相同请求，
    因此再叠一层 Promise 缓存：同一资源同一时间只允许一个网络请求在途 */
const provincePromiseCache = new Map<string, Promise<CityInfo[]>>()
let provinceListCache: string[] | null = null
let provinceListPromise: Promise<string[]> | null = null
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
  provinceListPromise ??= getJson<{ provinces: string[] }>('/api/provinces')
    .then((data) => {
      provinceListCache = data?.provinces ?? []
      return provinceListCache
    })
    .finally(() => {
      provinceListPromise = null
    })
  return provinceListPromise
}

/** 某省的全部市级城市（带省内缓存）。接口不可用时返回空数组。 */
export async function fetchCities(province: string): Promise<CityInfo[]> {
  const cached = provinceCache.get(province)
  if (cached) return cached
  let promise = provincePromiseCache.get(province)
  if (!promise) {
    promise = getJson<{ cities: CityInfo[] }>(
      `/api/cities?province=${encodeURIComponent(province)}`,
    )
      .then((data) => {
        const cities = data?.cities ?? []
        provinceCache.set(province, cities)
        return cities
      })
      .finally(() => {
        provincePromiseCache.delete(province)
      })
    provincePromiseCache.set(province, promise)
  }
  return promise
}

/**
 * 批量预取多个省份的城市：未缓存的省份合并成一个 ?provinces= 请求发出，
 * 比逐省一个请求节约网络与 Functions 调用；结果写入与 fetchCities 共享的缓存。
 */
export async function fetchCitiesBatch(provinces: string[]): Promise<void> {
  const need = [...new Set(provinces)].filter(
    (p) => !provinceCache.has(p) && !provincePromiseCache.has(p),
  )
  if (need.length === 0) return
  if (need.length === 1) {
    await fetchCities(need[0])
    return
  }
  const query = need.map((p) => encodeURIComponent(p)).join(',')
  const promise = getJson<{ results: Record<string, { cities: CityInfo[] }> }>(
    `/api/cities?provinces=${query}`,
  ).then((data) => {
    const results = data?.results ?? {}
    for (const p of need) {
      provinceCache.set(p, results[p]?.cities ?? [])
    }
  })
  // 让批量期间针对单个省份的 fetchCities 调用也搭这次批量请求的便车
  for (const p of need) {
    provincePromiseCache.set(
      p,
      promise.then(() => provinceCache.get(p) ?? []),
    )
  }
  await promise
  for (const p of need) provincePromiseCache.delete(p)
}

/** 批量预取多个省份的城市（地图定位点用），返回 城市名 → 经纬度 的查找表 */
export async function prefetchCityCenters(
  provinces: string[],
): Promise<Map<string, [number, number]>> {
  const unique = [...new Set(provinces)]
  // 一个批量请求拿全所有未缓存省份（命中缓存时自动跳过）
  await fetchCitiesBatch(unique)
  const map = new Map<string, [number, number]>()
  for (const p of unique) {
    const cities = provinceCache.get(p) ?? []
    for (const c of cities) {
      map.set(c.name, c.center)
      map.set(c.name.replace(/市$/, ''), c.center)
    }
  }
  return map
}
