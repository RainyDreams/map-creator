/**
 * 标注块布局（50 人容量版）：
 * - 分列：按质心经度排序后做"总行数均分"的连续切分（西部→左列、东部→右列），
 *   兼顾地理方向与两列负载均衡，避免一列爆长一列空旷
 * - 字号：分级自适应（1 → 0.72 共 6 档），每档整体缩放行高/间距；
 *   最低档仍放不下时不再缩小，而是加高画布纵向扩展
 * - 两侧列共享同一可用高度（取两列最低档所需高度的较大值），人少的一列字号自然更大
 * - 城市级定位：可选传入 城市名→经纬度 查找表，每省的定位点落到学生实际城市；
 *   接口不可用/查不到时回退省份质心
 * - 引线：质心（或城市点簇中心）→ 标注块朝向地图一侧的边缘中点；
 *   边缘接入点在文字锚点之外，保证引线不穿标注块
 */
import type { StudentEntry } from '@/types'
import { inferCityFromUniversity } from '@/utils/geo'
import { getProvinceShape, MAP_H, MAP_X0, MAP_X1, projectToMap, TOP, BOTTOM } from './geo'

export interface LabelBlock {
  province: string
  /** 已排好版的 "姓名　大学（城市）" 行 */
  lines: string[]
  /** 文本锚点 x（左列右对齐 / 右列左对齐） */
  anchorX: number
  textAnchor: 'start' | 'end'
  /** 省份名基线 y */
  headerBaseline: number
  /** 第一条学生行基线 y */
  firstLineBaseline: number
  lineH: number
  headerSize: number
  lineSize: number
  /** 块垂直中心（引线接入点 y） */
  centerY: number
  /** 引线接入点 x（标注块朝向地图一侧的边缘，在文字锚点之外） */
  edgeX: number
  /** 引线起点 / 主定位圆点的画布坐标（城市点簇中心，无城市数据时为省份质心） */
  centroidX: number
  centroidY: number
  /** 城市级定位圆点（画布坐标）；无城市数据时等于 [主定位点] */
  cityPoints: Array<{ x: number; y: number }>
}

export interface LabelLayout {
  left: LabelBlock[]
  right: LabelBlock[]
  svgHeight: number
}

export interface LabelLayoutOptions {
  /** 左下角为覆盖层（如老师名单块）预留的高度（viewBox 单位），不足时加高画布 */
  reserveLeftBottom?: number
  /** 右下角为覆盖层（如未定位提示块）预留的高度（viewBox 单位） */
  reserveRightBottom?: number
}

/** 城市名 → 经纬度 查找表（来自 prefetchCityCenters，含带"市"与不带"市"两种键） */
export type CityCenterMap = Map<string, [number, number]>

/** 学生行排版：城市已包含在大学名中（如"北京大学"）时不重复标注 */
export function studentLine(s: StudentEntry): string {
  const name = s.name.trim() || '（未命名）'
  const uni = s.university.trim() || '（未填大学）'
  const city = s.city.trim()
  const showCity = city !== '' && !uni.includes(city)
  return `${name}　${uni}${showCity ? `（${city}）` : ''}`
}

const BASE_HEADER = 16
const BASE_LINE = 13
const BASE_LINE_H = 20
const BASE_HEADER_H = 26
const BASE_GAP = 16
/** 标注列的最小可用高度：地图较矮时也给列留出足够空间再缩字号 */
const COL_MIN = 520
/** 字号档位：逐级尝试，命中即停；最低档为硬下限，不再缩小 */
const SCALE_LEVELS = [1, 0.94, 0.88, 0.82, 0.76, 0.72] as const
const MIN_SCALE = SCALE_LEVELS[SCALE_LEVELS.length - 1]
/** 每省块在负载均衡中的权重：学生行数 + 标题行的折算成本 */
const HEADER_WEIGHT = 1.5

interface SideItem {
  province: string
  students: StudentEntry[]
  /** 引线起点（城市点簇中心或省份质心，画布坐标） */
  cx: number
  cy: number
  /** 城市级定位点（画布坐标） */
  cityPoints: Array<{ x: number; y: number }>
  lat: number
  lng: number
}

/** 解析一个省的定位点：优先学生实际城市（去重后逐城一点），回退省份质心 */
function resolveProvincePoints(
  students: StudentEntry[],
  fallback: [number, number],
  cityCenters?: CityCenterMap,
): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  const seen = new Set<string>()
  if (cityCenters && cityCenters.size > 0) {
    for (const s of students) {
      const cityName = s.city.trim() || inferCityFromUniversity(s.university) || ''
      if (cityName === '') continue
      const c = cityCenters.get(cityName) ?? cityCenters.get(cityName.replace(/市$/, ''))
      if (!c) continue
      const key = `${c[0].toFixed(3)},${c[1].toFixed(3)}`
      if (seen.has(key)) continue
      seen.add(key)
      pts.push(c)
    }
  }
  if (pts.length === 0) pts.push(fallback)
  return pts
}

