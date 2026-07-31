import { useEffect, useRef, useState } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { breadcrumb } from '@/utils/sessionLog'

interface ProvinceColorPickerProps {
  /** 省份全称（如「四川省」），与 provinceColors 的键一致 */
  prov: string
  /**
   * true 时下拉中额外提供「主题自动」选项（存储值 'auto'）——
   * 用于无同学省份的三态调色（默认底色 / 主题自动 / 自定义）；
   * 有同学省份保持 false（缺省即跟随主题色板循环，无需 auto）
   */
  allowAuto?: boolean
}

/** 默认（未设置）色点的斜纹样式 */
const DEFAULT_STRIPE =
  'linear-gradient(135deg,#fafaf9 0%,#fafaf9 49%,#d6d3d1 50%,#fafaf9 51%)'

/**
 * 省份地图颜色选择器（v1.39 从学生名单模态框抽出共享，v1.40 支持 auto 三态）：
 * 色点按钮 + 下拉色板（恢复默认 / 主题色板 / 自定义取色 [/ 主题自动]）。
 * 有同学省份设置自定义颜色不影响其他省的色板循环顺序（仍占色板槽位）；
 * 无同学省份的 'auto' 在它们之间按地理顺序确定性循环色板。
 */
export function ProvinceColorPicker({ prov, allowAuto = false }: ProvinceColorPickerProps) {
  const { data, setData, theme } = useMapData()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const cur = data.provinceColors[prov]

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

  const apply = (color: string | null) => {
    setData((prev) => {
      const next = { ...prev.provinceColors }
      if (color === null) delete next[prov]
      else next[prov] = color
      return { ...prev, provinceColors: next }
    })
    breadcrumb(
      color === null
        ? `省份颜色：「${prov}」恢复默认`
        : color === 'auto'
          ? `省份颜色：「${prov}」→ 主题自动`
          : `省份颜色：「${prov}」→ ${color}`,
    )
    setOpen(false)
  }

  const autoGradient = `conic-gradient(${theme.provinceActive.join(',')})`

  const curLabel =
    cur === 'auto' ? '主题自动' : (cur ?? (allowAuto ? '默认底色' : '跟随主题色板'))

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`「${prov}」在地图上的颜色（当前：${curLabel}）`}
        aria-label={`「${prov}」地图颜色`}
        aria-expanded={open}
        className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-stone-500 hover:bg-stone-100 hover:text-stone-700"
      >
        <span
          className="h-3.5 w-3.5 rounded-full border border-stone-300"
          style={{
            backgroundColor: cur && cur !== 'auto' ? cur : undefined,
            backgroundImage:
              cur === undefined ? DEFAULT_STRIPE : cur === 'auto' ? autoGradient : undefined,
          }}
        />
        颜色
      </button>
      {open && (
        <span className="absolute top-full right-0 z-30 mt-1 flex w-44 flex-col gap-1.5 rounded-lg border border-stone-200 bg-white p-2 shadow-lg">
          <span className="text-[10px] text-stone-400">「{prov}」在地图上的颜色</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {/* 恢复默认 */}
            <button
              type="button"
              title={allowAuto ? '恢复默认（保持底色）' : '恢复默认（跟随主题色板）'}
              aria-label="恢复默认颜色"
              aria-pressed={cur === undefined}
              onClick={() => apply(null)}
              className={
                cur === undefined
                  ? 'h-5 w-5 rounded-full border-2 border-stone-700 ring-2 ring-stone-300'
                  : 'h-5 w-5 rounded-full border border-stone-300 transition-transform hover:scale-110'
              }
              style={{ backgroundImage: DEFAULT_STRIPE }}
            />
            {/* 主题自动（仅无同学省份提供） */}
            {allowAuto && (
              <button
                type="button"
                title="主题自动（按主题色板自动填充）"
                aria-label="主题自动填充"
                aria-pressed={cur === 'auto'}
                onClick={() => apply('auto')}
                className={
                  cur === 'auto'
                    ? 'h-5 w-5 rounded-full border-2 border-stone-700 ring-2 ring-stone-300'
                    : 'h-5 w-5 rounded-full border border-stone-300 transition-transform hover:scale-110'
                }
                style={{ backgroundImage: autoGradient }}
              />
            )}
            {theme.provinceActive.map((c) => {
              const active = cur === c
              return (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-label={`颜色 ${c}`}
                  aria-pressed={active}
                  onClick={() => apply(c)}
                  className={
                    active
                      ? 'h-5 w-5 rounded-full border-2 border-stone-700 ring-2 ring-stone-300'
                      : 'h-5 w-5 rounded-full border border-stone-300 transition-transform hover:scale-110'
                  }
                  style={{ backgroundColor: c }}
                />
              )
            })}
            {/* 自定义颜色（原生取色器，刻意小巧） */}
            <label
              className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-dashed border-stone-400 transition-transform hover:scale-110"
              title="自定义颜色"
              style={
                cur !== undefined && cur !== 'auto' && !theme.provinceActive.includes(cur)
                  ? { backgroundColor: cur, borderStyle: 'solid', borderColor: '#44403c' }
                  : undefined
              }
            >
              <input
                type="color"
                value={cur && cur !== 'auto' ? cur : '#e8b96a'}
                onChange={(e) => apply(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`自定义「${prov}」地图颜色`}
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-stone-500">
                +
              </span>
            </label>
          </span>
          <span className="text-[10px] leading-relaxed text-stone-400">
            {allowAuto
              ? '无同学的省份可保持默认底色、按主题自动填充或自定义'
              : '只影响地图上的省份填色，名单卡片样式不变'}
          </span>
        </span>
      )}
    </span>
  )
}
