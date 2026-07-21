/**
 * 地图几何与投影模块：
 * - 模块级解析 china.json，把 Polygon/MultiPolygon 预编译为 SVG path 字符串
 *   （坐标已做等距圆柱投影：x = lng·cos(中纬)，y = -lat，单位仍是"度"，缩放由 SVG transform 完成）
 * - 主图裁剪到 lat >= 17.5（南沙等归入右下角"南海诸岛"小插图）
 */
import chinaJson from '@/assets/china.json'

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

const raw = chinaJson as unknown as { features: RawFeature[] }

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

export const GEO_FEATURES: GeoFeature[] = raw.features.map((f) => ({
  name: f.properties?.name ?? '',
  d: buildPath(f.geometry),
  centroid: f.properties?.centroid ?? deriveCentroid(f.geometry),
}))

const shapeByName = new Map(GEO_FEATURES.filter((f) => f.name !== '').map((f) => [f.name, f]))

export function getProvinceShape(name: string): GeoFeature | undefined {
  return shapeByName.get(name)
}

/* ---------------- 画布布局常量（虚拟坐标，配合 SVG viewBox 自适应缩放） ---------------- */

export const DESIGN_W = 1200
/** 地图/标注列顶部留白 */
export const TOP = 16
export const BOTTOM = 24
/** 主图区域左右边界（外侧留给标注列；加宽主图使标注更靠近定位点、引线更短不易交叉） */
export const MAP_X0 = 214
export const MAP_X1 = 986

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
