import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

interface MenuPos {
  left: number
  top: number
  width: number
  dropUp: boolean
}

/**
 * 字体选择下拉（自绘，非系统原生 select）：
 * - 每个选项用对应字体实时渲染名字，所见即所得
 * - 弹层经 Portal 挂到 body，fixed 定位——不被任何折叠面板/侧栏的 overflow 裁剪；
 *   宽度自适应内容（字体全称完整显示），右边界钳制在屏幕内，下方不足时向上展开
 * - 边框 / 阴影 / 高亮色跟随当前画布主题（theme.accent），与整体风格一致
 * - 同时列出预设字体与用户上传的自定义字体
 */
export function FontSelect({ value, onChange, ariaLabel }: FontSelectProps) {
  const { customFonts, theme } = useMapData()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<MenuPos | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  // 点击组件外部 / Esc 时收起；滚动与窗口变化时收起（fixed 定位不跟随滚动）
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onMove = () => setOpen(false)
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  /** 展开前测量：宽度取「按钮宽」与「内容自然宽」的较大值，钳制在屏幕内；下方放不下则上翻 */
  const toggle = () => {
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const margin = 8
      const maxW = vw - margin * 2
      // 预估内容宽：最长字体名 ≈ 7 个全角字 × 14px + note/勾选图标 + 内边距
      const longest = Math.max(
        ...PRESET_FONTS.map((f) => f.name.length + (f.note ? 5 : 0)),
        ...customFonts.map((f) => f.name.length),
        6,
      )
      const contentW = Math.min(Math.max(rect.width, longest * 15 + 64), maxW)
      const left = Math.min(Math.max(margin, rect.left), vw - contentW - margin)
      const menuH = Math.min((PRESET_FONTS.length + customFonts.length + 1) * 34 + 12, 280)
      const below = vh - rect.bottom
      const above = rect.top
      const dropUp = below < menuH && above > below
      const top = dropUp
        ? Math.max(margin, rect.top - Math.min(menuH, above - margin) - 4)
        : rect.bottom + 4
      setPos({ left, top, width: contentW, dropUp })
    }
    setOpen((v) => !v)
  }

  const current =
    presetFontById(value) ?? customFonts.find((f) => f.id === value) ?? PRESET_FONTS[0]
  const currentFamily =
    'family' in current ? current.family : `"${customFontFamilyName(current)}", sans-serif`
  const currentName = 'name' in current ? current.name : String(value)

  return (
    <div ref={rootRef} className="relative min-w-[6.5rem] flex-1">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={toggle}
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

      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            className="fixed z-[80] max-h-72 overflow-auto rounded-lg border bg-white py-1 shadow-xl"
            style={{
              left: pos.left,
              top: pos.top,
              width: pos.width,
              borderColor: `${theme.accent}55`,
              boxShadow: `0 10px 32px ${theme.accent}26`,
            }}
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
                    <span className="whitespace-nowrap" style={{ fontFamily: f.family }}>
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
          </ul>,
          document.body,
        )}
    </div>
  )
}
