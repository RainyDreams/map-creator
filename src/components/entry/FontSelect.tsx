import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useMapData } from '@/store/MapDataContext'
import {
  PRESET_FONTS,
  customFontFamilyName,
  presetFontById,
} from '@/utils/fonts'
import { cn } from '@/lib/utils'

interface FontSelectProps {
  /** 当前字体 id（预设或自定义） */
  value: string
  onChange: (fontId: string) => void
  ariaLabel?: string
}

/**
 * 字体选择下拉（自绘，非系统原生 select）：
 * - 每个选项用对应字体实时渲染名字，所见即所得
 * - 边框 / 阴影 / 高亮色跟随当前画布主题（theme.accent），与整体风格一致
 * - 同时列出预设字体与用户上传的自定义字体
 */
export function FontSelect({ value, onChange, ariaLabel }: FontSelectProps) {
  const { customFonts, theme } = useMapData()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 点击组件外部时收起
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

  const current =
    presetFontById(value) ?? customFonts.find((f) => f.id === value) ?? PRESET_FONTS[0]
  const currentFamily =
    'family' in current ? current.family : `"${customFontFamilyName(current)}", sans-serif`
  const currentName = 'name' in current ? current.name : String(value)

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border bg-white px-2 text-xs text-stone-700 transition-shadow md:h-9 md:text-sm',
          open ? 'shadow-md' : 'shadow-sm hover:shadow',
        )}
        style={{
          borderColor: open ? theme.accent : undefined,
          boxShadow: open ? `0 0 0 3px ${theme.accent}22, 0 4px 14px ${theme.accent}18` : undefined,
        }}
      >
        <span className="truncate" style={{ fontFamily: currentFamily }}>
          {currentName}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white py-1 shadow-xl"
          style={{ borderColor: `${theme.accent}55`, boxShadow: `0 10px 32px ${theme.accent}26` }}
        >
          {PRESET_FONTS.map((f) => {
            const active = f.id === value
            return (
              <li key={f.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(f.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors md:text-sm',
                    active ? 'font-medium' : 'text-stone-600 hover:bg-stone-50',
                  )}
                  style={
                    active
                      ? { color: theme.accent, backgroundColor: `${theme.accent}14` }
                      : undefined
                  }
                >
                  <span className="truncate" style={{ fontFamily: f.family }}>
                    {f.name}
                    {f.note ? (
                      <span className="ml-1 text-[10px] text-stone-400">（{f.note}）</span>
                    ) : null}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </li>
            )
          })}
          {customFonts.length > 0 && (
            <li className="mt-1 border-t border-stone-100 px-3 pt-1.5 pb-0.5 text-[10px] tracking-wide text-stone-400">
              我的字体
            </li>
          )}
          {customFonts.map((f) => {
            const active = f.id === value
            return (
              <li key={f.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(f.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors md:text-sm',
                    active ? 'font-medium' : 'text-stone-600 hover:bg-stone-50',
                  )}
                  style={
                    active
                      ? { color: theme.accent, backgroundColor: `${theme.accent}14` }
                      : undefined
                  }
                >
                  <span
                    className="truncate"
                    style={{ fontFamily: `"${customFontFamilyName(f)}", sans-serif` }}
                  >
                    {f.name}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
