import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import { privacyName } from './labels'
import type { StudentEntry } from '@/types'

/** 画布按 1500px 设计：px 字号 ÷ 15 = cqw，使 HTML 覆盖层与 SVG 标注同比例缩放 */
const cqw = (px: number): string => `${(px / 15).toFixed(3)}cqw`

/** 块底部距画布 flow 内容底部的默认边距（屏幕 px，对应 bottom-12） */
const BOTTOM_GAP = 48
/** 右侧锚定边距（屏幕 px，对应 right-4） */
const RIGHT_GAP = 16

/**
 * 右下角「海外 / 境外的同学们」区块：
 * 列出境外学生（姓名 大学 · 国家/地区），不指向中国地图、无引线。
 * 字号与老师名单一致（labelSizes.teacher），字体跟随标题/姓名/地点槽位。
 * 字号/内边距用 cqw 随画布宽度缩放；卡片为半透明白 + 主题色文字，任何主题下可读。
 *
 * 可自由拖动（v1.26.1）：交互与 TeachersBlock 完全一致——电脑端直接按住拖动，
 * 移动端先点选中（虚线框）再拖动；偏移持久化在 data.overseasOffset（画布设计 px）；
 * 横向限幅在容器内（右锚定：向右最多到右边缘 8px，向左不越出左边缘 8px）；
 * 纵向动态限幅——向上不超出画布顶、向下 +1200；画布高度随拖动同步伸缩；
 * 在「省份卡片位置 → 重置位置」中可一并复位。
 */
export function OverseasBlock({
  students,
  flowRef,
  footerRef,
  onLiveDy,
  reserveDesign,
}: {
  students: StudentEntry[]
  flowRef: React.RefObject<HTMLDivElement | null>
  footerRef: React.RefObject<HTMLDivElement | null>
  /** 拖动中实时上报纵向偏移（设计 px，未落库）；拖动结束传 null */
  onLiveDy?: (dy: number | null) => void
  /** 底部预留区基准高度（设计 px，dy=0 时的预留） */
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

  const off = dragDelta ?? data.overseasOffset

  // top = flow内容高 + footer高 - 48px 边距 - 块高 + 纵向偏移（屏幕 px）——与 TeachersBlock 同一套锚定逻辑
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
      baseDx: data.overseasOffset.dx,
      baseDy: data.overseasOffset.dy,
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
        const k = 1500 / d.canvasW
        // 横向限幅在容器内（右锚定）：向右最多到右边缘留 8px，向左不越过左边缘 8px
        const dxMin = -(d.canvasW - RIGHT_GAP - d.blockW - 8) * k
        const dxMax = (RIGHT_GAP - 8) * k
        const dx = Math.round(Math.min(dxMax, Math.max(dxMin, cur.dx)))
        // 纵向动态边界（同 TeachersBlock）：上不超画布顶 8px，下 +1200 设计 px
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
        setData((prev) => ({ ...prev, overseasOffset: { dx, dy } }))
      }
      return null
    })
  }

  if (students.length === 0) return null
  const titleFont = slotFontFamily('han', fontSlots, customFonts)
  const personFont = slotFontFamily('person', fontSlots, customFonts)
  const placeFont = slotFontFamily('place', fontSlots, customFonts)
  const size = data.labelSizes.teacher
  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={-1}
      aria-label="海外/境外名单块，可拖动调整位置"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      className={`absolute right-4 bottom-12 z-10 w-fit max-w-[42%] rounded-lg bg-white/60 backdrop-blur-[2px] ${
        selected && isCoarse ? 'outline-dashed outline-2 outline-offset-2 outline-stone-400' : ''
      }`}
      style={{
        // 测量完成后用实测 top 锚定，并把 bottom 复位为 auto（避免 top+bottom 双重生效把块撑高）
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
        className="mb-1 tracking-wide whitespace-nowrap"
        style={{
          fontFamily: titleFont,
          color: theme.titleColor,
          fontSize: cqw(size + 3),
          lineHeight: 1.4,
        }}
      >
        海外 / 境外的同学们：
      </p>
      <ul>
        {students.map((s) => (
          <li
            key={s.id}
            className="whitespace-nowrap"
            style={{ color: theme.textColor, fontSize: cqw(size), lineHeight: 1.6 }}
          >
            <span className="font-semibold" style={{ fontFamily: personFont }}>
              {data.anonymizeNames ? privacyName(s.name) : s.name || '（未命名）'}
            </span>
            {(s.university.trim() !== '' || s.city.trim() !== '') && (
              <span className="ml-1.5 opacity-80" style={{ fontFamily: placeFont }}>
                {[s.university.trim(), s.city.trim()].filter(Boolean).join(' · ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
