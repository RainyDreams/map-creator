/**
 * 标注块布局（50 人容量版）：
 * - 分列：按质心经度排序后做"总行数均分"的连续切分（西部→左列、东部→右列），
 *   兼顾地理方向与两列负载均衡，避免一列爆长一列空旷
 * - 长校名处理：不缩小字号、不省略号截断，而是按列宽换行（信息完整呈现），
 *   换行产生的额外行数计入列高与负载均衡
 * - 字号：用户按 px 设定（以 1500px 宽虚拟画布为基准）；纵向空间不足时按档位
 *   整体缩放（1 → 0.72），最低档仍放不下时加高画布纵向扩展
 * - 两侧列共享同一可用高度（取两列最低档所需高度的较大值），人少的一列字号自然更大
 * - 城市级定位：可选传入 城市名→经纬度 查找表，每省的定位点落到学生实际城市；
 *   接口不可用/查不到时回退省份质心
 * - 引线：质心（或城市点簇中心）→ 标注块朝向地图一侧的边缘中点；
 *   边缘接入点在文字锚点之外，保证引线不穿标注块
 */
import type { CalligraphyAsset, StudentBadge, StudentEntry } from '@/types'
import { inferCityFromUniversity } from '@/utils/geo'
import { getProvinceShape, MAP_H, MAP_X0, MAP_X1, projectToMap, TOP, BOTTOM } from './geo'

