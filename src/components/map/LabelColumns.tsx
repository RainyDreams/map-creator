import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import { schoolBadgeUrl } from '@/utils/universities'
import {
  BADGE_GAP,
  BADGE_RATIO,
  CALLI_RATIO,
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
  /** 画布设计宽度（viewBox 单位）：用于卡片拖动横向限幅，避免卡片被 SVG 视口裁剪 */
  designW?: number
  /** 拖动实时偏移上报（null = 拖动结束）：驱动上层画布 viewBox 自动扩大 */
  onLiveDrag?: (drag: { province: string; dx: number; dy: number } | null) => void
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
export function LabelColumns({ left, right, designW, onLiveDrag, zRanks, onCardActivate }: LabelColumnsProps) {
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
  const dragRef = useRef<{
    province: string
    pointerId: number
    startX: number
    startY: number
    baseDx: number
    baseDy: number
  } | null>(null)
  /** 是否触屏设备（决定先选中再拖，还是直接拖） */
  const isCoarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  )

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
  /** 辅助线绘制范围：所有卡片包围盒的边界，辅助线只在该范围内绘制 */
  const guideBounds = useMemo(() => {
    if (allBlocks.length === 0) return null
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const b of allBlocks) {
      minX = Math.min(minX, b.cardX)
      maxX = Math.max(maxX, b.cardX + b.cardW)
      minY = Math.min(minY, b.cardY)
      maxY = Math.max(maxY, b.cardY + b.cardH)
    }
    return { minX, maxX, minY, maxY }
  }, [left, right])

  /** 卡片横向限幅：偏移后卡片完整留在画布 [0, designW] 内，避免被 SVG 视口裁剪。
      与 ChinaMap 的「横向不扩 viewBox」配合——既不产生左右空白，也不丢卡片 */
  const clampDx = (b: LabelBlock, dx: number): number => {
    if (!designW) return dx
    return Math.max(-b.cardX, Math.min(designW - b.cardX - b.cardW, dx))
  }

  /** 某省份当前生效的偏移：拖动中用实时值，否则用持久化值；
      一列/两列（自动布局）下偏移不生效——且切换过去时已被重置（见 FontPanel），
      这里的 gating 只是分享链接/导入数据等非常规路径的兜底。
      持久化偏移同样做横向限幅，兼容历史数据（可能存在超出边界的旧偏移） */
  const offsetOf = (prov: string): { dx: number; dy: number } => {
    if (dragState && dragState.province === prov) return { dx: dragState.dx, dy: dragState.dy }
    if (!data.customPosition) return { dx: 0, dy: 0 }
    const raw = data.provinceOffsets[prov] ?? { dx: 0, dy: 0 }
    const b = allBlocks.find((x) => x.province === prov)
    return b ? { dx: clampDx(b, raw.dx), dy: raw.dy } : raw
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
    // 移动端：未选中时这次点击只选中（出现虚线框），选中后才进入拖动
    if (isCoarse && selectedProv !== prov) {
      setSelectedProv(prov)
      return
    }
    const loc = toSvgPoint(e)
    if (!loc) return
    const base = offsetOf(prov)
    dragRef.current = {
      province: prov,
      pointerId: e.pointerId,
      startX: loc.x,
      startY: loc.y,
      baseDx: base.dx,
      baseDy: base.dy,
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onBlockPointerMove = (e: React.PointerEvent, prov: string) => {
    const d = dragRef.current
    if (!d || d.province !== prov || d.pointerId !== e.pointerId) return
    const loc = toSvgPoint(e)
    if (!loc) return
    let dx = d.baseDx + (loc.x - d.startX)
    let dy = d.baseDy + (loc.y - d.startY)

    // 对齐吸附 + 辅助线预览：GUIDE_PX 内显示辅助线引导，SNAP_PX 内吸附到位
    const GUIDE_PX = 16
    const block = allBlocks.find((b) => b.province === prov)
    let guideX: number | undefined
    let guideY: number | undefined
    if (block) {
      const peers = (left.some((b) => b.province === prov) ? left : right).filter(
        (b) => b.province !== prov,
      )
      // X 吸附/预览：接近列标准位置时显示垂直辅助线，很近时吸附回列
      const dxDist = Math.abs(dx)
      if (dxDist <= SNAP_PX) {
        dx = 0
        guideX = block.cardX
      } else if (dxDist <= GUIDE_PX) {
        guideX = block.cardX
      }
      // Y 吸附/预览：遍历同列卡片，找最近的吸附目标
      const dTop = block.cardY + dy
      const dCen = block.centerY + dy
      const dBot = block.cardY + block.cardH + dy
      let nearest: { target: number; edge: number; dist: number } | null = null
      for (const o of peers) {
        const oo = offsetOf(o.province)
        const oTop = o.cardY + oo.dy
        const oCen = o.centerY + oo.dy
        const oBot = o.cardY + o.cardH + oo.dy
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

    // 横向限幅：卡片不超出画布边界（与 ChinaMap 横向不扩 viewBox 配合，避免被裁剪）
    if (block) dx = clampDx(block, dx)

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
    onLiveDrag?.(null)
    setGuides(null)
    setDragState((cur) => {
      if (cur && cur.province === prov) {
        const b = allBlocks.find((x) => x.province === prov)
        // 横向限幅在 ±600 与画布边界双重约束内
        let dx = Math.min(600, Math.max(-600, Math.round(cur.dx)))
        if (b) dx = clampDx(b, dx)
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
    const badgeSize = b.placeSize * BADGE_RATIO
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
    const badgeSize = b.placeSize * BADGE_RATIO
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
        const ex = Math.min(Math.max(b.centroidX, b.cardX + off.dx), b.cardX + off.dx + b.cardW)
        const ey = Math.min(Math.max(b.centroidY, b.cardY + off.dy), b.cardY + off.dy + b.cardH)
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
        let rowOffset = 0
        return (
          <g
            key={b.province}
            transform={off.dx !== 0 || off.dy !== 0 ? `translate(${off.dx},${off.dy})` : undefined}
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
              width={b.cardW}
              height={b.cardH}
              fill="transparent"
            />
            {showCard && (
              <rect
                x={b.cardX}
                y={b.cardY}
                width={b.cardW}
                height={b.cardH}
                rx={cardRx}
                fill={cardFill}
                opacity={cardOpacity}
                stroke={theme.leaderLine}
                strokeOpacity={0.35}
                strokeWidth={0.75}
                filter={cardBlur > 0 ? 'url(#label-card-blur)' : undefined}
              />
            )}
            {/* 移动端选中态：主题色虚线框提示「再次按住即可拖动」 */}
            {selected && (
              <rect
                x={b.cardX - 2}
                y={b.cardY - 2}
                width={b.cardW + 4}
                height={b.cardH + 4}
                rx={cardRx + 2}
                fill="none"
                stroke={theme.accent}
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
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
              {b.province}
            </text>
            {b.lines.map((ln, i) => {
              const { nodes, rows } = ln.groupNames
                ? renderGroup(b, ln, rowOffset, `${b.province}-${i}`)
                : renderStudent(b, ln, rowOffset, `${b.province}-${i}`)
              rowOffset += rows
              return <g key={`${b.province}-${i}`}>{nodes}</g>
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
