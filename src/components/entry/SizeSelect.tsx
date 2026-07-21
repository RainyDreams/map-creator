import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useMapData } from '@/store/MapDataContext'
import { cn } from '@/lib/utils'

interface SizeSelectProps {
  /** 当前字号百分比（100 = 基准） */
  value: number
  onChange: (pct: number) => void
  ariaLabel?: string
}

/** 字号档位（相对基准值的百分比） */
const OPTIONS = [80, 90, 100, 110, 120, 130] as const

/**
 * 字号选择下拉（自绘，非原生 select / 非原生滑块）：
 * - 紧凑宽度，嵌在字体选择右侧
 * - 展开方向感知屏幕位置：下方空间不足时向上展开（与城市选择器一致的策略）
 * - 边框 / 阴影 / 高亮色跟随当前画布主题（theme.accent）
 */
export function SizeSelect({ value, onChange, ariaLabel }: SizeSelectProps) {
  const { theme } = useMapData()
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 点击组件外部 / Esc 时收起
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  /** 展开前测量：菜单高约 6 项 × 32px ≈ 200px，下方放不下且上方更宽敞则向上展开 */
  const toggle = () => {
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      const menuH = 210
      const below = window.innerHeight - rect.bottom
      const above = rect.top
      setDropUp(below < menuH && above > below)
    }
    setOpen((v) => !v)
  }

  return (
    <div ref={rootRef} className="relative w-16 shrink-0 md:w-[4.5rem]">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        title="字号"
        onClick={toggle}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-0.5 rounded-md border bg-white px-1.5 text-[11px] text-stone-600 tabular-nums transition-shadow md:h-9 md:text-xs',
          open ? 'shadow-md' : 'shadow-sm hover:shadow',
        )}
        style={{
          borderColor: open ? theme.accent : undefined,
          boxShadow: open ? `0 0 0 3px ${theme.accent}22, 0 4px 14px ${theme.accent}18` : undefined,
        }}
      >
        {value}%
        <ChevronDown
          className={cn('h-3 w-3 shrink-0 text-stone-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className={cn(
            'absolute z-50 w-full overflow-auto rounded-lg border bg-white py-1 shadow-xl',
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
          style={{ borderColor: `${theme.accent}55`, boxShadow: `0 10px 32px ${theme.accent}26` }}
        >
          {OPTIONS.map((pct) => {
            const active = pct === value
            return (
              <li key={pct}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(pct)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-1 px-2 py-1.5 text-left text-[11px] tabular-nums transition-colors md:text-xs',
                    active ? 'font-medium' : 'text-stone-600 hover:bg-stone-50',
                  )}
                  style={
                    active
                      ? { color: theme.accent, backgroundColor: `${theme.accent}14` }
                      : undefined
                  }
                >
                  {pct}%
                  {active && <Check className="h-3 w-3 shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
