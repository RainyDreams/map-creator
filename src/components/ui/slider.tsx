import { useCallback, useEffect, useRef, useState } from 'react'

export interface SliderProps {
  /** 当前值 */
  value: number
  min: number
  max: number
  /** 步进，默认 1 */
  step?: number
  onChange: (v: number) => void
  /** 格式化当前值展示（如 v => `${v}%`） */
  format?: (v: number) => string
  'aria-label'?: string
}

/**
 * 自绘滑块（非浏览器原生 input[type=range]）：
 * - 轨道/已填充段/圆形把手全部自绘，颜色随整体 stone 风格；
 * - 支持鼠标与触摸拖拽（Pointer Events），点击轨道直接跳转；
 * - 键盘左右方向键微调（聚焦把手时）。
 */
export function Slider({ value, min, max, step = 1, onChange, format, ...rest }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const snap = (v: number) => clamp(Math.round(v / step) * step)
  const ratio = max > min ? (value - min) / (max - min) : 0

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return value
      const r = el.getBoundingClientRect()
      const t = r.width > 0 ? (clientX - r.left) / r.width : 0
      return snap(min + clamp(t) * (max - min))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [min, max, step, value],
  )

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => onChange(valueFromClientX(e.clientX))
    const up = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging, onChange, valueFromClientX])

  return (
    <div className="flex items-center gap-2">
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={rest['aria-label']}
        className="relative h-4 min-w-0 flex-1 cursor-pointer touch-none select-none"
        onPointerDown={(e) => {
          e.preventDefault()
          setDragging(true)
          onChange(valueFromClientX(e.clientX))
        }}
      >
        {/* 轨道 */}
        <div className="absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-stone-200" />
        {/* 已填充段 */}
        <div
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-stone-500"
          style={{ width: `${ratio * 100}%` }}
        />
        {/* 把手 */}
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault()
              onChange(snap(value - step))
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault()
              onChange(snap(value + step))
            }
          }}
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-400 bg-white outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-stone-300 ${
            dragging ? 'shadow-md ring-2 ring-stone-300' : 'shadow-sm'
          }`}
          style={{ left: `${ratio * 100}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-stone-500">
        {format ? format(value) : value}
      </span>
    </div>
  )
}
