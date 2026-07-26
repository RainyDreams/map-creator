import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import { schoolBadgeUrl } from '@/utils/universities'
import {
  BADGE_GAP,
  BADGE_RATIO,
  CALLI_RATIO,
  CARD_PAD_X,
  GROUP_GAP,
  NAME_PLACE_GAP,
  calliSize,
  studentRowCount,
  textEms,
  type LabelBlock,
  type StudentLineParts,
} from './labels'

export interface LabelColumnsProps {
  left: LabelBlock[]
  right: LabelBlock[]
  /** 拖动实时偏移上报（null = 拖动结束）：驱动上层画布 viewBox 自动扩大 */
  onLiveDrag?: (drag: { province: string; dx: number; dy: number } | null) => void
  /** 调整大小实时上报（null = 结束）：驱动上层画布 viewBox 随卡片尺寸扩缩；
      sx/sy = 从西/北边缘拖时卡片的实时平移量 */
  onLiveResize?: (
    resize: { province: string; w: number; h: number; sx?: number; sy?: number } | null,
  ) => void
  /** 卡片 z 序（省份 → 层级序号，越大越靠上）：点击/拖动卡片时自动上移，避免被其他卡片盖住 */
  zRanks?: Record<string, number>
  /** 卡片被点击/选中时上报：上层为其分配更高的 z 序 */
  onCardActivate?: (province: string) => void
}

/**
 * 左右两列标注块 + 引线。
 * 引线为质心 → 标注块边缘的三次贝塞尔曲线（主题 leaderLine 色、1px、柔和虚线），
 * 两个控制点取在两端点水平中点处，弧线自然过渡、不穿标注块。
 *
 * 学生行排版：`姓名[校徽]大学 · 城市`——姓名/校徽/大学之间无间隙；
 * 超长校名由 labels.ts 预先换行（placeLines），此处逐行渲染：
 * 首行与姓名同行，续行与大学起点对齐；绝不省略号截断、不缩小单行字号。
 * 校徽渲染在大学段第一行文字前（本站代理地址，同源无跨域污染，可随导出进 PNG）。
 *
 * 省份块可拖动（v1.13）：电脑端直接按住拖动；移动端先点选中（出现虚线框）再拖动。
 * 偏移量持久化在 data.provinceOffsets（viewBox 单位），块在列中的占位不变，
 * 卡片/文字/引线端点一起平移；拖回原位（偏移≈0）时自动清除记录。
 */
