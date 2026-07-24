import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import type { TeacherEntry } from '@/types'

/** 画布按 1500px 设计：px 字号 ÷ 15 = cqw，使 HTML 覆盖层与 SVG 标注同比例缩放 */
const cqw = (px: number): string => `${(px / 15).toFixed(3)}cqw`

/** 块底部距画布 flow 内容底部的默认边距（屏幕 px，对应原 bottom-12） */
const BOTTOM_GAP = 48

/**
 * 左下角老师名单块（标题可在「老师名单 → 名单标题」自定义，默认"相伴三年的老师们"，留空不显示）；
 * 无老师数据或在录入页关闭"显示老师"时整块不渲染。
 * 字号跟随「排版设计 → 字体与字号 → 老师名单」（默认与学生姓名一致），标题比名单大 3px。
 * 字号/内边距用 cqw 随画布宽度缩放，避免窄画布（尤其移动端）上相对学生标注过大。
 *
 * 可自由拖动（v1.16）：电脑端直接按住拖动，移动端先点选中（虚线框）再拖动；
 * 偏移持久化在 data.teachersOffset（画布设计 px）；横向在容器内自由移动（v1.21.2 解除 ±300 固定限幅），
 * 纵向动态限幅——向上不超出画布顶、向下 +1200（v1.21.1，原固定 ±300 会误夹）；
 * 在「省份卡片位置 → 重置位置」中可一并复位。
 *
 * 画布联动（v1.16.1）：定位改为相对 flow 内容顶部的实测 top（bottom 锚定 + translate 会双重计数）。
 * 向下拖出原本 48px 边距时，MapPage 在 flow 与 footer 之间加占位把画布撑高；
 * 拖回则占位归 0、画布缩回。横向不扩画布（会把 w-full 的 SVG 地图拉宽），改为拖动时限幅在容器内。
 */