export interface LabelBlock {
  province: string
  /** 已排好版的学生行（含换行结果） */
  lines: StudentLineParts[]
  /** 文本锚点 x（左列右对齐 / 右列左对齐） */
  anchorX: number
  textAnchor: 'start' | 'end'
  /** 省份名基线 y */
  headerBaseline: number
  /** 第一条学生行基线 y */
  firstLineBaseline: number
  lineH: number
  headerSize: number
  /** 姓名段字号（已含列缩放） */
  personSize: number
  /** 大学 · 城市段字号（已含列缩放） */
  placeSize: number
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

/** 院校补充信息（来自 /api/universities 预取） */
export interface UniEnrichment {
  /** 软科排名（null = 未上榜/未收录，排在有排名者之后） */
  rank: number | null
  /** 是否有校徽 */
  badge: boolean
  /** 校徽内联 dataURL（预取完成后提供；导出 PNG 时无需再网络请求） */
  badgeUrl?: string | null
}

export interface LabelLayoutOptions {
  /** 左下角为覆盖层（如老师名单块）预留的高度（viewBox 单位），不足时加高画布 */
  reserveLeftBottom?: number
  /** 右下角为覆盖层（如未定位提示块）预留的高度（viewBox 单位） */
  reserveRightBottom?: number
  /** 原始校名 → 院校补充信息；提供后省内按软科排名排序、行内渲染校徽 */
  uniInfo?: Map<string, UniEnrichment>
  /** 三个标注模块的字号（px，以 1500px 宽画布为基准） */
  sizes?: { province: number; person: number; place: number }
  /** 省内手动排序的省份：这些省保持录入/手动顺序，不按软科排名重排 */
  manualProvinces?: Set<string>
  /**
   * 真实文字宽度测量（canvas measureText + 实际字体栈），换行判定优先使用；
   * 缺省时回退 em 估算（偏保守，可能把「（北京）· 北京」这类行误判为超宽）
   */
  measure?: (text: string, px: number, slot: 'person' | 'place') => number
  /** 大学名 → 用户上传的毛笔字图片；提供后该校文字被图片替代 */
  calligraphy?: Record<string, CalligraphyAsset>
  /** 学生 id → 校徽覆盖：hidden 隐藏该生校徽；dataUrl 用自定义图片替代自动匹配（优先于自动校徽） */
  badgeOverrides?: Record<string, StudentBadge>
}

/** 城市名 → 经纬度 查找表（来自 prefetchCityCenters，含带"市"与不带"市"两种键） */
export type CityCenterMap = Map<string, [number, number]>

/** 省份全称 → 短名（北京市→北京、广西壮族自治区→广西、香港特别行政区→香港） */
export function provinceShortName(province: string): string {
  return province.replace(/(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$/, '')
}

/**
 * 学生行排版：`姓名[校徽][毛笔字图]大学 · 城市`（姓名/校徽/大学之间无间隙）。
 * 城市总是显示（不再因直辖市/校名含城市而省略）；城市未知时只显示大学。
 * 超出列宽时 place 段换行为多行（placeLines），绝不省略号截断。
 * 上传毛笔字图片后：大学文字被图片替代（校徽后直接渲染图片），place 段只剩「· 城市」。
 */
/** 毛笔字图片在布局中的定位信息（宽高比 + 用户倍率；显示尺寸随地点字号与列缩放联动） */
export interface CalliPlacement {
  dataUrl: string
  /** 宽高比 w/h */
  aspect: number
  /** 用户倍率（已按列宽上限收敛，避免图片超宽） */
  sizeScale: number
}

export interface StudentLineParts {
  /** 姓名段（人名字体） */
  person: string
  /** 大学 · 城市完整文本（未换行）；有毛笔字图片时为「· 城市」或空串 */
  place: string
  /** place 按列宽换行后的各行（不含姓名独占的首行标记；可为空数组=纯图片行） */
  placeLines: string[]
  /** true 时首行只有姓名+校徽，大学/图片段从第二行起排（原 placeLines[0]==='' 的显式化） */
  ownLine: boolean
  /** 是否有校徽可在大学名前渲染 */
  badge?: boolean
  /** 原始校名（校徽代理 URL 用） */
  uni?: string
  /** 校徽内联 dataURL（预取完成时有值，渲染/导出免网络） */
  badgeUrl?: string | null
  /** 大学毛笔字图片（上传后替代大学文字渲染） */
  calli?: CalliPlacement | null
}

export function studentLineParts(s: StudentEntry): Omit<StudentLineParts, 'placeLines' | 'ownLine'> {
  const name = s.name.trim() || '（未命名）'
  const uni = s.university.trim() || '（未填大学）'
  const city = s.city.trim()
  return { person: name, place: city !== '' ? `${uni} · ${city}` : uni, uni: s.university.trim() }
}

/* ---------- 换行排版：校名特别长时换行而非缩小/省略 ---------- */

/** 单侧标注列文字可用宽度（viewBox 单位）：锚点 304 到画布边缘留 8px 余量 */
const COL_TEXT_W = 296
/** 校徽占位：图标边长 = 地点字号 × 1.05；校徽与校名无间隙，与姓名间留 3px 呼吸 */
export const BADGE_RATIO = 1.05
/** 姓名与校徽之间的间隙（校徽与校名之间保持无间隙） */
export const BADGE_GAP = 3

/** 估算文本宽度（em）：中文/全角字符≈1em，ASCII≈0.56em，空格/间隔号按窄字符计（用于换行估算，偏保守） */
export function textEms(s: string): number {
  let w = 0
  for (const ch of s) {
    if (ch === ' ') w += 0.32
    else if (ch === '·' || ch === '•') w += 0.4
    else w += ch.charCodeAt(0) > 0xff ? 1 : 0.56
  }
  return w
}

/** 一行各部分的有效字号（px） */
export interface LineFontSizes {
  person: number
  place: number
}

/** 毛笔字图片显示高度 = 地点字号 × CALLI_RATIO × 用户倍率（笔画比字形更舒展，略高于文字） */
export const CALLI_RATIO = 1.6
/** 图片比文字行高时，所在行额外保留的纵向余量比例 */
const CALLI_ROW_PAD = 1.18

/** 毛笔字图片在用户字号（scale=1）下的显示尺寸 */
export function calliSize(calli: CalliPlacement, placePx: number): { w: number; h: number } {
  const h = placePx * CALLI_RATIO * calli.sizeScale
  return { w: h * calli.aspect, h }
}

/**
 * 把 place 段按列可用宽度换行：
 * - 首行与「姓名+校徽(+毛笔字图)」同行（之间无间隙），续行与大学起点对齐；
 * - 若首行剩余宽度放不下 4 个字，place 整段从第二行起排（ownLine）；
 * - 有毛笔字图片时图片占住大学位，文本（· 城市）绕其后排布；无文本时为纯图片行；
 * - 断行处若为「·」或空格则吞掉，保证续行不以分隔符开头；
 * - 宽度判定优先用真实测量（canvas measureText），缺省时回退 em 估算。
 */
export function wrapStudentLine(
  parts: Omit<StudentLineParts, 'placeLines' | 'ownLine'>,
  sizes: LineFontSizes,
  measure?: (text: string, px: number, slot: 'person' | 'place') => number,
): StudentLineParts {
  const mPerson = (t: string) => (measure ? measure(t, sizes.person, 'person') : textEms(t) * sizes.person)
  const mPlace = (t: string) => (measure ? measure(t, sizes.place, 'place') : textEms(t) * sizes.place)
  const personW = mPerson(parts.person)
  const badgeW = parts.badge ? sizes.place * BADGE_RATIO + BADGE_GAP : 0
  const calliW = parts.calli ? calliSize(parts.calli, sizes.place).w : 0
  const indent = personW + badgeW + calliW

  // 首行剩余宽度（px）；过窄时 place 整段换到第二行起排
  let ownLine = false
  if (COL_TEXT_W - indent < sizes.place * 4 && parts.place !== '') {
    ownLine = true
  }

  /** 第 idx 条文本行的可用宽度：图片/姓名只占首行纵向空间，续行从大学起点可用到列尾 */
  const availFor = (idx: number): number => {
    if (!ownLine) {
      return idx === 0 ? COL_TEXT_W - indent : COL_TEXT_W - personW - badgeW
    }
    // ownLine：第 0 条文本行与校徽+图片同行（无姓名），续行全宽
    return idx === 0 ? COL_TEXT_W - badgeW - calliW : COL_TEXT_W
  }

  const lines: string[] = []
  let cur = ''
  for (const ch of parts.place) {
    // 逐字累积实测宽度（含字距/连字影响，比逐字宽度求和更准）
    if (cur !== '' && mPlace(cur + ch) > availFor(lines.length)) {
      lines.push(cur)
      cur = ''
      // 续行不以分隔符/空格开头
      if (ch === ' ' || ch === '·' || ch === '　') continue
    }
    cur += ch
  }
  if (cur !== '') lines.push(cur)
  if (lines.length === 0 && parts.place !== '') lines.push(parts.place)
  return { ...parts, placeLines: lines, ownLine }
}

/** 学生行占用的文本行数（ownLine 时姓名独占一行；纯图片行也算 1 行） */
export function studentRowCount(ln: StudentLineParts): number {
  return (ln.ownLine ? 1 : 0) + Math.max(1, ln.placeLines.length)
}

/** 行高倍率：毛笔字图片比文字行高时，该省块整行加高（1 = 不 boost） */
export function studentRowBoost(ln: StudentLineParts, placePx: number): number {
  if (!ln.calli) return 1
  const { h } = calliSize(ln.calli, placePx)
  const base = BASE_LINE_H * (placePx / BASE_LINE)
  return Math.max(1, (h * CALLI_ROW_PAD) / base)
}

const BASE_HEADER = 16
const BASE_LINE = 13
/** 行距加大：BASE_LINE * MIN_SCALE 不得小于 9px 硬下限 */
const BASE_LINE_H = 22
const BASE_HEADER_H = 28
/** 块间距加大，避免省份块之间视觉粘连 */
const BASE_GAP = 20
/** 标注列的最小可用高度：地图较矮时也给列留出足够空间再缩字号 */
const COL_MIN = 560
/** 字号档位：逐级尝试，命中即停；最低档为硬下限（13*0.72=9.36 ≥ 9px），不再缩小 */
const SCALE_LEVELS = [1, 0.94, 0.88, 0.82, 0.76, 0.72] as const
const MIN_SCALE = SCALE_LEVELS[SCALE_LEVELS.length - 1]
/** 每省块在负载均衡中的权重：标题行的折算成本（偏高以平衡块数） */
const HEADER_WEIGHT = 2

interface SideItem {
  province: string
  students: StudentEntry[]
  /** 换行后的总行数（负载均衡与列高估算用；ownLine/纯图片行已计入） */
  rowCount: number
  /** 行高倍率：块内含毛笔字图片行时 >1（图片比文字行高，整行加高避免压图） */
  rowBoost: number
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
  const uniInfo = options?.uniInfo
  const sizes = options?.sizes ?? { province: 16, person: 13, place: 13 }
  /** 用户 px 字号 → 相对基准的比例（布局内部仍按比例与档位计算） */
  const provPct = sizes.province / BASE_HEADER
  const personPct = sizes.person / BASE_LINE
  const placePct = sizes.place / BASE_LINE
  /** 行高由姓名/地点两个字号的较大者决定 */
  const linePct = Math.max(personPct, placePct)

  /** 省内排序键：软科排名升序，未上榜/未收录（null/undefined）排在其后并保持录入顺序 */
  const rankOf = (s: StudentEntry): number => {
    const r = uniInfo?.get(s.university.trim())?.rank
    return typeof r === 'number' ? r : 9999
  }

  /** 学生行的换行结果（按用户 px 字号在 scale=1 下计算，优先真实测量，保守不溢出） */
  const wrappedOf = (s: StudentEntry): StudentLineParts => {
    const parts = studentLineParts(s)
    const key = s.university.trim()
    const enrich = uniInfo?.get(key)
    let badge = enrich?.badge === true
    let badgeUrl: string | null = enrich?.badgeUrl ?? null
    // 每人校徽覆盖：hidden 优先（不显示）；自定义图片替代自动匹配（即使全局开关关闭也显示）
    const ovr = options?.badgeOverrides?.[s.id]
    if (ovr?.hidden) {
      badge = false
      badgeUrl = null
    } else if (ovr?.dataUrl) {
      badge = true
      badgeUrl = ovr.dataUrl
    }
    // 毛笔字图片：替代大学文字，place 只剩「· 城市」；图片宽度按列宽上限收敛倍率
    const raw = options?.calligraphy?.[key]
    let calli: CalliPlacement | null = null
    if (raw && raw.w > 0 && raw.h > 0) {
      const aspect = raw.w / raw.h
      const badgeW = badge ? sizes.place * BADGE_RATIO + BADGE_GAP : 0
      const maxW = COL_TEXT_W - badgeW - 8
      const natW = sizes.place * CALLI_RATIO * raw.scale * aspect
      const sizeScale = natW > maxW ? raw.scale * (maxW / natW) : raw.scale
      calli = { dataUrl: raw.dataUrl, aspect, sizeScale }
    }
    const place = calli
      ? parts.place.includes(' · ')
        ? parts.place.slice(parts.place.indexOf(' · '))
        : ''
      : parts.place
    return wrapStudentLine(
      { ...parts, place, badge, badgeUrl, calli },
      { person: sizes.person, place: sizes.place },
      options?.measure,
    )
  }

  const items: SideItem[] = []
  for (const [province, students] of groups) {
    if (students.length === 0) continue
    const shape = getProvinceShape(province)
    if (!shape?.centroid) continue
    // 省内按软科排名排序（未提供院校数据或该省被手动排序过时保持现有顺序；sort 稳定）
    const ordered =
      uniInfo && !options?.manualProvinces?.has(province)
        ? [...students].sort((a, b) => rankOf(a) - rankOf(b))
        : students
    const rawPts = resolveProvincePoints(ordered, shape.centroid, cityCenters)
    const canvasPts = rawPts.map(([lng, lat]) => {
      const [x, y] = projectToMap(lng, lat)
      return { x, y }
    })
    // 点簇中心作为引线起点与主定位点
    const cx = canvasPts.reduce((s, p) => s + p.x, 0) / canvasPts.length
    const cy = canvasPts.reduce((s, p) => s + p.y, 0) / canvasPts.length
    const wrapped = ordered.map((s) => wrappedOf(s))
    items.push({
      province,
      students: ordered,
      rowCount: wrapped.reduce((n, w) => n + studentRowCount(w), 0),
      rowBoost: wrapped.reduce((b, w) => Math.max(b, studentRowBoost(w, sizes.place)), 1),
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
  const totalW = byLng.reduce((s, i) => s + i.rowCount + HEADER_WEIGHT, 0)
  let bestK = 0
  let bestDiff = Number.POSITIVE_INFINITY
  let prefix = 0
  for (let k = 0; k <= byLng.length; k++) {
    const diff = Math.abs(2 * prefix - totalW)
    if (diff < bestDiff - 1e-9) {
      bestDiff = diff
      bestK = k
    }
    if (k < byLng.length) prefix += byLng[k].rowCount + HEADER_WEIGHT
  }
  const byLatDesc = (a: SideItem, b: SideItem) => b.lat - a.lat
  const left = byLng.slice(0, bestK).sort(byLatDesc)
  const right = byLng.slice(bestK).sort(byLatDesc)

  /** 某侧在指定档位下的总高度（省份名/学生行分别按各自字号比例缩放，换行与图片行加高已计入） */
  function heightAt(list: SideItem[], scale: number): number {
    if (list.length === 0) return 0
    return (
      list.reduce(
        (sum, i) =>
          sum + BASE_HEADER_H * scale * provPct + i.rowCount * BASE_LINE_H * scale * linePct * i.rowBoost,
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

  /** 左右两列共享同一缩放档（取两侧所需较小值），保证两列字号完全一致 */
  const sharedScale = Math.min(pickScale(left), pickScale(right))

  function buildSide(list: SideItem[], side: 'left' | 'right'): { blocks: LabelBlock[]; total: number } {
    if (list.length === 0) return { blocks: [], total: 0 }
    const scale = sharedScale
    const headerH = BASE_HEADER_H * scale * provPct
    const gap = BASE_GAP * scale
    const headerSize = BASE_HEADER * scale * provPct
    const personSize = BASE_LINE * scale * personPct
    const placeSize = BASE_LINE * scale * placePct

    let y = TOP + 4
    const blocks = list.map((i): LabelBlock => {
      // 块级行高：含毛笔字图片的块整行加高（rowBoost），避免图片压住相邻行
      const lineH = BASE_LINE_H * scale * linePct * i.rowBoost
      const h = headerH + i.rowCount * lineH
      const block: LabelBlock = {
        province: i.province,
        // 长校名已换行（不缩小、不省略），行数计入块高
        lines: i.students.map((s) => wrappedOf(s)),
        anchorX: side === 'left' ? MAP_X0 - 16 : MAP_X1 + 16,
        textAnchor: side === 'left' ? 'end' : 'start',
        headerBaseline: y + headerH - 8 * scale,
        firstLineBaseline: y + headerH + lineH * 0.72,
        lineH,
        headerSize,
        personSize,
        placeSize,
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
  // 左右下角的覆盖层（老师名单/未定位提示）预留区同样通过加高画布兑现。
  // 注意：预留必须同时加到「地图本体」这一项上——学生较少、地图是最高元素时，
  // 若只加在标注列项上，画布不会加高，覆盖层就会直接压在地图与学生标注上。
  const reserveL = options?.reserveLeftBottom ?? 0
  const reserveR = options?.reserveRightBottom ?? 0
  const svgHeight = Math.max(
    TOP + MAP_H + BOTTOM + Math.max(reserveL, reserveR),
    l.total + BOTTOM + reserveL,
    r.total + BOTTOM + reserveR,
    120,
  )
  return { left: l.blocks, right: r.blocks, svgHeight }
}