export function LabelColumns({ left, right, onLiveDrag, onLiveResize, zRanks, onCardActivate }: LabelColumnsProps) {
  const { theme, fontSlots, customFonts, data, setData } = useMapData()
  const provinceFont = slotFontFamily('province', fontSlots, customFonts)
  const personFont = slotFontFamily('person', fontSlots, customFonts)
  const placeFont = slotFontFamily('place', fontSlots, customFonts)

  /* ---------------- 省份块拖动 ---------------- */
  const rootRef = useRef<SVGGElement>(null)
  /** 移动端「先点选中」的省份（选中后才可拖） */
  const [selectedProv, setSelectedProv] = useState<string | null>(null)
  /** 拖动中的实时偏移（提交前不落库） */
  const [dragState, setDragState] = useState<{ province: string; dx: number; dy: number } | null>(null)
  /** 调整大小中的实时尺寸与位移（提交前不落库）；sx/sy = 从西/北边缘拖时卡片的平移量（保持对侧边缘不动） */
  const [resizeState, setResizeState] = useState<{
    province: string
    w: number
    h: number
    sx: number
    sy: number
  } | null>(null)
  const resizeRef = useRef<{
    province: string
    pointerId: number
    startClientX: number
    startClientY: number
    scaleX: number
    scaleY: number
    baseW: number
    baseH: number
    /** 内容自然尺寸（最小值，不允许缩到裁掉文字） */
    natW: number
    natH: number
    /** 拖动方向：x/y 各取 -1（西/北边缘）| 0（该轴不动）| 1（东/南边缘） */
    mx: -1 | 0 | 1
    my: -1 | 0 | 1
    /** 按下时的持久化偏移：西/北边缘调整产生的位移在落库时并入 provinceOffsets */
    baseOffX: number
    baseOffY: number
  } | null>(null)

  /** 卡片有效宽/高：max(内容自然尺寸, 手动覆盖/实时调整值)——只允许放大或缩回自然尺寸 */
  const effW = (b: LabelBlock): number => {
    if (resizeState && resizeState.province === b.province) return Math.max(b.cardW, resizeState.w)
    const o = data.cardSizes[b.province]
    return o ? Math.max(b.cardW, o.w) : b.cardW
  }
  const effH = (b: LabelBlock): number => {
    if (resizeState && resizeState.province === b.province) return Math.max(b.cardH, resizeState.h)
    const o = data.cardSizes[b.province]
    return o ? Math.max(b.cardH, o.h) : b.cardH
  }
  const dragRef = useRef<{
    province: string
    pointerId: number
    startX: number
    startY: number
    /** 按下时的屏幕坐标与 SVG 缩放比：拖动增量按固定坐标系换算，避免 viewBox 扩缩反馈 */
    startClientX: number
    startClientY: number
    scaleX: number
    scaleY: number
    baseDx: number
    baseDy: number
  } | null>(null)
  /** 是否触屏设备（决定先选中再拖，还是直接拖） */
  const isCoarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  )
  /** 移动端拖动卡顿检测：pointermove 间隔采样（last=0 表示未在拖动/已重置） */
  const jankRef = useRef<{ last: number; samples: number[]; fired: boolean }>({
    last: 0,
    samples: [],
    fired: false,
  })

  /** 监听画布级「清除选中」事件（点空白处 / 导出前派发）：虚线框消失 */
  useEffect(() => {
    const canvas = rootRef.current?.ownerSVGElement?.closest('[data-testid="map-canvas"]')
    if (!canvas) return
    const handler = () => setSelectedProv(null)
    canvas.addEventListener('cf-clear-selection', handler)
    return () => canvas.removeEventListener('cf-clear-selection', handler)
  }, [])

  const allBlocks = [...left, ...right]
  /** 对齐吸附阈值（viewBox 单位 ≈ 设计 px）：6px——"很近"但可实操命中，
      紧贴与留间隙目标相距 SNAP_GAP，6×2=12 ≤ SNAP_GAP 互不干扰 */
  const SNAP_PX = 6
  /** 相邻卡片留间隙吸附的间隙大小（viewBox 单位）：8 = 小间隙，接近自动布局卡片间距 */
  const SNAP_GAP = 8
  /** 拖动时激活的辅助对齐线（x = 垂直线位置，y = 水平线位置；仅吸附时显示） */
  const [guides, setGuides] = useState<{ x?: number; y?: number } | null>(null)
  /** 辅助线绘制范围：所有卡片包围盒（含手动尺寸覆盖）的边界，辅助线只在该范围内绘制 */
  const guideBounds = useMemo(() => {
    if (allBlocks.length === 0) return null
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const b of allBlocks) {
      minX = Math.min(minX, b.cardX)
      maxX = Math.max(maxX, b.cardX + effW(b))
      minY = Math.min(minY, b.cardY)
      maxY = Math.max(maxY, b.cardY + effH(b))
    }
    return { minX, maxX, minY, maxY }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, right, data.cardSizes, resizeState])

  /** 某省份当前生效的偏移：拖动中用实时值，否则用持久化值；
      一列/两列（自动布局）下偏移不生效——且切换过去时已被重置（见 FontPanel），
      这里的 gating 只是分享链接/导入数据等非常规路径的兜底。
      不做横向限幅：画布边界随卡片位置自动扩缩（见 ChinaMap 的 viewBox 计算），
      卡片可以拖到任何位置，画布始终贴着内容走 */
  const offsetOf = (prov: string): { dx: number; dy: number } => {
    if (dragState && dragState.province === prov) return { dx: dragState.dx, dy: dragState.dy }
    if (!data.customPosition) return { dx: 0, dy: 0 }
    return data.provinceOffsets[prov] ?? { dx: 0, dy: 0 }
  }

  /** 屏幕坐标 → SVG viewBox 坐标 */
  const toSvgPoint = (e: React.PointerEvent): { x: number; y: number } | null => {
    const svg = rootRef.current?.ownerSVGElement
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const loc = pt.matrixTransform(ctm.inverse())
    return { x: loc.x, y: loc.y }
  }

  const onBlockPointerDown = (e: React.PointerEvent, prov: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    // 点击/按住即把卡片提到最上层，避免被其他卡片盖住
    onCardActivate?.(prov)
    // 选中态（PC 与移动端一致）：选中后显示右下角调整大小手柄；
    // 移动端第一次点击只选中（出现虚线框），选中后才进入拖动
    if (isCoarse && selectedProv !== prov) {
      setSelectedProv(prov)
      return
    }
    setSelectedProv(prov)
    const loc = toSvgPoint(e)
    if (!loc) return
    const base = offsetOf(prov)
    // 记录按下时的屏幕坐标与缩放比：拖动增量用「屏幕位移 ÷ 按下时缩放」计算——
    // 拖动中画布 viewBox 随卡片外扩会改变缩放，若每帧重新换算坐标系，
    // 位移会被反馈放大（拖 60px 屏幕距离落库变成 228 设计 px 的漂移）
    const ctm = rootRef.current?.ownerSVGElement?.getScreenCTM()
    dragRef.current = {
      province: prov,
      pointerId: e.pointerId,
      startX: loc.x,
      startY: loc.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      scaleX: ctm?.a || 1,
      scaleY: ctm?.d || 1,
      baseDx: base.dx,
      baseDy: base.dy,
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onBlockPointerMove = (e: React.PointerEvent, prov: string) => {
    const d = dragRef.current
    if (!d || d.province !== prov || d.pointerId !== e.pointerId) return
    // 移动端拖动卡顿检测：采样 pointermove 间隔，连续 8 帧平均间隔 >34ms（约 <30fps）
    // 视为卡顿，派发一次全局事件让页面顶部提示「推荐到电脑端进行」（每次拖动会话只评一次）
    if (isCoarse && !jankRef.current.fired) {
      const now = performance.now()
      const j = jankRef.current
      if (j.last > 0) {
        j.samples.push(now - j.last)
        if (j.samples.length > 12) j.samples.shift()
        if (j.samples.length >= 8) {
          const avg = j.samples.reduce((a, b) => a + b, 0) / j.samples.length
          if (avg > 34) {
            j.fired = true
            window.dispatchEvent(new CustomEvent('cf-drag-jank'))
          }
        }
      }
      j.last = now
    }
    // 固定坐标系换算：屏幕位移 ÷ 按下时缩放（不受拖动中 viewBox 扩缩影响）
    let dx = d.baseDx + (e.clientX - d.startClientX) / d.scaleX
    let dy = d.baseDy + (e.clientY - d.startClientY) / d.scaleY

    // 对齐吸附 + 辅助线预览：GUIDE_PX 内显示辅助线引导，SNAP_PX 内吸附到位
    const GUIDE_PX = 16
    const block = allBlocks.find((b) => b.province === prov)
    let guideX: number | undefined
    let guideY: number | undefined
    if (block) {
      // X 吸附只看同侧列（左列卡片不会去对齐右列的左右缘）
      const sidePeers = (left.some((b) => b.province === prov) ? left : right).filter(
        (b) => b.province !== prov,
      )
      // Y 吸附看左右两列的全部卡片：顶/中/底横排对齐常常需要跨列参照
      const allPeers = allBlocks.filter((b) => b.province !== prov)
      // X 吸附/预览：被拖卡片的 左缘/垂直中线/右缘 对到同侧卡片的 左/中/右缘，
      // 以及「回到列标准位置」（dx=0）；GUIDE_PX 内出垂直辅助线，SNAP_PX 内吸附
      const bw = effW(block)
      const dL = block.cardX + dx
      const dCX = block.cardX + bw / 2 + dx
      const dR = block.cardX + bw + dx
      type SnapHit = { target: number; edge: number; dist: number }
      const xHits: SnapHit[] = []
      const considerX = (target: number) => {
        for (const ed of [dL, dCX, dR]) {
          const dist = Math.abs(ed - target)
          if (dist <= GUIDE_PX) xHits.push({ target, edge: ed, dist })
        }
      }
      // 列标准位置（home）：三缘各自归位等价于 dx=0
      considerX(block.cardX)
      considerX(block.cardX + bw / 2)
      considerX(block.cardX + bw)
      for (const o of sidePeers) {
        const oo = offsetOf(o.province)
        const ow = effW(o)
        considerX(o.cardX + oo.dx)
        considerX(o.cardX + ow / 2 + oo.dx)
        considerX(o.cardX + ow + oo.dx)
      }
      const nearestX = xHits.length > 0 ? xHits.reduce((a, b) => (b.dist < a.dist ? b : a)) : null
      if (nearestX) {
        guideX = nearestX.target
        if (nearestX.dist <= SNAP_PX) {
          dx += nearestX.target - nearestX.edge
        }
      }
      // Y 吸附/预览：遍历两侧全部卡片，找最近的吸附目标
      const bh = effH(block)
      const dTop = block.cardY + dy
      const dCen = block.cardY + bh / 2 + dy
      const dBot = block.cardY + bh + dy
      let nearest: { target: number; edge: number; dist: number } | null = null
      for (const o of allPeers) {
        const oo = offsetOf(o.province)
        const oh = effH(o)
        const oTop = o.cardY + oo.dy
        const oCen = o.cardY + oh / 2 + oo.dy
        const oBot = o.cardY + oh + oo.dy
        // 目标：对齐(顶/中/底) + 紧贴(0间隙) + 留间隙(SNAP_GAP)
        const ts = [oTop, oCen, oBot, oBot + SNAP_GAP, oTop - SNAP_GAP]
        for (const ed of [dTop, dCen, dBot]) {
          for (const t of ts) {
            const dist = Math.abs(ed - t)
            if (dist <= GUIDE_PX && (!nearest || dist < nearest.dist)) {
              nearest = { target: t, edge: ed, dist }
            }
          }
        }
      }
      if (nearest) {
        guideY = nearest.target
        if (nearest.dist <= SNAP_PX) {
          dy += nearest.target - nearest.edge
        }
      }
    }

    setGuides(guideX !== undefined || guideY !== undefined ? { x: guideX, y: guideY } : null)
    const next = { province: prov, dx, dy }
    setDragState(next)
    // 上报实时偏移：画布 viewBox 随拖动自动扩大，卡片出界不被裁剪/不被标题盖住
    onLiveDrag?.(next)
  }

  const finishDrag = (e: React.PointerEvent, prov: string) => {
    const d = dragRef.current
    if (!d || d.province !== prov || d.pointerId !== e.pointerId) return
    dragRef.current = null
    // 卡顿采样重置：下一次拖动重新计时（fired 标志保留，一次会话只提示一次）
    jankRef.current.last = 0
    jankRef.current.samples = []
    onLiveDrag?.(null)
    setGuides(null)
    setDragState((cur) => {
      if (cur && cur.province === prov) {
        // 偏移幅值兜底 ±600（viewBox 单位），横向不再限幅——画布随卡片自动扩缩
        const dx = Math.min(600, Math.max(-600, Math.round(cur.dx)))
        const dy = Math.min(600, Math.max(-600, Math.round(cur.dy)))
        setData((prev) => {
          // 从自动布局拖动切入自定义时，丢弃历史偏移（可能与当前布局不符），
          // 只保留本次拖动卡片的偏移——每次自定义都从当前所见状态开始；
          // 已处于自定义模式时保留其他卡片的偏移（那才是「当前状态」）
          const next = prev.customPosition ? { ...prev.provinceOffsets } : {}
          if (dx === 0 && dy === 0) delete next[prov]
          else next[prov] = { dx, dy }
          // 拖动即意味着用户要自定义位置：自动切到自定义位置模式（偏移才会生效）
          return { ...prev, provinceOffsets: next, customPosition: true }
        })
      }
      return null
    })
  }

  /* ---------------- 卡片调整大小（选中后四边中点 + 四角共 8 个手柄） ---------------- */
  const onResizePointerDown = (
    e: React.PointerEvent,
    b: LabelBlock,
    mx: -1 | 0 | 1,
    my: -1 | 0 | 1,
  ) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    onCardActivate?.(b.province)
    const ctm = rootRef.current?.ownerSVGElement?.getScreenCTM()
    const off = offsetOf(b.province)
    resizeRef.current = {
      province: b.province,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      scaleX: ctm?.a || 1,
      scaleY: ctm?.d || 1,
      baseW: effW(b),
      baseH: effH(b),
      natW: b.cardW,
      natH: b.cardH,
      mx,
      my,
      baseOffX: off.dx,
      baseOffY: off.dy,
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onResizePointerMove = (e: React.PointerEvent, prov: string) => {
    const r = resizeRef.current
    if (!r || r.province !== prov || r.pointerId !== e.pointerId) return
    // 固定坐标系换算（与拖动一致）：屏幕位移 ÷ 按下时缩放，不受 viewBox 扩缩反馈影响
    const dX = (e.clientX - r.startClientX) / r.scaleX
    const dY = (e.clientY - r.startClientY) / r.scaleY
    let w = r.baseW
    let h = r.baseH
    let sx = 0
    let sy = 0
    if (r.mx === 1) w = Math.min(r.natW + 600, Math.max(r.natW, r.baseW + dX))
    else if (r.mx === -1) {
      w = Math.min(r.natW + 600, Math.max(r.natW, r.baseW - dX))
      sx = r.baseW - w // 西边缘移动：卡片右缘保持不动
    }
    if (r.my === 1) h = Math.min(r.natH + 600, Math.max(r.natH, r.baseH + dY))
    else if (r.my === -1) {
      h = Math.min(r.natH + 600, Math.max(r.natH, r.baseH - dY))
      sy = r.baseH - h // 北边缘移动：卡片下缘保持不动
    }
    const next = { province: prov, w, h, sx, sy }
    setResizeState(next)
    onLiveResize?.(next)
  }

  const finishResize = (e: React.PointerEvent, prov: string) => {
    const r = resizeRef.current
    if (!r || r.province !== prov || r.pointerId !== e.pointerId) return
    resizeRef.current = null
    onLiveResize?.(null)
    setResizeState((cur) => {
      if (cur && cur.province === prov) {
        const w = Math.round(cur.w)
        const h = Math.round(cur.h)
        const ndx = Math.round(r.baseOffX + cur.sx)
        const ndy = Math.round(r.baseOffY + cur.sy)
        setData((prev) => {
          const next = { ...prev.cardSizes }
          // 缩回自然尺寸（±2px 内）时清除覆盖记录，回到完全自动
          if (w <= r.natW + 2 && h <= r.natH + 2) delete next[prov]
          else next[prov] = { w, h }
          // 从东/南边缘调整且无既有偏移：只改尺寸，不动布局模式
          if (!prev.customPosition && ndx === 0 && ndy === 0) {
            return { ...prev, cardSizes: next }
          }
          // 从西/北边缘调整（或已在自定义模式）：位移并入拖动偏移，自动切自定义位置模式
          const offsets = prev.customPosition ? { ...prev.provinceOffsets } : {}
          if (ndx === 0 && ndy === 0) delete offsets[prov]
          else offsets[prov] = { dx: ndx, dy: ndy }
          return { ...prev, cardSizes: next, provinceOffsets: offsets, customPosition: true }
        })
      }
      return null
    })
  }

  /**
   * 文字真实宽度测量（canvas measureText + 实际字体栈）。
   * 右对齐列的校徽/姓名定位必须精确——按 em 估算会把「 · 」等窄字符算宽，
   * 导致校徽与校名之间出现明显间隙。字体未就绪等异常时回退 em 估算。
   */
  const measureCtx = useMemo(() => document.createElement('canvas').getContext('2d'), [])
  const measureW = (text: string, px: number, family: string): number => {
    if (measureCtx) {
      try {
        measureCtx.font = `${px}px ${family}`
        const w = measureCtx.measureText(text).width
        if (w > 0) return w
      } catch {
        // 回退估算
      }
    }
    return textEms(text) * px
  }

  /** 渲染一个学生行（可能占多行），返回占用行数 */
  function renderStudent(b: LabelBlock, ln: StudentLineParts, rowOffset: number, key: string) {
    const badgeSize = b.placeSize * BADGE_RATIO * (ln.badgeScale ?? b.badgeScale ?? 1)
    // 姓名与其后内容的间隙：有校徽时留 BADGE_GAP 呼吸（校徽与校名无间隙）；
    // 不显示校徽的同学（个人隐藏或全局关闭）姓名与校名之间留 NAME_PLACE_GAP，避免名字挨着校名
    const placeOnOwnLines = ln.ownLine
    const gapAfterName = placeOnOwnLines ? 0 : ln.badge ? BADGE_GAP : NAME_PLACE_GAP
    const badgeSlot = ln.badge ? badgeSize + gapAfterName : placeOnOwnLines ? 0 : gapAfterName
    const badgeRow = placeOnOwnLines ? 1 : 0
    const personW = measureW(ln.person, b.personSize, personFont)
    // 毛笔字图片尺寸（随地点字号与列缩放联动）
    const calli = ln.calli ?? null
    const calliW = calli ? calliSize(calli, b.placeSize).w : 0
    const calliH = calli ? b.placeSize * CALLI_RATIO * calli.sizeScale : 0
    /** 首行文本（大学/城市段第 0 行）宽度 */
    const firstTextW =
      ln.placeLines.length > 0 ? measureW(ln.placeLines[0] ?? '', b.placeSize, placeFont) : 0

    const rows: React.ReactNode[] = []
    // 姓名（仅首行）
    const row0Baseline = b.firstLineBaseline + rowOffset * b.lineH
    if (b.textAnchor === 'start') {
      rows.push(
        <text
          key={`${key}-p`}
          x={b.anchorX}
          y={row0Baseline}
          textAnchor="start"
          fontSize={b.personSize}
          fill={theme.textColor}
          style={{ fontFamily: personFont }}
        >
          {ln.person}
        </text>,
      )
    } else {
      // 右对齐：姓名右端依次让出 文本+图片+校徽 的宽度（各段之间无间隙，姓名与校徽间留 BADGE_GAP）
      const rightW = (placeOnOwnLines ? 0 : firstTextW + (calli ? calliW + 2 : 0)) + badgeSlot
      rows.push(
        <text
          key={`${key}-p`}
          x={b.anchorX - rightW}
          y={row0Baseline}
          textAnchor="end"
          fontSize={b.personSize}
          fill={theme.textColor}
          style={{ fontFamily: personFont }}
        >
          {ln.person}
        </text>,
      )
    }

    // 校徽（在大学段第一行文字/图片前）
    if (ln.badge && ln.uni) {
      const badgeBaseline = b.firstLineBaseline + (rowOffset + badgeRow) * b.lineH
      let badgeX: number
      if (b.textAnchor === 'start') {
        badgeX = b.anchorX + (placeOnOwnLines ? 0 : personW + gapAfterName)
      } else {
        const afterW = firstTextW + (calli ? calliW + 2 : 0)
        badgeX = b.anchorX - afterW - badgeSize
      }
      rows.push(
        <image
          key={`${key}-b`}
          href={ln.badgeUrl ?? schoolBadgeUrl(ln.uni)}
          x={badgeX}
          y={badgeBaseline - badgeSize * 0.86}
          width={badgeSize}
          height={badgeSize}
        />,
      )
    }

    // 毛笔字图片（替代大学文字；校徽后直接跟随，无间隙）
    if (calli) {
      const imgBaseline = b.firstLineBaseline + (rowOffset + badgeRow) * b.lineH
      let imgX: number
      if (b.textAnchor === 'start') {
        imgX = b.anchorX + (placeOnOwnLines ? badgeSlot : personW + badgeSlot)
      } else {
        imgX = b.anchorX - firstTextW - (firstTextW > 0 ? 2 : 0) - calliW
      }
      rows.push(
        <image
          key={`${key}-c`}
          href={calli.dataUrl}
          x={imgX}
          y={imgBaseline - calliH * 0.8}
          width={calliW}
          height={calliH}
          preserveAspectRatio="none"
        />,
      )
    }

    // 大学 · 城市（逐行；续行与大学起点对齐）。有毛笔字图片时此处只剩「· 城市」文本
    ln.placeLines.forEach((seg, r) => {
      if (seg === '') return
      const baseline = b.firstLineBaseline + (rowOffset + r + (placeOnOwnLines ? 1 : 0)) * b.lineH
      let x: number
      if (b.textAnchor === 'start') {
        const lineStart =
          (placeOnOwnLines ? 0 : personW) + badgeSlot + (calli && r === 0 ? calliW + 2 : 0)
        x = b.anchorX + lineStart
      } else {
        x = b.anchorX
      }
      rows.push(
        <text
          key={`${key}-z${r}`}
          x={x}
          y={baseline}
          textAnchor={b.textAnchor}
          fontSize={b.placeSize}
          fill={theme.textColor}
          style={{ fontFamily: placeFont }}
        >
          {seg}
        </text>,
      )
    })

    return { nodes: rows, rows: studentRowCount(ln) }
  }

  /** 渲染一个同校合并单元：姓名一人一行竖排，学校信息（校徽+毛笔字/文字）在右侧垂直居中只显示一次 */
  function renderGroup(b: LabelBlock, ln: StudentLineParts, rowOffset: number, key: string) {
    const names = ln.groupNames ?? []
    const badgeSize = b.placeSize * BADGE_RATIO * (ln.badgeScale ?? b.badgeScale ?? 1)
    const calli = ln.calli ?? null
    const calliW = calli ? calliSize(calli, b.placeSize).w : 0
    const calliH = calli ? b.placeSize * CALLI_RATIO * calli.sizeScale : 0
    const badgeSlot = ln.badge ? badgeSize + BADGE_GAP : 0
    const nameColW = Math.max(0, ...names.map((n) => measureW(n, b.personSize, personFont)))
    const schoolTextW = Math.max(0, ...ln.placeLines.map((t) => measureW(t, b.placeSize, placeFont)))
    const schoolW = badgeSlot + calliW + (calli && schoolTextW > 0 ? 2 : 0) + schoolTextW

    const rows = studentRowCount(ln)
    const schoolRows = Math.max(1, ln.placeLines.length)
    // 学校信息垂直居中于姓名列
    const schoolStart = rowOffset + (rows - schoolRows) / 2

    const nodes: React.ReactNode[] = []
    // 姓名列（一人一行）
    names.forEach((n, idx) => {
      const baseline = b.firstLineBaseline + (rowOffset + idx) * b.lineH
      const x = b.textAnchor === 'start' ? b.anchorX : b.anchorX - schoolW - GROUP_GAP
      nodes.push(
        <text
          key={`${key}-n${idx}`}
          x={x}
          y={baseline}
          textAnchor={b.textAnchor === 'start' ? 'start' : 'end'}
          fontSize={b.personSize}
          fill={theme.textColor}
          style={{ fontFamily: personFont }}
        >
          {n}
        </text>,
      )
    })
    // 学校信息：校徽 → 毛笔字图片 → 文字行
    const schoolX = b.textAnchor === 'start' ? b.anchorX + nameColW + GROUP_GAP : b.anchorX - schoolW
    const firstBaseline = b.firstLineBaseline + schoolStart * b.lineH
    if (ln.badge && ln.uni) {
      nodes.push(
        <image
          key={`${key}-b`}
          href={ln.badgeUrl ?? schoolBadgeUrl(ln.uni)}
          x={schoolX}
          y={firstBaseline - badgeSize * 0.86}
          width={badgeSize}
          height={badgeSize}
        />,
      )
    }
    if (calli) {
      nodes.push(
        <image
          key={`${key}-c`}
          href={calli.dataUrl}
          x={schoolX + badgeSlot}
          y={firstBaseline - calliH * 0.8}
          width={calliW}
          height={calliH}
          preserveAspectRatio="none"
        />,
      )
    }
    ln.placeLines.forEach((seg, r) => {
      if (seg === '') return
      const baseline = b.firstLineBaseline + (schoolStart + r) * b.lineH
      nodes.push(
        <text
          key={`${key}-z${r}`}
          x={schoolX + badgeSlot + (calli && r === 0 ? calliW + 2 : 0)}
          y={baseline}
          textAnchor="start"
          fontSize={b.placeSize}
          fill={theme.textColor}
          style={{ fontFamily: placeFont }}
        >
          {seg}
        </text>,
      )
    })
    return { nodes, rows }
  }

  const showCard = data.labelCardBg
  const cardRx = data.cardRadius
  /** 卡片填充：自定义颜色优先，否则跟随主题页脚底色 */
  const cardFill = data.cardColor !== '' ? data.cardColor : theme.footerBg
  const cardOpacity = data.cardOpacity
  const cardBlur = data.cardBlur

  /** 第二遍渲染按 z 序稳定排序：被点击/拖动过的省份序号更大、绘制更靠后（压在上层）。
      SVG 没有 z-index，绘制顺序即层级顺序 */
  const sortedBlocks = zRanks
    ? allBlocks
        .map((b, i) => ({ b, i }))
        .sort((p, q) => (zRanks[p.b.province] ?? 0) - (zRanks[q.b.province] ?? 0) || p.i - q.i)
        .map((x) => x.b)
    : allBlocks
  return (
    // user-select:none + draggable 禁用：画布上所有文字不可选中、不可触发浏览器原生拖动，防误触
    <g
      ref={rootRef}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
    >
      {/* 卡片羽化滤镜：用户可调模糊半径（0 = 不启用，避免滤镜开销） */}
      {showCard && cardBlur > 0 && (
        <defs>
          <filter id="label-card-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={cardBlur} />
          </filter>
        </defs>
      )}
      {/* 第一遍：全部引线（压在卡片与文字下层——开启卡片背景时，引线被其他省份卡片
          自然遮住，视觉上不再穿过别人的名单）；引线端点 = 卡片包围盒上离省份质心最近的点
          （质心在卡片左侧接左缘、上方接上缘……不一定是左/右缘），随拖动偏移同步平移 */}
      {allBlocks.map((b) => {
        const off = offsetOf(b.province)
        const w = effW(b)
        const h = effH(b)
        // 西/北边缘调整大小时卡片实时平移（保持对侧边缘不动），引线端点跟着走
        const rs = resizeState && resizeState.province === b.province ? resizeState : null
        const ldx = off.dx + (rs?.sx ?? 0)
        const ldy = off.dy + (rs?.sy ?? 0)
        const ex = Math.min(Math.max(b.centroidX, b.cardX + ldx), b.cardX + ldx + w)
        const ey = Math.min(Math.max(b.centroidY, b.cardY + ldy), b.cardY + ldy + h)
        const midX = (b.centroidX + ex) / 2
        const midY = (b.centroidY + ey) / 2
        return (
          <path
            key={`leader-${b.province}`}
            d={`M${b.centroidX},${b.centroidY} C${midX},${b.centroidY} ${midX},${midY} ${ex},${ey}`}
            fill="none"
            stroke={theme.leaderLine}
            strokeWidth={1}
            strokeDasharray="5 4"
            opacity={0.85}
          />
        )
      })}
      {/* 第二遍：卡片背景 + 省份名 + 学生行（整块可拖动：PC 直拖，移动端先点选中再拖；
          按 z 序排序渲染，被点击的卡片压在上层） */}
      {sortedBlocks.map((b) => {
        const off = offsetOf(b.province)
        const selected = selectedProv === b.province
        const w = effW(b)
        const h = effH(b)
        // 西/北边缘调整大小时整块实时平移（保持对侧边缘不动）
        const rs = resizeState && resizeState.province === b.province ? resizeState : null
        const tdx = off.dx + (rs?.sx ?? 0)
        const tdy = off.dy + (rs?.sy ?? 0)
        let rowOffset = 0
        return (
          <g
            key={b.province}
            transform={tdx !== 0 || tdy !== 0 ? `translate(${tdx},${tdy})` : undefined}
            onPointerDown={(e) => onBlockPointerDown(e, b.province)}
            onPointerMove={(e) => onBlockPointerMove(e, b.province)}
            onPointerUp={(e) => finishDrag(e, b.province)}
            onPointerCancel={(e) => finishDrag(e, b.province)}
            style={{
              cursor: dragState?.province === b.province ? 'grabbing' : 'grab',
              // 触屏未选中时保留页面滚动；选中后禁用浏览器手势，拖动才生效
              touchAction: isCoarse && !selected ? 'auto' : 'none',
            }}
          >
            {/* 命中区域：卡片包围盒（卡片背景关闭时也有一层透明热区，保证整块可拖） */}
            <rect
              x={b.cardX}
              y={b.cardY}
              width={w}
              height={h}
              fill="transparent"
            />
            {showCard && (
              <rect
                x={b.cardX}
                y={b.cardY}
                width={w}
                height={h}
                rx={cardRx}
                fill={cardFill}
                opacity={cardOpacity}
                stroke={theme.leaderLine}
                strokeOpacity={0.35}
                strokeWidth={0.75}
                filter={cardBlur > 0 ? 'url(#label-card-blur)' : undefined}
              />
            )}
            {/* 选中态：主题色虚线框（移动端提示「再次按住即可拖动」，PC 提示可调大小） */}
            {selected && (
              <rect
                x={b.cardX - 2}
                y={b.cardY - 2}
                width={w + 4}
                height={h + 4}
                rx={cardRx + 2}
                fill="none"
                stroke={theme.accent}
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
            )}
            {/* 人数小块：卡片内部角落（可选，默认关闭），主题色浅底圆角小块 + 主题色数字，
                显示该卡学生数（同校合并也按人头计）；auto 位置跟随文字对齐反向放置——
                左对齐的卡片小块在右上，右对齐的在左上，避开标题文字一侧 */}
            {data.showCardCount &&
              b.studentCount > 0 &&
              (() => {
                const cw = 10 + String(b.studentCount).length * 6
                const ch = 12.5
                const pad = 5
                const pos =
                  data.cardCountPos === 'auto'
                    ? b.textAnchor === 'start'
                      ? 'right'
                      : 'left'
                    : data.cardCountPos
                const cx = pos === 'left' ? b.cardX + pad : b.cardX + w - pad - cw
                const cy = b.cardY + pad
                return (
                  <g pointerEvents="none">
                    <rect x={cx} y={cy} width={cw} height={ch} rx={3.5} fill={theme.accent} opacity={0.13} />
                    <text
                      x={cx + cw / 2}
                      y={cy + ch / 2 + 3.2}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={600}
                      fill={theme.accent}
                      style={{ fontFamily: personFont }}
                    >
                      {b.studentCount}
                    </text>
                  </g>
                )
              })()}
            {/* 调整大小手柄：仅选中态显示，四边中点 + 四角共 8 个，按住拖动改卡片宽/高；
                从西/北边缘拖时对侧边缘保持不动（位移落库时并入拖动偏移） */}
            {selected && (
              <g>
                {(
                  [
                    { mx: 0, my: -1, hx: w / 2, hy: 0, cursor: 'ns-resize' },
                    { mx: 0, my: 1, hx: w / 2, hy: h, cursor: 'ns-resize' },
                    { mx: -1, my: 0, hx: 0, hy: h / 2, cursor: 'ew-resize' },
                    { mx: 1, my: 0, hx: w, hy: h / 2, cursor: 'ew-resize' },
                    { mx: -1, my: -1, hx: 0, hy: 0, cursor: 'nwse-resize' },
                    { mx: 1, my: -1, hx: w, hy: 0, cursor: 'nesw-resize' },
                    { mx: -1, my: 1, hx: 0, hy: h, cursor: 'nesw-resize' },
                    { mx: 1, my: 1, hx: w, hy: h, cursor: 'nwse-resize' },
                  ] as const
                ).map((hd) => (
                  <g
                    key={`${hd.mx},${hd.my}`}
                    transform={`translate(${b.cardX + hd.hx}, ${b.cardY + hd.hy})`}
                    style={{ cursor: hd.cursor, touchAction: 'none' }}
                    onPointerDown={(e) => onResizePointerDown(e, b, hd.mx, hd.my)}
                    onPointerMove={(e) => onResizePointerMove(e, b.province)}
                    onPointerUp={(e) => finishResize(e, b.province)}
                    onPointerCancel={(e) => finishResize(e, b.province)}
                  >
                    {/* 热区略大于可视方块，方便点按 */}
                    <rect x={-8} y={-8} width={16} height={16} fill="transparent" />
                    <rect
                      x={-3.5}
                      y={-3.5}
                      width={7}
                      height={7}
                      rx={2}
                      fill="#ffffff"
                      stroke={theme.accent}
                      strokeWidth={1.4}
                    />
                  </g>
                ))}
              </g>
            )}
            <text
              x={b.anchorX}
              y={b.headerBaseline}
              textAnchor={b.textAnchor}
              fontSize={b.headerSize}
              fontWeight={700}
              fill={theme.textColor}
              style={{ fontFamily: provinceFont }}
            >
              {b.title ?? b.province}
            </text>
            {b.lines.map((ln, i) => {
              const startOffset = rowOffset
              const { nodes, rows } = ln.groupNames
                ? renderGroup(b, ln, rowOffset, `${b.province}-${i}`)
                : renderStudent(b, ln, rowOffset, `${b.province}-${i}`)
              rowOffset += rows
              // 同校合并：合并组与其前后条目之间画浅色分割线（组上下各一条），
              // 多人组从单人行里「围」出来，校与校一眼分清；全单人时不多余画线
              const next = b.lines[i + 1]
              const showDivider =
                data.mergeSameSchool && next !== undefined && (!!ln.groupNames || !!next.groupNames)
              // 文字视觉重心在基线之上（上伸约 0.8em、下延约 0.25em），
              // 几何中点偏下会让线贴着下一行；上移约 0.27em 后上下留白才相等
              const dividerY =
                b.firstLineBaseline + (startOffset + rows - 0.5) * b.lineH - 0.27 * b.personSize
              return (
                <g key={`${b.province}-${i}`}>
                  {nodes}
                  {showDivider && (
                    <line
                      x1={b.cardX + CARD_PAD_X}
                      x2={b.cardX + b.cardW - CARD_PAD_X}
                      y1={dividerY}
                      y2={dividerY}
                      stroke={theme.textColor}
                      strokeOpacity={0.2}
                      strokeWidth={1}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
      {/* 对齐辅助线：拖动吸附时显示，绘制在卡片上层；垂直线（X 对齐到列）、水平线（Y 对齐到同列卡片边） */}
      {guides && guideBounds && (
        <g pointerEvents="none">
          {guides.x !== undefined && (
            <line
              x1={guides.x}
              y1={guideBounds.minY - 24}
              x2={guides.x}
              y2={guideBounds.maxY + 24}
              stroke={theme.accent}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeDasharray="4 3"
              opacity={0.85}
            />
          )}
          {guides.y !== undefined && (
            <line
              x1={guideBounds.minX - 24}
              y1={guides.y}
              x2={guideBounds.maxX + 24}
              y2={guides.y}
              stroke={theme.accent}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeDasharray="4 3"
              opacity={0.85}
            />
          )}
        </g>
      )}
    </g>
  )
}