export function computeLabelLayout(
  groups: Map<string, StudentEntry[]>,
  cityCenters?: CityCenterMap,
  options?: LabelLayoutOptions,
): LabelLayout {
  const items: SideItem[] = []
  for (const [province, students] of groups) {
    if (students.length === 0) continue
    const shape = getProvinceShape(province)
    if (!shape?.centroid) continue
    const rawPts = resolveProvincePoints(students, shape.centroid, cityCenters)
    const canvasPts = rawPts.map(([lng, lat]) => {
      const [x, y] = projectToMap(lng, lat)
      return { x, y }
    })
    // 点簇中心作为引线起点与主定位点
    const cx = canvasPts.reduce((s, p) => s + p.x, 0) / canvasPts.length
    const cy = canvasPts.reduce((s, p) => s + p.y, 0) / canvasPts.length
    items.push({
      province,
      students,
      cx,
      cy,
      cityPoints: canvasPts,
      lat: shape.centroid[1],
      lng: shape.centroid[0],
    })
  }

  // 按经度排序后连续切分，使左右两列"总行数"（含标题权重）最接近均分；
  // 西部省份进左列、东部进右列，避免引线横跨整幅地图
  const byLng = [...items].sort((a, b) => a.lng - b.lng)
  const totalW = byLng.reduce((s, i) => s + i.students.length + HEADER_WEIGHT, 0)
  let bestK = 0
  let bestDiff = Number.POSITIVE_INFINITY
  let prefix = 0
  for (let k = 0; k <= byLng.length; k++) {
    const diff = Math.abs(2 * prefix - totalW)
    if (diff < bestDiff - 1e-9) {
      bestDiff = diff
      bestK = k
    }
    if (k < byLng.length) prefix += byLng[k].students.length + HEADER_WEIGHT
  }
  const byLatDesc = (a: SideItem, b: SideItem) => b.lat - a.lat
  const left = byLng.slice(0, bestK).sort(byLatDesc)
  const right = byLng.slice(bestK).sort(byLatDesc)

  /** 某侧在指定档位下的总高度 */
  function heightAt(list: SideItem[], scale: number): number {
    if (list.length === 0) return 0
    return (
      list.reduce(
        (sum, i) => sum + BASE_HEADER_H * scale + i.students.length * BASE_LINE_H * scale,
        0,
      ) +
      (list.length - 1) * BASE_GAP * scale
    )
  }

  // 两侧共享同一可用高度：先求各自最低档所需高度，取大者与列最小高度比较，
  // 这样人少的列在加高的画布上能用更大的字号档位
  const floorNeed = Math.max(heightAt(left, MIN_SCALE), heightAt(right, MIN_SCALE))
  const colTarget = Math.max(MAP_H, COL_MIN, floorNeed)

  function pickScale(list: SideItem[]): number {
    for (const level of SCALE_LEVELS) {
      if (heightAt(list, level) <= colTarget) return level
    }
    return MIN_SCALE
  }

  function buildSide(list: SideItem[], side: 'left' | 'right'): { blocks: LabelBlock[]; total: number } {
    if (list.length === 0) return { blocks: [], total: 0 }
    const scale = pickScale(list)
    const headerH = BASE_HEADER_H * scale
    const lineH = BASE_LINE_H * scale
    const gap = BASE_GAP * scale

    let y = TOP + 4
    const blocks = list.map((i): LabelBlock => {
      const h = headerH + i.students.length * lineH
      const block: LabelBlock = {
        province: i.province,
        lines: i.students.map(studentLine),
        anchorX: side === 'left' ? MAP_X0 - 16 : MAP_X1 + 16,
        textAnchor: side === 'left' ? 'end' : 'start',
        headerBaseline: y + headerH - 8 * scale,
        firstLineBaseline: y + headerH + lineH * 0.72,
        lineH,
        headerSize: BASE_HEADER * scale,
        lineSize: BASE_LINE * scale,
        centerY: y + h / 2,
        // 接入点在文字锚点靠地图一侧之外，引线只到块边缘、不穿过文字区
        edgeX: side === 'left' ? MAP_X0 - 6 : MAP_X1 + 6,
        centroidX: i.cx,
        centroidY: i.cy,
        cityPoints: i.cityPoints,
      }
      y += h + gap
      return block
    })
    return { blocks, total: y - gap }
  }

  const l = buildSide(left, 'left')
  const r = buildSide(right, 'right')
  // 超出列高时加高画布（纵向扩展），保证最低档字号下依然不重叠；
  // 左右下角的覆盖层预留区同样通过加高画布兑现，保证文字不被压住
  const reserveL = options?.reserveLeftBottom ?? 0
  const reserveR = options?.reserveRightBottom ?? 0
  const svgHeight = Math.max(
    TOP + MAP_H + BOTTOM,
    l.total + BOTTOM + reserveL,
    r.total + BOTTOM + reserveR,
    120,
  )
  return { left: l.blocks, right: r.blocks, svgHeight }
}