export function TeachersBlock({
  teachers,
  flowRef,
  footerRef,
  onLiveDy,
  reserveDesign,
}: {
  teachers: TeacherEntry[]
  flowRef: React.RefObject<HTMLDivElement | null>
  footerRef: React.RefObject<HTMLDivElement | null>
  /** 拖动中实时上报纵向偏移（设计 px，未落库）；拖动结束传 null——MapPage 据此让画布高度与拖动同步伸缩 */
  onLiveDy?: (dy: number | null) => void
  /** 底部预留区基准高度（设计 px，dy=0 时的预留）：上拖时预留随之上收，
      预留耗尽后剩余上移量由本组件的 top 偏移补上（块跟随进入地图区） */
  reserveDesign?: number
}) {
  const { data, setData, theme, fontSlots, customFonts } = useMapData()
  /** 移动端「先点选中」状态（选中后才可拖） */
  const [selected, setSelected] = useState(false)
  /** 拖动中的实时偏移（提交前不落库） */
  const [dragDelta, setDragDelta] = useState<{ dx: number; dy: number } | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    baseDx: number
    baseDy: number
    /** 屏幕 px → 画布设计 px 的换算系数（1500 / 画布渲染宽度） */
    scale: number
    /** 拖动开始时的块宽（屏幕 px，横向限幅用） */
    blockW: number
    /** 拖动开始时的画布渲染宽度（屏幕 px） */
    canvasW: number
  } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  /** 实测 top（屏幕 px）；null = 尚未测量，先用 bottom-12 兜底定位 */
  const [topPx, setTopPx] = useState<number | null>(null)
  const isCoarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  )

  /** 监听画布级「清除选中」事件（点空白处 / 导出前派发）：虚线选中框消失 */
  useEffect(() => {
    const canvas = rootRef.current?.closest('[data-testid="map-canvas"]')
    if (!canvas) return
    const handler = () => setSelected(false)
    canvas.addEventListener('cf-clear-selection', handler)
    return () => canvas.removeEventListener('cf-clear-selection', handler)
  }, [])

  const off = dragDelta ?? data.teachersOffset

  // top = flow内容高 + footer高 - 48px 边距 - 块高 + 纵向偏移（屏幕 px）；
  // flow/footer/块自身尺寸变化、窗口缩放、偏移变化都重算
  useEffect(() => {
    const update = () => {
      const root = rootRef.current
      const flow = flowRef.current
      const canvas = root?.closest('[data-testid="map-canvas"]') as HTMLElement | null
      if (!root || !flow || !canvas || canvas.clientWidth <= 0) return
      const footerH = footerRef.current?.offsetHeight ?? 0
      const k = canvas.clientWidth / 1500
      const dyScreen = off.dy * k
      const rScreen = (reserveDesign ?? 0) * k
      // dy>0：MapPage 在 flow 与 footer 间加 spacer 把画布撑高，块随 dy 下移（距底恒 36px）；
      // dy<0：预留区随 dy 上收（flow 自然变矮、画布缩小），块随之上移（距底恒 48px）——
      // 预留耗尽（归 0）后剩余上移量由 offsetY 补上，块跟随进入地图区
      const offsetY = dyScreen > 0 ? dyScreen : Math.min(0, dyScreen + rScreen)
      setTopPx(flow.offsetHeight + footerH - BOTTOM_GAP - root.offsetHeight + offsetY)
    }
    update()
    const ro = new ResizeObserver(update)
    if (flowRef.current) ro.observe(flowRef.current)
    if (footerRef.current) ro.observe(footerRef.current)
    if (rootRef.current) ro.observe(rootRef.current)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [off.dy, flowRef, footerRef, reserveDesign])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    if (isCoarse && !selected) {
      setSelected(true)
      return
    }
    const canvas = rootRef.current?.closest('[data-testid="map-canvas"]') as HTMLElement | null
    const renderedW = canvas?.clientWidth ?? 0
    if (renderedW <= 0) return
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseDx: data.teachersOffset.dx,
      baseDy: data.teachersOffset.dy,
      scale: 1500 / renderedW,
      blockW: rootRef.current?.offsetWidth ?? 0,
      canvasW: renderedW,
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const next = {
      dx: d.baseDx + (e.clientX - d.startX) * d.scale,
      dy: d.baseDy + (e.clientY - d.startY) * d.scale,
    }
    setDragDelta(next)
    // 实时上报：画布高度随拖动同步伸缩（到达边界才扩充、往回缩立即缩小）
    onLiveDy?.(next.dy)
  }

  const finishDrag = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    onLiveDy?.(null)
    setDragDelta((cur) => {
      if (cur) {
        // 横向限幅在容器内：左界 left-6(24px) 留 8px，右界留 8px，均换算为设计 px。
        // v1.21.2 起不再叠加 ±300 固定限幅——块可以在画布内自由横向移动
        const k = 1500 / d.canvasW
        const dxMin = -(24 - 8) * k
        const dxMax = (d.canvasW - 24 - d.blockW - 8) * k
        const dx = Math.round(Math.min(dxMax, Math.max(dxMin, cur.dx)))
        // 纵向不再用固定 ±300：名单长、块已上拖入地图区时固定限幅会误夹，
        // 表现为「向上拖不动、松手弹回原位」。改为动态边界——
        // 上限（向下拖）：+1200 设计 px 宽裕值（画布随之下扩）；
        // 下限（向上拖）：块顶不超出画布顶 8px，按当前实测布局换算。
        // topPx = baseScreen + min(0, (dy+reserve)·k2) ≥ 8 → dy ≥ (8-baseScreen)/k2 − reserve
        const k2 = d.canvasW / 1500
        const footerH = footerRef.current?.offsetHeight ?? 0
        const baseScreen =
          (flowRef.current?.offsetHeight ?? 0) +
          footerH -
          BOTTOM_GAP -
          (rootRef.current?.offsetHeight ?? 0)
        const dyMin = Math.round(Math.min(0, (8 - baseScreen) / k2 - (reserveDesign ?? 0)))
        const dyMax = 1200
        const dy = Math.min(dyMax, Math.max(dyMin, Math.round(cur.dy)))
        setData((prev) => ({ ...prev, teachersOffset: { dx, dy } }))
      }
      return null
    })
  }

  if (!data.showTeachers || teachers.length === 0) return null
  const titleFont = slotFontFamily('han', fontSlots, customFonts)
  const personFont = slotFontFamily('person', fontSlots, customFonts)
  const placeFont = slotFontFamily('place', fontSlots, customFonts)
  const size = data.labelSizes.teacher
  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={-1}
      aria-label="老师名单块，可拖动调整位置"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      className={`absolute bottom-12 left-6 z-10 max-w-[45%] rounded-lg bg-white/60 backdrop-blur-[2px] ${
        selected && isCoarse ? 'outline-dashed outline-2 outline-offset-2 outline-stone-400' : ''
      }`}
      style={{
        // 测量完成后用实测 top 锚定，并把 bottom 复位为 auto——否则 top+bottom 同时生效
        // 会把块「拉伸」撑满（高度=容器-top-bottom），块变巨高、底部命中区延伸到画布外
        ...(topPx !== null ? { top: `${Math.round(topPx)}px`, bottom: 'auto' } : {}),
        padding: `${cqw(12)} ${cqw(16)}`,
        transform:
          topPx !== null
            ? off.dx !== 0
              ? `translate(${cqw(off.dx)}, 0px)`
              : undefined
            : off.dx !== 0 || off.dy !== 0
              ? `translate(${cqw(off.dx)}, ${cqw(off.dy)})`
              : undefined,
        cursor: dragDelta ? 'grabbing' : 'grab',
        // 触屏未选中时保留页面滚动；选中后禁用浏览器手势，拖动才生效
        touchAction: isCoarse && !selected ? 'auto' : 'none',
      }}
    >
      {data.teachersTitle.trim() !== '' && (
        <p
          className="mb-1 tracking-wide"
          style={{
            fontFamily: titleFont,
            color: theme.titleColor,
            fontSize: cqw(size + 3),
            lineHeight: 1.4,
          }}
        >
          {data.teachersTitle.trim()}：
        </p>
      )}
      <ul>
        {teachers.map((t) => (
          <li
            key={t.id}
            style={{ color: theme.textColor, fontSize: cqw(size), lineHeight: 1.6 }}
          >
            <span className="font-semibold" style={{ fontFamily: personFont }}>
              {t.name}
            </span>
            {t.subject.trim() !== '' && (
              <span
                className="ml-1 opacity-70"
                style={{ fontFamily: placeFont, fontSize: cqw(Math.max(9, size - 1)) }}
              >
                （{t.subject}）
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
