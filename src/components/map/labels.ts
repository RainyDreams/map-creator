/**
 * 标注块布局（动态侧宽版）：
 * - 地图本体宽度固定（860）；两侧标注区的宽度按实际内容动态界定——
 *   实测每条「姓名+校徽+大学 · 城市」的单行宽度，列宽夹在 [最小, 最大] 档位内：
 *   内容少时画布收窄、地图显得更大；内容多时常见长校名/地名也无需换行，
 *   只有超出列宽上限的极端长文本才换行（绝不省略号截断、不缩小单行字号）
 * - 分列：按质心经度排序后做"总行数均分"的连续切分（西部→左列、东部→右列）；
 *   「每侧两列」模式再把每侧切成两个子列，子列宽度同样按各自内容动态界定
 * - 字号：用户按 px 设定；纵向空间不足时按档位整体缩放（1 → 0.72），
 *   最低档仍放不下时加高画布纵向扩展
 * - 全部（子）列共享同一可用高度与缩放档，字号完全一致
 * - 城市级定位：可选传入 城市名→经纬度 查找表，每省的定位点落到学生实际城市；
 *   接口不可用/查不到时回退省份质心
 * - 引线：质心（或城市点簇中心）→ 标注块朝向地图一侧的边缘中点；
 *   边缘接入点在文字锚点之外，保证引线不穿标注块
 */
import type { CalligraphyAsset, StudentBadge, StudentEntry } from '@/types'
import { inferCityFromUniversity } from '@/utils/geo'
import { buildGeom, getProvinceShape, MAP_W, TOP, BOTTOM, type MapGeom } from './geo'

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
  /** 省份卡片（背景方块）包围盒：文字区向外扩 CARD_PAD；引线接入点已在卡片朝地图一侧的边缘上 */
  cardX: number
  cardY: number
  cardW: number
  cardH: number
}

export interface LabelLayout {
  left: LabelBlock[]
  right: LabelBlock[]
  svgHeight: number
  /** 实际采用的整体字号缩放档（1 = 用户设定字号原样放下；<1 说明做了整体缩小） */
  scale: number
  /** 整体几何（画布宽随内容动态界定；地图位置/投影/小插图） */
  geom: MapGeom
  /** 用户字号原样（scale=1）时最高的那一（子）列所需高度；排版建议用它与 geom.mapH 的比值决定是否建议两列 */
  maxColHeight1: number
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
  /** 右下角为覆盖层（如未定位提示块）预留的高度（viewBox 单位），不足时加高画布 */
  reserveRightBottom?: number
  /** 原始校名 → 院校补充信息；提供后省内按软科排名排序、行内渲染校徽 */
  uniInfo?: Map<string, UniEnrichment>
  /** 三个标注模块的字号（px，以地图宽 860 的画布为基准） */
  sizes?: { province: number; person: number; place: number }
  /** 省内手动排序的省份：这些省保持录入/手动顺序，不按软科排名重排 */
  manualProvinces?: Set<string>
  /**
   * 真实文字宽度测量（canvas measureText + 实际字体栈），换行判定与侧宽界定优先使用；
   * 缺省时回退 em 估算（偏保守）
   */
  measure?: (text: string, px: number, slot: 'person' | 'place') => number
  /** 大学名 → 用户上传的毛笔字图片；提供后该校文字被图片替代 */
  calligraphy?: Record<string, CalligraphyAsset>
  /** 学生 id → 校徽覆盖：hidden 隐藏该生校徽；dataUrl 用自定义图片替代自动匹配（优先于自动校徽） */
  badgeOverrides?: Record<string, StudentBadge>
  /** 每侧标注列数：1（默认）或 2（人多时更宽松，每侧两个子列） */
  columnsPerSide?: 1 | 2
  /** 同校合并：同一大学的多名同学合并为一个块（姓名竖排，学校信息只显示一次） */
  mergeSameSchool?: boolean
  /** 省份卡片背景是否开启（影响子列间距：开启时卡片内边距需要更大的列间距） */
  cardBg?: boolean
}

/** 城市名 → 经纬度 查找表（来自 prefetchCityCenters，含带"市"与不带"市"两种键） */
export type CityCenterMap = Map<string, [number, number]>

