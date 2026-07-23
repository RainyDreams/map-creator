import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import type { TeacherEntry } from '@/types'

/** 画布按 1500px 设计：px 字号 ÷ 15 = cqw，使 HTML 覆盖层与 SVG 标注同比例缩放 */
const cqw = (px: number): string => `${(px / 15).toFixed(3)}cqw`

/** 拖动限幅（画布设计 px）：±300，避免老师块被拖离主体太远 */
const DRAG_LIMIT = 300
/** 块底部距画布 flow 内容底部的默认边距（屏幕 px，对应原 bottom-12） */
const BOTTOM_GAP = 48

/**
 * 左下角"相伴三年的老师们"名单；
 * 无老师数据或在录入页关闭"显示老师"时整块不渲染。
 * 字号跟随「字体设置 → 老师名单」（默认与学生姓名一致），标题比名单大 3px。
 * 字号/内边距用 cqw 随画布宽度缩放，避免窄画布（尤其移动端）上相对学生标注过大。
 *
 * 可自由拖动（v1.16）：电脑端直接按住拖动，移动端先点选中（虚线框）再拖动；
 * 偏移持久化在 data.teachersOffset（画布设计 px），限幅 ±300；
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
}: {
  teachers: TeacherEntry[]
  flowRef: React.RefObject<HTMLDivElement | null>
  footerRef: React.RefObject<HTMLDivElement | null>
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
      const dyScreen = (off.dy * canvas.clientWidth) / 1500
      setTopPx(flow.offsetHeight + footerH - BOTTOM_GAP - root.offsetHeight + dyScreen)
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
  }, [off.dy, flowRef, footerRef])

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
    setDragDelta({
      dx: d.baseDx + (e.clientX - d.startX) * d.scale,
      dy: d.baseDy + (e.clientY - d.startY) * d.scale,
    })
  }

  const finishDrag = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragDelta((cur) => {
      if (cur) {
        // 横向限幅在容器内：左界 left-6(24px) 留 8px，右界留 8px，均换算为设计 px
        const k = 1500 / d.canvasW
        const dxMin = Math.max(-DRAG_LIMIT, -(24 - 8) * k)
        const dxMax = Math.min(DRAG_LIMIT, (d.canvasW - 24 - d.blockW - 8) * k)
        const dx = Math.round(Math.min(dxMax, Math.max(dxMin, cur.dx)))
        const dy = Math.min(DRAG_LIMIT, Math.max(-DRAG_LIMIT, Math.round(cur.dy)))
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
      <p
        className="mb-1 tracking-wide"
        style={{
          fontFamily: titleFont,
          color: theme.titleColor,
          fontSize: cqw(size + 3),
          lineHeight: 1.4,
        }}
      >
        相伴三年的老师们：
      </p>
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
