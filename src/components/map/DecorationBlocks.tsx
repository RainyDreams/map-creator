import { useEffect, useMemo, useRef, useState } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import type { DecorationItem } from '@/types'

/** 画布按 1500px 设计：px ÷ 15 = cqw，使装饰元素与 SVG 标注同比例缩放 */
const cqw = (px: number): string => `${(px / 15).toFixed(3)}cqw`

/**
 * 画布装饰元素（v1.38）：用户自行添加的文本框与图片，便于装饰留白处。
 * 位置为画布设计 px（相对画布左上角），渲染为绝对定位 HTML 覆盖层（cqw 随画布缩放）；
 * 电脑端直接拖动，移动端先点选中（虚线框）再拖动；拖动全程限幅在画布边界内
 * （与老师块不同：装饰元素不撑大画布，纯画布内定位）。
 * 在录入页「装饰元素」面板中添加/编辑/删除；随导出进 PNG，随 ZIP 全量备份。
 */
export function DecorationBlocks() {
  const { data, setData, theme, fontSlots, customFonts } = useMapData()
  /** 移动端「先点选中」的装饰元素 id */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** 拖动中的实时位置（提交前不落库） */
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const dragRef = useRef<{
    pointerId: number
    id: string
    startX: number
    startY: number
    baseX: number
    baseY: number
    /** 屏幕 px → 画布设计 px 换算系数（1500 / 画布渲染宽度） */
    scale: number
    /** 元素尺寸（设计 px，拖动限幅用） */
    itemW: number
    itemH: number
    /** 画布尺寸（设计 px，拖动限幅用） */
    canvasW: number
    canvasH: number
  } | null>(null)
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const isCoarse = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    [],
  )

  /** 点画布空白处时清除选中态（虚线框消失） */
  useEffect(() => {
    const canvas = itemRefs.current.values().next().value?.closest('[data-testid="map-canvas"]')
    if (!canvas) return
    const handler = () => setSelectedId(null)
    canvas.addEventListener('cf-clear-selection', handler)
    return () => canvas.removeEventListener('cf-clear-selection', handler)
  }, [data.decorations.length])

  if (data.decorations.length === 0) return null
  const textFont = slotFontFamily('han', fontSlots, customFonts)

  const onPointerDown = (e: React.PointerEvent, item: DecorationItem) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.stopPropagation()
    if (isCoarse && selectedId !== item.id) {
      setSelectedId(item.id)
      return
    }
    const el = itemRefs.current.get(item.id)
    const canvas = el?.closest('[data-testid="map-canvas"]') as HTMLElement | null
    if (!el || !canvas || canvas.clientWidth <= 0) return
    const scale = 1500 / canvas.clientWidth
    dragRef.current = {
      pointerId: e.pointerId,
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      baseX: item.x,
      baseY: item.y,
      scale,
      itemW: el.offsetWidth * scale,
      itemH: el.offsetHeight * scale,
      canvasW: 1500,
      canvasH: canvas.offsetHeight * scale,
    }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    // 全程限幅在画布内：左/上 0，右/下 = 画布尺寸 - 元素尺寸
    const x = Math.round(
      Math.min(Math.max(0, d.canvasW - d.itemW), Math.max(0, d.baseX + (e.clientX - d.startX) * d.scale)),
    )
    const y = Math.round(
      Math.min(Math.max(0, d.canvasH - d.itemH), Math.max(0, d.baseY + (e.clientY - d.startY) * d.scale)),
    )
    setDragPos({ id: d.id, x, y })
  }

  const finishDrag = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragPos((cur) => {
      if (cur && cur.id === d.id) {
        setData((prev) => ({
          ...prev,
          decorations: prev.decorations.map((it) =>
            it.id === cur.id ? { ...it, x: cur.x, y: cur.y } : it,
          ),
        }))
      }
      return null
    })
  }

  return (
    <>
      {data.decorations.map((item) => {
        const pos = dragPos && dragPos.id === item.id ? dragPos : item
        const selected = isCoarse && selectedId === item.id
        return (
          <div
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el)
              else itemRefs.current.delete(item.id)
            }}
            role="button"
            tabIndex={-1}
            aria-label={item.kind === 'text' ? `装饰文本「${item.text}」，可拖动` : '装饰图片，可拖动'}
            onPointerDown={(e) => onPointerDown(e, item)}
            onPointerMove={onPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            className={`absolute z-10 ${
              selected ? 'outline-dashed outline-2 outline-offset-2 outline-stone-400' : ''
            }`}
            style={{
              left: cqw(pos.x),
              top: cqw(pos.y),
              cursor: dragPos?.id === item.id ? 'grabbing' : 'grab',
              // 触屏未选中时保留页面滚动；选中后禁用浏览器手势，拖动才生效
              touchAction: isCoarse && !selected ? 'auto' : 'none',
            }}
          >
            {item.kind === 'text' ? (
              <span
                className="whitespace-nowrap"
                style={{
                  fontFamily: textFont,
                  color: item.color !== '' ? item.color : theme.textColor,
                  fontSize: cqw(item.size),
                  lineHeight: 1.4,
                }}
              >
                {item.text}
              </span>
            ) : (
              <img
                src={item.dataUrl}
                alt=""
                draggable={false}
                className="block h-auto"
                style={{ width: cqw(item.size) }}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