/** 省份全称 → 短名（北京市→北京、广西壮族自治区→广西、香港特别行政区→香港） */
export function provinceShortName(province: string): string {
  return province.replace(/(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$/, '')
}

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
  /** 同校合并：该单元是一组同校学生（姓名一人一行竖排，学校信息在右侧垂直居中只显示一次） */
  groupNames?: string[]
}

export function studentLineParts(s: StudentEntry): Omit<StudentLineParts, 'placeLines' | 'ownLine'> {
  const name = s.name.trim() || '（未命名）'
  const uni = s.university.trim() || '（未填大学）'
  const city = s.city.trim()
  return { person: name, place: city !== '' ? `${uni} · ${city}` : uni, uni: s.university.trim() }
}

/* ---------- 侧宽动态界定的档位与间距常量 ---------- */

/** 单列模式：每侧文字可用宽度档（按内容在两者之间取实测值） */
const COL_MIN_TEXT_W = 200
const COL_MAX_TEXT_W = 320
/** 两列模式：每个子列的文字可用宽度档 */
const COL2_MIN_TEXT_W = 150
const COL2_MAX_TEXT_W = 260
/** 两列模式子列间距（透明背景时） */
const COL2_GAP = 12
/** 两列模式子列间距（开启卡片背景时：卡片内边距需要更大间隙，避免相邻卡片贴上） */
const COL2_GAP_CARD = 26
/** 每侧除文字外的固定留白：锚点距地图 16 + 画布边缘 8 */
const SIDE_PAD = 24
/** 开启卡片背景时的每侧固定留白：锚点距地图 16 + 卡片内边距 10 + 画布边缘 10 */
const SIDE_PAD_CARD = 36
/** 一侧完全没有标注块时保留的窄边距 */
const EMPTY_SIDE_W = 48

/** 校徽占位：图标边长 = 地点字号 × 1.05；校徽与校名无间隙，与姓名间留 3px 呼吸 */
export const BADGE_RATIO = 1.05
/** 姓名与校徽之间的间隙（校徽与校名之间保持无间隙） */
export const BADGE_GAP = 3
/** 无校徽时姓名与大学（或毛笔字图）之间的间隙（不显示校徽的同学，名字与校名挨着会难看） */
export const NAME_PLACE_GAP = 4
/** 同校合并：姓名列与学校信息列之间的间隙 */
export const GROUP_GAP = 10
/** 省份卡片：文字与卡片边缘的内边距 */
export const CARD_PAD_X = 10
export const CARD_PAD_Y = 8
/** 西南空白区：这些省份的名单块默认放进主图左下空白（西藏/云南下方），而非左侧标注列 */
const SW_PROVINCES = new Set(['西藏自治区', '云南省'])

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

type MeasureFn = (text: string, px: number, slot: 'person' | 'place') => number

/** 一行的姓名后附加宽度：校徽占位（含呼吸）或无校徽时的姓名-校名间隙 */
function afterNameW(parts: Omit<StudentLineParts, 'placeLines' | 'ownLine'>, sizes: LineFontSizes): number {
  if (parts.badge) return sizes.place * BADGE_RATIO + BADGE_GAP
  return parts.place !== '' || parts.calli ? NAME_PLACE_GAP : 0
}

/** 同校合并单元的姓名列宽度（组内最长姓名） */
function groupNameColW(parts: Omit<StudentLineParts, 'placeLines' | 'ownLine'>, sizes: LineFontSizes, measure?: MeasureFn): number {
  const mPerson = (t: string) => (measure ? measure(t, sizes.person, 'person') : textEms(t) * sizes.person)
  return Math.max(0, ...(parts.groupNames ?? []).map((n) => mPerson(n)))
}

/** 学生行单行（不换行）总宽度：姓名 + 校徽/间隙 + 毛笔字图 + 大学 · 城市全文 */
function oneLineWidth(
  parts: Omit<StudentLineParts, 'placeLines' | 'ownLine'>,
  sizes: LineFontSizes,
  measure?: MeasureFn,
): number {
  const mPerson = (t: string) => (measure ? measure(t, sizes.person, 'person') : textEms(t) * sizes.person)
  const mPlace = (t: string) => (measure ? measure(t, sizes.place, 'place') : textEms(t) * sizes.place)
  const calliW = parts.calli ? calliSize(parts.calli, sizes.place).w : 0
  // 同校合并：姓名列 + 间隙 + 校徽 + 图片 + 学校文本
  if (parts.groupNames) {
    const badgeW = parts.badge ? sizes.place * BADGE_RATIO + BADGE_GAP : 0
    return groupNameColW(parts, sizes, measure) + GROUP_GAP + badgeW + calliW + mPlace(parts.place)
  }
  return mPerson(parts.person) + afterNameW(parts, sizes) + calliW + mPlace(parts.place)
}

