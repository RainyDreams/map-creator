/**
 * 标注块布局：
 * - 有学生的省份按质心投影 x 分为左/右两列，分别排在主图两侧的竖列中，按质心纬度自北向南排序
 * - 条目多时按列整体等比缩小字号（最少到列高刚好容纳），仍不够则加高画布纵向滚动
 * - 每个块记录引线两端坐标（省份质心 → 块边缘中点）
 */
import type { StudentEntry } from '@/types'
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
  /** 引线接入点 x（标注块朝向地图一侧的边缘） */
  edgeX: number
  /** 省份质心的画布坐标（引线起点 / 定位圆点） */
  centroidX: number
  centroidY: number
}

export interface LabelLayout {
  left: LabelBlock[]
  right: LabelBlock[]
  svgHeight: number
}

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

interface SideItem {
  province: string
  students: StudentEntry[]
  cx: number
  cy: number
  lat: number
  lng: number
}

export function computeLabelLayout(groups: Map<string, StudentEntry[]>): LabelLayout {
  const items: SideItem[] = []
  for (const [province, students] of groups) {
    if (students.length === 0) continue
    const shape = getProvinceShape(province)
    if (!shape?.centroid) continue
    const [cx, cy] = projectToMap(shape.centroid[0], shape.centroid[1])
    items.push({ province, students, cx, cy, lat: shape.centroid[1], lng: shape.centroid[0] })
  }

  // 按质心经度的中位数分列：比按地图几何中线分更能保持左右两列块数均衡，
  // 也避免陕西/湖北这类中部省份被分到远端导致引线横跨整幅地图
  const sortedLng = items.map((i) => i.lng).sort((a, b) => a - b)
  const medianLng =
    sortedLng.length % 2 === 1
      ? sortedLng[(sortedLng.length - 1) / 2]
      : (sortedLng[sortedLng.length / 2 - 1] + sortedLng[sortedLng.length / 2]) / 2
  const left = items.filter((i) => i.lng < medianLng).sort((a, b) => b.lat - a.lat)
  const right = items.filter((i) => i.lng >= medianLng).sort((a, b) => b.lat - a.lat)
  const colTarget = Math.max(MAP_H, COL_MIN)

  function buildSide(list: SideItem[], side: 'left' | 'right'): { blocks: LabelBlock[]; total: number } {
    if (list.length === 0) return { blocks: [], total: 0 }
    const rawH =
      list.reduce((sum, i) => sum + BASE_HEADER_H + i.students.length * BASE_LINE_H, 0) +
      (list.length - 1) * BASE_GAP
    const scale = Math.min(1, colTarget / rawH)
    const headerH = BASE_HEADER_H * scale
    const lineH = BASE_LINE_H * scale
    const gap = BASE_GAP * scale

    let y = TOP + 4
    const blocks = list.map((i): LabelBlock => {
      const h = headerH + i.students.length * lineH
      const block: LabelBlock = {
        province: i.province,
        lines: i.students.map(studentLine),
        anchorX: side === 'left' ? MAP_X0 - 14 : MAP_X1 + 14,
        textAnchor: side === 'left' ? 'end' : 'start',
        headerBaseline: y + headerH - 8 * scale,
        firstLineBaseline: y + headerH + lineH * 0.72,
        lineH,
        headerSize: BASE_HEADER * scale,
        lineSize: BASE_LINE * scale,
        centerY: y + h / 2,
        edgeX: side === 'left' ? MAP_X0 - 6 : MAP_X1 + 6,
        centroidX: i.cx,
        centroidY: i.cy,
      }
      y += h + gap
      return block
    })
    return { blocks, total: y - gap }
  }

  const l = buildSide(left, 'left')
  const r = buildSide(right, 'right')
  const svgHeight = Math.max(TOP + MAP_H + BOTTOM, l.total + BOTTOM, r.total + BOTTOM, 120)
  return { left: l.blocks, right: r.blocks, svgHeight }
}
