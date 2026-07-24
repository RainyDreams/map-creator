import { Section } from '@/components/entry/Section'
import { Palette } from 'lucide-react'
import { useMapData } from '@/store/MapDataContext'
import { PRESET_THEMES, type ThemeConfig } from '@/utils/themes'
import { cn } from '@/lib/utils'

// —— 颜色工具：#rrggbb 级别的提取与混合 ——

/** 从 CSS background（可能是渐变）中提取第一个 #hex 色；无则回退 */
function extractHex(css: string, fallback = '#ffffff'): string {
  const m = css.match(/#[0-9a-fA-F]{6}/)
  return m ? m[0].toLowerCase() : fallback
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** 将 hex 向 target 混合 amount（0~1） */
function mix(hex: string, target: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex)
  const [r2, g2, b2] = hexToRgb(target)
  return rgbToHex(r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount)
}

/** 由一个主色生成 4 个深浅变体（有学生省份轮换填充用） */
function provinceVariants(hex: string): string[] {
  return [
    mix(hex, '#ffffff', 0.18),
    hex,
    mix(hex, '#ffffff', 0.38),
    mix(hex, '#000000', 0.14),
  ]
}

interface ColorRowProps {
  label: string
  value: string
  onChange: (hex: string) => void
}

/** 单个颜色槽位：色块选择器 + hex 值回显 */
function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs text-stone-600">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-stone-400">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-7 w-9 cursor-pointer rounded-md border border-stone-200 bg-white p-0.5"
        />
      </span>
    </label>
  )
}

/**
 * 画布主题选择器：
 * - 5 套预设以小色板卡片呈现，点击即应用，当前选中的高亮描边
 * - 自定义区编辑关键槽位，任何改动都会把主题切换为 id='custom' 的自定义主题
 * 主题只影响地图画布，不影响操作界面 chrome。
 */
export default function ThemePicker() {
  const { theme, setTheme } = useMapData()

  const applyCustom = (patch: Partial<ThemeConfig>) => {
    setTheme({ ...theme, ...patch, id: 'custom', name: '自定义' })
  }

  // 自定义槽位初值取自当前主题（画布底色可能是渐变 → 取第一个色）
  const canvasHex = extractHex(theme.canvasBg)
  const provinceHex = extractHex(theme.provinceActive[0] ?? '#999999', '#999999')
  const accentHex = extractHex(theme.accent, '#44403c')
  const textHex = extractHex(theme.textColor, '#57534e')
  const leaderHex = extractHex(theme.leaderLine, '#a8a29e')

  return (
    <Section
      icon={Palette}
      title="画布风格"
      summary={theme.id === 'custom' ? '自定义' : theme.name}
    >
      <div className="space-y-3 md:space-y-4">
        {/* 预设色板 */}
        <div className="grid grid-cols-2 gap-2">
          {PRESET_THEMES.map((preset) => {
            const active = theme.id === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setTheme(preset)}
                aria-pressed={active}
                className={cn(
                  'group rounded-lg border bg-white p-1 text-left transition-all md:p-1.5',
                  active
                    ? 'border-stone-900 ring-1 ring-stone-900'
                    : 'border-stone-200 hover:border-stone-400',
                )}
              >
                {/* 迷你预览：画布底 + 省份色块 + 强调色点 */}
                <span
                  className="flex h-10 items-end gap-1 overflow-hidden rounded-md border border-stone-200/70 p-1.5 md:h-12"
                  style={{ background: preset.canvasBg }}
                >
                  {preset.provinceActive.slice(0, 3).map((c, i) => (
                    <span
                      key={i}
                      className="h-3.5 w-3.5 rounded-sm border border-black/10"
                      style={{ background: c }}
                    />
                  ))}
                  <span
                    className="ml-auto h-2.5 w-2.5 rounded-full border border-black/10"
                    style={{ background: preset.accent }}
                  />
                </span>
                <span
                  className={cn(
                    'mt-1.5 block px-0.5 text-xs',
                    active ? 'font-semibold text-stone-900' : 'text-stone-600',
                  )}
                >
                  {preset.name}
                </span>
              </button>
            )
          })}
        </div>

        {/* 自定义槽位 */}
        <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-2.5 md:space-y-2.5 md:p-3">
          <p className="text-xs font-medium text-stone-600">自定义颜色</p>
          <ColorRow
            label="画布底色"
            value={canvasHex}
            onChange={(hex) =>
              applyCustom({ canvasBg: hex, footerBg: mix(hex, '#000000', 0.05) })
            }
          />
          <ColorRow
            label="有学生省份色"
            value={provinceHex}
            onChange={(hex) => applyCustom({ provinceActive: provinceVariants(hex) })}
          />
          <ColorRow
            label="强调色"
            value={accentHex}
            onChange={(hex) => applyCustom({ accent: hex })}
          />
          <ColorRow
            label="文字色"
            value={textHex}
            onChange={(hex) => applyCustom({ textColor: hex })}
          />
          <ColorRow
            label="引线色"
            value={leaderHex}
            onChange={(hex) => applyCustom({ leaderLine: hex })}
          />
          <p className="text-[11px] leading-4 text-stone-400">
            修改任意颜色即切换为「自定义」主题；省份色会自动生成 4 个深浅变体轮换使用
          </p>
        </div>
      </div>
    </Section>
  )
}