/**
 * 把 place 段按列可用宽度换行（只有超出列宽上限的极端长文本才会走到这里）：
 * - 首行与「姓名+校徽(+毛笔字图)」同行（之间无间隙），续行与大学起点对齐；
 * - 若首行剩余宽度放不下 4 个字，place 整段从第二行起排（ownLine）；
 * - 有毛笔字图片时图片占住大学位，文本（· 城市）绕其后排布；无文本时为纯图片行；
 * - 断行处若为「·」或空格则吞掉，保证续行不以分隔符开头；
 * - 宽度判定优先用真实测量（canvas measureText），缺省时回退 em 估算。
 */
export function wrapStudentLine(
  parts: Omit<StudentLineParts, 'placeLines' | 'ownLine'>,
  sizes: LineFontSizes,
  measure?: MeasureFn,
  colTextW: number = COL_MAX_TEXT_W,
): StudentLineParts {
  const mPlace = (t: string) => (measure ? measure(t, sizes.place, 'place') : textEms(t) * sizes.place)

  // 同校合并：学校信息独占右侧一列（垂直居中），所有行等宽换行；姓名列不参与换行
  if (parts.groupNames) {
    const badgeW = parts.badge ? sizes.place * BADGE_RATIO + BADGE_GAP : 0
    const calliW = parts.calli ? calliSize(parts.calli, sizes.place).w : 0
    const avail = Math.max(sizes.place * 4, colTextW - groupNameColW(parts, sizes, measure) - GROUP_GAP - badgeW - calliW)
    const lines: string[] = []
    let cur = ''
    for (const ch of parts.place) {
      if (cur !== '' && mPlace(cur + ch) > avail) {
        lines.push(cur)
        cur = ''
        if (ch === ' ' || ch === '·' || ch === '　') continue
      }
      cur += ch
    }
    if (cur !== '') lines.push(cur)
    if (lines.length === 0 && parts.place !== '') lines.push(parts.place)
    return { ...parts, placeLines: lines, ownLine: false }
  }

  const mPerson = (t: string) => (measure ? measure(t, sizes.person, 'person') : textEms(t) * sizes.person)
  const personW = mPerson(parts.person)
  const badgeW = parts.badge ? sizes.place * BADGE_RATIO + BADGE_GAP : 0
  const nameGap = !parts.badge && parts.place !== '' ? NAME_PLACE_GAP : 0
  const calliW = parts.calli ? calliSize(parts.calli, sizes.place).w : 0
  const indent = personW + badgeW + nameGap + calliW

  // 首行剩余宽度（px）；过窄时 place 整段换到第二行起排
  let ownLine = false
  if (colTextW - indent < sizes.place * 4 && parts.place !== '') {
    ownLine = true
  }

  /** 第 idx 条文本行的可用宽度：图片/姓名只占首行纵向空间，续行从大学起点可用到列尾 */
  const availFor = (idx: number): number => {
    if (!ownLine) {
      return idx === 0 ? colTextW - indent : colTextW - personW - badgeW - nameGap
    }
    // ownLine：第 0 条文本行与校徽+图片同行（无姓名），续行全宽
    return idx === 0 ? colTextW - badgeW - calliW : colTextW
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

/** 学生行占用的文本行数（ownLine 时姓名独占一行；纯图片行也算 1 行；同校合并取 人数 与 学校行数 的较大者） */
export function studentRowCount(ln: StudentLineParts): number {
  if (ln.groupNames) return Math.max(ln.groupNames.length, Math.max(1, ln.placeLines.length))
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
  /** 不换行的行部件（换行在列宽确定后进行） */
  parts: Array<Omit<StudentLineParts, 'placeLines' | 'ownLine'>>
  /** 该省最长单行内容宽度（换行前实测，列宽界定用；含省份名标题宽度） */
  oneLineW: number
  /** 换行后的总行数（负载均衡与列高估算用；ownLine/纯图片行已计入） */
  rowCount: number
  /** 行高倍率：块内含毛笔字图片行时 >1（图片比文字行高，整行加高避免压图） */
  rowBoost: number
  /** 换行结果（列宽确定后填充） */
  wrapped: StudentLineParts[]
  /** 定位点（经纬度；geom 确定后投影为画布坐标） */
  rawPts: Array<[number, number]>
  /** 投影后的画布坐标（geom 确定后填充） */
  cityPts?: Array<{ x: number; y: number }>
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
  const columnsPerSide = options?.columnsPerSide ?? 1
  /** 列宽档位：内容实测宽度夹在 [minColW, maxColW] 之间 */
  const minColW = columnsPerSide === 2 ? COL2_MIN_TEXT_W : COL_MIN_TEXT_W
  const maxColW = columnsPerSide === 2 ? COL2_MAX_TEXT_W : COL_MAX_TEXT_W
  const clampW = (w: number) => Math.min(maxColW, Math.max(minColW, Math.ceil(w)))
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

  /** 学生行的部件（校徽/毛笔字处理完毕，不换行） */
  const partsOf = (s: StudentEntry): Omit<StudentLineParts, 'placeLines' | 'ownLine'> => {
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
      const maxW = maxColW - badgeW - 8
      const natW = sizes.place * CALLI_RATIO * raw.scale * aspect
      const sizeScale = natW > maxW ? raw.scale * (maxW / natW) : raw.scale
      calli = { dataUrl: raw.dataUrl, aspect, sizeScale }
    }
    const place = calli
      ? parts.place.includes(' · ')
        ? parts.place.slice(parts.place.indexOf(' · '))
        : ''
      : parts.place
    return { ...parts, place, badge, badgeUrl, calli }
  }

  /** 按指定列宽重算一个省的换行结果与行数/行高倍率 */
  const wrapAt = (item: SideItem, w: number) => {
    item.wrapped = item.parts.map((p) =>
      wrapStudentLine(p, { person: sizes.person, place: sizes.place }, options?.measure, w),
    )
    item.rowCount = item.wrapped.reduce((n, ln) => n + studentRowCount(ln), 0)
    item.rowBoost = item.wrapped.reduce((b, ln) => Math.max(b, studentRowBoost(ln, sizes.place)), 1)
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
    /** 同校合并：按大学分组（键 = trim 后校名），组内保持当前顺序；
        组间顺序——自动排序省按组内最优软科排名、手动省按首次出现顺序 */
    let parts: Array<Omit<StudentLineParts, 'placeLines' | 'ownLine'>>
    if (options?.mergeSameSchool) {
      const byUni = new Map<string, StudentEntry[]>()
      for (const s of ordered) {
        const key = s.university.trim()
        const list = byUni.get(key)
        if (list) list.push(s)
        else byUni.set(key, [s])
      }
      let groups2 = [...byUni.values()]
      if (uniInfo && !options?.manualProvinces?.has(province)) {
        const bestRank = (g: StudentEntry[]) => Math.min(...g.map((m) => rankOf(m)))
        groups2 = [...groups2].sort((a, b) => bestRank(a) - bestRank(b))
      }
      parts = groups2.map((members) => {
        const p = partsOf(members[0])
        if (members.length === 1) return p
        return {
          ...p,
          person: '',
          groupNames: members.map((m) => m.name.trim() || '（未命名）'),
        }
      })
    } else {
      parts = ordered.map(partsOf)
    }
    // 该省最长单行内容宽度（学生行与省份名标题取大者）
    const oneLineW = Math.max(
      textEms(province) * sizes.province,
      ...parts.map((p) => oneLineWidth(p, { person: sizes.person, place: sizes.place }, options?.measure)),
    )
    items.push({
      province,
      students: ordered,
      parts,
      oneLineW,
      rowCount: 0,
      rowBoost: 1,
      wrapped: [],
      rawPts: resolveProvincePoints(ordered, shape.centroid, cityCenters),
      lat: shape.centroid[1],
      lng: shape.centroid[0],
    })
  }

  if (items.length === 0) {
    const geom = buildGeom(EMPTY_SIDE_W * 2 + MAP_W, EMPTY_SIDE_W)
    return {
      left: [],
      right: [],
      svgHeight: Math.max(
        TOP + geom.mapH + BOTTOM + Math.max(options?.reserveLeftBottom ?? 0, options?.reserveRightBottom ?? 0),
        120,
      ),
      scale: 1,
      geom,
      maxColHeight1: 0,
    }
  }

  /** 西南空白区候选省份（西藏/云南）：优先放入主图左下空白区，不参与左右分列 */
  const swItems = items.filter((i) => SW_PROVINCES.has(i.province))
  const mainland = items.filter((i) => !SW_PROVINCES.has(i.province))
  /** 卡片背景开启时，子列间距与侧边留白需要把卡片内边距算进去 */
  const colGap = options?.cardBg === false ? COL2_GAP : COL2_GAP_CARD
  const sidePad = options?.cardBg === false ? SIDE_PAD : SIDE_PAD_CARD

  /** 把一侧的省份块按行数权重连续切分为 count 个子列（两列模式时左右负载均衡） */
  function splitSide(list: SideItem[], count: number): SideItem[][] {
    if (count <= 1 || list.length <= 1) return [list]
    const total = list.reduce((s, i) => s + i.rowCount + HEADER_WEIGHT, 0)
    const target = total / count
    const cols: SideItem[][] = []
    let cur: SideItem[] = []
    let acc = 0
    for (const item of list) {
      const w = item.rowCount + HEADER_WEIGHT
      // 当前子列已过半且还有子列可分时，切到下一子列
      if (cur.length > 0 && acc + w / 2 > target && cols.length < count - 1) {
        cols.push(cur)
        cur = []
        acc = 0
      }
      cur.push(item)
      acc += w
    }
    cols.push(cur)
    return cols.filter((c) => c.length > 0)
  }

  /** 某一（子）列在指定档位下的总高度（省份名/学生行分别按各自字号比例缩放，换行与图片行加高已计入） */
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

  /**
   * 组装一次布局：pool 为参与左右分列的省份；swActive 时尝试把西南候选（西藏/云南）
   * 放进主图左下空白区。西南区放不下时返回 null，调用方回退为全部参与左右分列。
   */
  function assemble(pool: SideItem[], swActive: boolean): LabelLayout | null {
    let geom: MapGeom
    let sharedScale = 1
    let maxColHeight1 = 0
    let lBlocks: LabelBlock[] = []
    let rBlocks: LabelBlock[] = []
    let lBottom = 0
    let rBottom = 0

    const projectAll = (g: MapGeom) => {
      for (const i of items) {
        i.cityPts = i.rawPts.map(([lng, lat]) => {
          const [x, y] = g.project(lng, lat)
          return { x, y }
        })
      }
    }

    /**
     * 构建一个子列的标注块。卡片包围盒 = 文字区外扩 CARD_PAD；
     * 引线接入点为卡片朝向地图一侧的边缘中点，保证引线不穿卡片。
     */
    const buildColumn = (
      list: SideItem[],
      side: 'left' | 'right',
      anchorX: number,
      colW: number,
    ): { blocks: LabelBlock[]; bottom: number } => {
      if (list.length === 0) return { blocks: [], bottom: 0 }
      const scale = sharedScale
      const headerH = BASE_HEADER_H * scale * provPct
      const gap = BASE_GAP * scale
      const headerSize = BASE_HEADER * scale * provPct
      const personSize = BASE_LINE * scale * personPct
      const placeSize = BASE_LINE * scale * placePct
      const cardX = side === 'left' ? anchorX - colW - CARD_PAD_X : anchorX - CARD_PAD_X
      const cardW = colW + CARD_PAD_X * 2
      const edgeX = side === 'left' ? anchorX + CARD_PAD_X : anchorX - CARD_PAD_X

      let y = TOP + 4
      const blocks = list.map((i): LabelBlock => {
        // 块级行高：含毛笔字图片的块整行加高（rowBoost），避免图片压住相邻行
        const lineH = BASE_LINE_H * scale * linePct * i.rowBoost
        const h = headerH + i.rowCount * lineH
        const canvasPts = i.cityPts ?? [{ x: 0, y: 0 }]
        const cx = canvasPts.reduce((s, p) => s + p.x, 0) / canvasPts.length
        const cy = canvasPts.reduce((s, p) => s + p.y, 0) / canvasPts.length
        const block: LabelBlock = {
          province: i.province,
          // 长校名已换行（不缩小、不省略），行数计入块高
          lines: i.wrapped,
          anchorX,
          textAnchor: side === 'left' ? 'end' : 'start',
          headerBaseline: y + headerH - 8 * scale,
          firstLineBaseline: y + headerH + lineH * 0.72,
          lineH,
          headerSize,
          personSize,
          placeSize,
          centerY: y + h / 2,
          edgeX,
          centroidX: cx,
          centroidY: cy,
          cityPoints: canvasPts,
          cardX,
          cardY: y - CARD_PAD_Y,
          cardW,
          cardH: h + CARD_PAD_Y * 2,
        }
        y += h + gap
        return block
      })
      return { blocks, bottom: y - gap }
    }

    /** 构建一侧（1 或 2 个子列）：内侧列贴地图，外侧列在其外 */
    const buildSide = (cols: SideItem[][], widths: number[], side: 'left' | 'right'): { blocks: LabelBlock[]; bottom: number } => {
      if (cols.length === 0) return { blocks: [], bottom: 0 }
      // 子列锚点：内侧列贴地图边；外侧列在其外（左列右对齐、右列左对齐）
      const anchors =
        side === 'left'
          ? cols.length === 1
            ? [geom.x0 - 16]
            : [geom.x0 - 16 - widths[1] - colGap, geom.x0 - 16]
          : cols.length === 1
            ? [geom.x1 + 16]
            : [geom.x1 + 16, geom.x1 + 16 + widths[0] + colGap]
      // 左列：外侧子列放前半（偏北）省份、内侧放后半，引线更少交叉；右列反之
      const built = cols.map((c, idx) => buildColumn(c, side, anchors[idx], widths[idx]))
      return {
        blocks: built.flatMap((b) => b.blocks),
        bottom: Math.max(...built.map((b) => b.bottom)),
      }
    }

    if (pool.length > 0) {
      // 第一次换行用全体最宽内容的档位值（左右分列的负载均衡需要行数）
      const provisionalW = clampW(Math.max(...pool.map((i) => i.oneLineW)))
      for (const i of pool) wrapAt(i, provisionalW)

      // 按经度排序后连续切分，使左右两列"总行数"（含标题权重）最接近均分；
      // 西部省份进左列、东部进右列，避免引线横跨整幅地图
      const byLng = [...pool].sort((a, b) => a.lng - b.lng)
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

      const leftCols = splitSide(left, columnsPerSide)
      const rightCols = splitSide(right, columnsPerSide)

      // 每个子列的最终列宽：按子列内最长单行内容动态界定；与临时宽度不同时重排换行
      const colWidth = (col: SideItem[]): number => {
        const w = clampW(Math.max(...col.map((i) => i.oneLineW)))
        if (w !== provisionalW) for (const i of col) wrapAt(i, w)
        return w
      }
      const leftWidths = leftCols.map(colWidth)
      const rightWidths = rightCols.map(colWidth)

      /** 一侧的标注区总宽：文字宽之和 + 子列间距 + 固定留白（空侧取窄边距） */
      const sideWidth = (cols: SideItem[][], widths: number[]): number =>
        cols.length === 0 || (cols.length === 1 && cols[0].length === 0)
          ? EMPTY_SIDE_W
          : widths.reduce((a, b) => a + b, 0) + colGap * (widths.length - 1) + sidePad

      geom = buildGeom(sideWidth(leftCols, leftWidths) + MAP_W + sideWidth(rightCols, rightWidths), sideWidth(leftCols, leftWidths))
      projectAll(geom)

      const allCols = [...leftCols, ...rightCols]
      // 各（子）列共享同一可用高度：先求各自最低档所需高度，取大者与列最小高度比较，
      // 这样人少的列在加高的画布上能用更大的字号档位
      const floorNeed = Math.max(0, ...allCols.map((c) => heightAt(c, MIN_SCALE)))
      const colTarget = Math.max(geom.mapH, COL_MIN, floorNeed)
      const pickScale = (list: SideItem[]): number => {
        for (const level of SCALE_LEVELS) {
          if (heightAt(list, level) <= colTarget) return level
        }
        return MIN_SCALE
      }
      /** 全部（子）列共享同一缩放档（取所需较小值），保证所有列字号完全一致 */
      sharedScale = Math.min(...allCols.map((c) => pickScale(c)), 1)
      maxColHeight1 = Math.max(0, ...allCols.map((c) => heightAt(c, 1)))

      const l = buildSide(leftCols, leftWidths, 'left')
      const r = buildSide(rightCols, rightWidths, 'right')
      lBlocks = l.blocks
      rBlocks = r.blocks
      lBottom = l.bottom
      rBottom = r.bottom
    } else {
      geom = buildGeom(EMPTY_SIDE_W * 2 + MAP_W, EMPTY_SIDE_W)
      projectAll(geom)
      sharedScale = 1
    }

    /** 西南空白区：西藏/云南块横向依次排放在主图左下（文字左对齐，引线接卡片顶边中点） */
    let swBlocks: LabelBlock[] = []
    if (swActive && swItems.length > 0) {
      const scale = sharedScale
      const headerH = BASE_HEADER_H * scale * provPct
      const headerSize = BASE_HEADER * scale * provPct
      const personSize = BASE_LINE * scale * personPct
      const placeSize = BASE_LINE * scale * placePct
      const swW = clampW(Math.max(...swItems.map((i) => i.oneLineW)))
      for (const i of swItems) wrapAt(i, swW)
      const zoneY = TOP + geom.mapH * 0.68
      const zoneBottom = TOP + geom.mapH - 12
      const zoneRight = geom.x0 + MAP_W * 0.62
      let x = geom.x0 + 14 + CARD_PAD_X
      let y = zoneY
      let rowMaxH = 0
      let overflow = false
      for (const i of swItems) {
        const lineH = BASE_LINE_H * scale * linePct * i.rowBoost
        const h = headerH + i.rowCount * lineH
        const cardH = h + CARD_PAD_Y * 2
        const cardW = swW + CARD_PAD_X * 2
        if (x - CARD_PAD_X + cardW > zoneRight && x > geom.x0 + 14 + CARD_PAD_X) {
          // 横向放不下则换下一排
          y += rowMaxH + 10
          x = geom.x0 + 14 + CARD_PAD_X
          rowMaxH = 0
        }
        if (y + cardH > zoneBottom) {
          overflow = true
          break
        }
        const canvasPts = i.cityPts ?? [{ x: 0, y: 0 }]
        const cx = canvasPts.reduce((s, p) => s + p.x, 0) / canvasPts.length
        const cy = canvasPts.reduce((s, p) => s + p.y, 0) / canvasPts.length
        const cardX = x - CARD_PAD_X
        const cardY = y - CARD_PAD_Y
        swBlocks.push({
          province: i.province,
          lines: i.wrapped,
          anchorX: x,
          textAnchor: 'start',
          headerBaseline: y + headerH - 8 * scale,
          firstLineBaseline: y + headerH + lineH * 0.72,
          lineH,
          headerSize,
          personSize,
          placeSize,
          // 引线接入点：卡片顶边中点（定位点在卡片上方）
          centerY: cardY,
          edgeX: cardX + cardW / 2,
          centroidX: cx,
          centroidY: cy,
          cityPoints: canvasPts,
          cardX,
          cardY,
          cardW,
          cardH,
        })
        x += cardW + 14
        rowMaxH = Math.max(rowMaxH, cardH)
      }
      if (overflow) return null
    }

    // 超出列高时加高画布（纵向扩展），保证最低档字号下依然不重叠；
    // 左右下角的覆盖层（老师名单/未定位提示）预留区同样通过加高画布兑现。
    // 注意：预留必须同时加到「地图本体」这一项上——学生较少、地图是最高元素时，
    // 若只加在标注列项上，画布不会加高，覆盖层就会直接压在地图与学生标注上。
    const reserveL = options?.reserveLeftBottom ?? 0
    const reserveR = options?.reserveRightBottom ?? 0
    const svgHeight = Math.max(
      TOP + geom.mapH + BOTTOM + Math.max(reserveL, reserveR),
      lBottom + BOTTOM + reserveL,
      rBottom + BOTTOM + reserveR,
      120,
    )
    return { left: [...lBlocks, ...swBlocks], right: rBlocks, svgHeight, scale: sharedScale, geom, maxColHeight1 }
  }

  // 优先尝试西南空白区；放不下（块太高/太宽）时回退为全部参与左右分列
  if (swItems.length > 0) {
    const withSw = assemble(mainland, true)
    if (withSw) return withSw
  }
  return assemble(items, false) as LabelLayout
}

/** 排版自适应推荐结果 */
export interface FitRecommendation {
  /** 建议切换为每侧两列（当前为一列且两列明显更宽松时为 true） */
  twoColumns: boolean
  /** 推荐字号（px）：按当前所需缩放档换算，应用后内容可按原字号比例放下 */
  sizes: { province: number; person: number; place: number }
  /** 当前设置下的实际缩放档（<1 表示画布被迫整体缩小了字号） */
  currentScale: number
}

/** 字号可调范围（与录入面板档位一致） */
const FIT_RANGE = {
  province: { min: 10, max: 28 },
  person: { min: 9, max: 22 },
  place: { min: 9, max: 22 },
} as const

/**
 * 标注排版自适应推荐：
 * - 当前字号能按原样放下（scale = 1）→ 返回 null，不打扰；
 * - 能一列绝不分两列：仅当单列内容在用户字号下的所需高度超过地图纵向高度 1.1 倍时，
 *   才考虑推荐两列（且两列确实明显更宽松）；
 * - 否则只推荐缩小后的字号（按当前缩放档换算到 px，向下取整并夹在可调范围内）。
 * 是否采纳由用户决定（调用方弹提示）。
 */
export function recommendLabelFit(
  groups: Map<string, StudentEntry[]>,
  options?: LabelLayoutOptions,
): FitRecommendation | null {
  if (groups.size === 0) return null
  const sizes = options?.sizes ?? { province: 16, person: 13, place: 13 }
  const cols = options?.columnsPerSide ?? 1
  const current = computeLabelLayout(groups, undefined, { ...options, columnsPerSide: cols })
  if (current.scale >= 0.999) return null

  const clamp = (v: number, range: { min: number; max: number }) =>
    Math.min(range.max, Math.max(range.min, v))
  const scaledSizes = (s: number) => ({
    province: clamp(Math.floor(sizes.province * s), FIT_RANGE.province),
    person: clamp(Math.floor(sizes.person * s), FIT_RANGE.person),
    place: clamp(Math.floor(sizes.place * s), FIT_RANGE.place),
  })

  if (cols === 1) {
    // 单列所需高度（用户字号原样）超过地图高度 1.1 倍才建议分两列
    const overflowRatio = current.geom.mapH > 0 ? current.maxColHeight1 / current.geom.mapH : 0
    if (overflowRatio > 1.1) {
      const two = computeLabelLayout(groups, undefined, { ...options, columnsPerSide: 2 })
      if (two.scale > current.scale + 0.02) {
        return {
          twoColumns: true,
          sizes: two.scale >= 0.999 ? { ...sizes } : scaledSizes(two.scale),
          currentScale: current.scale,
        }
      }
    }
  }

  const sizes2 = scaledSizes(current.scale)
  // 推荐值与当前完全一致（字号已到下限）且无列数建议时不打扰
  if (
    sizes2.province === sizes.province &&
    sizes2.person === sizes.person &&
    sizes2.place === sizes.place
  ) {
    return null
  }
  return { twoColumns: false, sizes: sizes2, currentScale: current.scale }
}

/**
 * 「推荐设置」字号建议（字体设置面板按钮）：
 * 以地图纵向高度为预算，算出在当前人数/列数下能放下的最美观字号——
 * 当前字号偏大时建议缩小，偏小时（空间充裕）建议放大，夹在可调范围内。
 * 与当前设置一致时返回 null（无需打扰）。
 */
export function recommendFontSizes(
  groups: Map<string, StudentEntry[]>,
  options?: LabelLayoutOptions,
): { sizes: { province: number; person: number; place: number }; direction: 'up' | 'down' } | null {
  if (groups.size === 0) return null
  const sizes = options?.sizes ?? { province: 16, person: 13, place: 13 }
  const layout = computeLabelLayout(groups, undefined, options)
  const target = Math.max(layout.geom.mapH, 560)
  const need = layout.maxColHeight1
  if (need <= 0) return null
  // 高度与字号近似线性：factor > 1 表示有富余可放大，< 1 表示需缩小
  const factor = target / need
  const clamp = (v: number, range: { min: number; max: number }) =>
    Math.min(range.max, Math.max(range.min, v))
  const rec = {
    province: clamp(Math.floor(sizes.province * factor), FIT_RANGE.province),
    person: clamp(Math.floor(sizes.person * factor), FIT_RANGE.person),
    place: clamp(Math.floor(sizes.place * factor), FIT_RANGE.place),
  }
  if (rec.province === sizes.province && rec.person === sizes.person && rec.place === sizes.place) {
    return null
  }
  return { sizes: rec, direction: factor >= 1 ? 'up' : 'down' }
}
