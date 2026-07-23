import { useMemo, useRef, useState } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import type { TeacherEntry } from '@/types'

/** 画布按 1500px 设计：px 字号 ÷ 15 = cqw，使 HTML 覆盖层与 SVG 标注同比例缩放 */
const cqw = (px: number): string => `${(px / 15).toFixed(3)}cqw`

/** 拖动限幅（画布设计 px）：±300，避免老师块被拖离主体太远 */
const DRAG_LIMIT = 300

/**
 * 左下角"相伴三年的老师们"名单；
 * 无老师数据或在录入页关闭"显示老师"时整块不渲染。
 * 字号跟随「字体设置 → 老师名单」（默认与学生姓名一致），标题比名单大 3px。
 * 字号/内边距用 cqw 随画布宽度缩放，避免窄画布（尤其移动端）上相对学生标注过大。
 *
 * 可自由拖动（v1.16）：电脑端直接按住拖动，移动端先点选中（虚线框）再拖动；
 * 偏移持久化在 data.teachersOffset（画布设计 px），限幅 ±300；
 * 在「省份卡片位置 → 重置位置」中可一并复位。
 */
export function TeachersBlock({ teachers }: { teachers: TeacherEntry[] }) {
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
  } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const isCoarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    if (isCoarse && !selected) {
      setSelected(true)
      return
    }
    const canvas = rootRef.current?.closest('[data-testid="map-canvas"]')
    const renderedW = canvas?.clientWidth ?? 0
    if (renderedW <= 0) return
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseDx: data.teachersOffset.dx,
      baseDy: data.teachersOffset.dy,
      scale: 1500 / renderedW,
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
        const dx = Math.min(DRAG_LIMIT, Math.max(-DRAG_LIMIT, Math.round(cur.dx)))
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
  const off = dragDelta ?? data.teachersOffset
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
        padding: `${cqw(12)} ${cqw(16)}`,
        transform:
          off.dx !== 0 || off.dy !== 0 ? `translate(${cqw(off.dx)}, ${cqw(off.dy)})` : undefined,
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
