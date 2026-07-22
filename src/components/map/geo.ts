/**
 * 地图几何与投影模块：
 * - china.json 不打进 JS bundle：作为静态资源放在 public/data/ 下，运行时按需 fetch
 *   （Cloudflare CDN 缓存，见 public/_headers），fetch 后把 Polygon/MultiPolygon
 *   预编译为 SVG path 字符串
 *   （坐标已做等距圆柱投影：x = lng·cos(中纬)，y = -lat，单位仍是"度"，缩放由 SVG transform 完成）
 * - 主图裁剪到 lat >= 17.5（南沙等归入右下角"南海诸岛"小插图）
 * - 调用方需先 await loadGeoFeatures()（或监听 isGeoReady），之后同步 API 可用
 */

export interface GeoFeature {
  /** 省份全称；china.json 中南海诸岛要素 name 为空串 */
  name: string
  /** 预投影后的 SVG path */
  d: string
  /** [lng, lat]（GeoJSON properties.centroid，可能缺失） */
  centroid: [number, number] | null
}

interface RawFeature {
  properties?: { name?: string; centroid?: [number, number] }
  geometry?: { type: string; coordinates: unknown }
}

/** 中纬 35.5° 的余弦修正，抵消等距圆柱投影的横向拉伸 */
export const KX = Math.cos((35.5 * Math.PI) / 180)

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function ringToPath(ring: number[][]): string {
  let d = ''
  for (const pt of ring) {
    const x = round2(pt[0] * KX)
    const y = round2(-pt[1])
    d += d ? `L${x},${y}` : `M${x},${y}`
  }
  return `${d}Z`
}

function buildPath(geom?: RawFeature['geometry']): string {
  if (!geom) return ''
  if (geom.type === 'Polygon') {
    return (geom.coordinates as number[][][]).map(ringToPath).join('')
  }
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][])
      .map((poly) => poly.map(ringToPath).join(''))
      .join('')
  }
  return ''
}

/** 鞋带公式求单个外环的面积质心（用于 GeoJSON 缺失 properties.centroid 的省份，如河北/甘肃） */
function ringCentroid(ring: number[][]): { lng: number; lat: number; area: number } {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[(i + 1) % ring.length]
    const cross = x0 * y1 - x1 * y0
    a += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  a /= 2
  if (Math.abs(a) < 1e-9) return { lng: ring[0][0], lat: ring[0][1], area: 0 }
  return { lng: cx / (6 * a), lat: cy / (6 * a), area: Math.abs(a) }
}

/** 由几何体推导质心：取面积最大的外环（主岛/主体），避免飞地拉偏 */
function deriveCentroid(geom?: RawFeature['geometry']): [number, number] | null {
  if (!geom) return null
  const outerRings: number[][][] = []
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates as number[][][]
    if (rings[0]) outerRings.push(rings[0])
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates as number[][][][]) {
      if (poly[0]) outerRings.push(poly[0])
    }
  }
  let best: { lng: number; lat: number; area: number } | null = null
  for (const ring of outerRings) {
    const c = ringCentroid(ring)
    if (!best || c.area > best.area) best = c
  }
  return best ? [round2(best.lng), round2(best.lat)] : null
}

let geoFeatures: GeoFeature[] = []
let shapeByName = new Map<string, GeoFeature>()
let loadPromise: Promise<GeoFeature[]> | null = null

/** 地图数据是否已加载完成（之后可同步使用 getGeoFeatures / getProvinceShape） */
export function isGeoReady(): boolean {
  return geoFeatures.length > 0
}

/** 已加载的省份要素（未加载时为 []） */
export function getGeoFeatures(): GeoFeature[] {
  return geoFeatures
}

/**
 * 从 /data/china.json 加载并预编译地图数据（Promise 级去重，全局只请求一次）。
 * 失败时清空 Promise 允许下次重试。
 */
export function loadGeoFeatures(): Promise<GeoFeature[]> {
  if (geoFeatures.length > 0) return Promise.resolve(geoFeatures)
  loadPromise ??= fetch('/data/china.json')
    .then((res) => {
      if (!res.ok) throw new Error(`china.json HTTP ${res.status}`)
      return res.json() as Promise<{ features: RawFeature[] }>
    })
    .then((raw) => {
      geoFeatures = raw.features.map((f) => ({
        name: f.properties?.name ?? '',
        d: buildPath(f.geometry),
        centroid: f.properties?.centroid ?? deriveCentroid(f.geometry),
      }))
      shapeByName = new Map(geoFeatures.filter((f) => f.name !== '').map((f) => [f.name, f]))
      return geoFeatures
    })
    .catch((err) => {
      loadPromise = null
      throw err
    })
  return loadPromise
}

export function getProvinceShape(name: string): GeoFeature | undefined {
  return shapeByName.get(name)
}

/* ---------------- 画布布局常量（虚拟坐标，配合 SVG viewBox 自适应缩放） ---------------- */

export const DESIGN_W = 1500
/** 地图/标注列顶部留白 */
export const TOP = 16
export const BOTTOM = 24
/** 主图区域左右边界（外侧各留 320px 给标注列：常见长校名在常用字号下无需换行） */
export const MAP_X0 = 320
export const MAP_X1 = 1180

const LNG_MIN = 73.4
const LNG_MAX = 135.2
const LAT_MAX = 53.7
/** 主图纬度下限（以南内容只出现在小插图中） */
const MAIN_MIN_LAT = 17.5

export const MAP_SCALE = (MAP_X1 - MAP_X0) / ((LNG_MAX - LNG_MIN) * KX)
export const MAP_H = (LAT_MAX - MAIN_MIN_LAT) * MAP_SCALE

/** 主图 path 组的整体 transform（path 坐标 = (lng·KX, -lat)） */
export const MAP_TRANSFORM = `translate(${round2(MAP_X0 - MAP_SCALE * LNG_MIN * KX)} ${round2(
  TOP + MAP_SCALE * LAT_MAX,
)}) scale(${MAP_SCALE.toFixed(5)})`

/** 经纬度 → 主图画布坐标（质心、引线端点用） */
export function projectToMap(lng: number, lat: number): [number, number] {
  return [MAP_X0 + (lng - LNG_MIN) * KX * MAP_SCALE, TOP + (LAT_MAX - lat) * MAP_SCALE]
}

/**
 * 右下角"南海诸岛"小插图：只呈现南部海域范围（海南 + 南海诸岛 + 十段线），
 * 而非整幅中国地图——这正是小插图存在的意义（凸显南海诸岛归属）。
 * 范围：东经 104.5°–123.5°、北纬 2°–24.8°。
 * 尺寸刻意收小并锚定主图右下角，点缀而不喧宾夺主。
 */
const INSET_LNG_MIN = 104.5
const INSET_LNG_MAX = 123.5
const INSET_LAT_MAX = 24.8
const INSET_LAT_MIN = 2.0

export const INSET = (() => {
  const w = 88
  const scale = w / ((INSET_LNG_MAX - INSET_LNG_MIN) * KX)
  const h = (INSET_LAT_MAX - INSET_LAT_MIN) * scale
  const x = MAP_X1 - w - 8
  const y = TOP + MAP_H - h - 8
  return {
    x,
    y,
    w,
    h,
    transform: `translate(${round2(x - scale * INSET_LNG_MIN * KX)} ${round2(
      y + scale * INSET_LAT_MAX,
    )}) scale(${scale.toFixed(5)})`,
  }
})()
