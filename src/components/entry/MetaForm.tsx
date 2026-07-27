import { useRef, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Section } from '@/components/entry/Section'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ImagePlus,
  PenLine,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useMapData } from '@/store/MapDataContext'
import { breadcrumb } from '@/utils/sessionLog'
import { FontSelect } from '@/components/entry/FontSelect'
import { SizeSelect } from '@/components/entry/SizeSelect'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { MapData } from '@/types'

/** 标题字号档位（px，以 1500px 宽画布为基准） */
const TITLE_SIZE_OPTIONS = [20, 24, 28, 30, 32, 36, 40, 44, 48, 52, 56] as const
const SUBTITLE_SIZE_OPTIONS = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28] as const

/** 图片压缩为 128px 内的 PNG dataURL（localStorage 友好） */
function fileToBadgeDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 128 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('无法创建画布'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('图片读取失败'))
    }
    img.src = URL.createObjectURL(file)
  })
}

/**
 * 标题个性化子分区（字体 / 字号 / 排布）：
 * 移动端信息优先——个性化选项排在信息之后并默认折叠；
 * 桌面端空间充裕默认展开。外观是轻量的虚线分区，不与外层卡片混淆。
 */
function PersonalizePanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(
    () =>
      typeof window === 'undefined' ||
      !window.matchMedia('(max-width: 767px)').matches,
  )
  return (
    <div className="rounded-lg border border-dashed border-stone-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-medium text-stone-600 md:text-sm">标题个性化</span>
        <span className="text-[11px] text-stone-400">字体 · 字号 · 排布</span>
        <ChevronDown
          className={cn(
            'ml-auto h-3.5 w-3.5 text-stone-400 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        {/* 同 Section：min-w-0 防撑破、横向 clip、纵向放行下拉浮层 */}
        <div className={open ? 'min-w-0 overflow-x-clip overflow-y-visible' : 'overflow-hidden'}>
          <div className="space-y-3 border-t border-dashed border-stone-200 px-3 py-3 md:space-y-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 标题控制区：大标题（年份与「蹭饭图」都直接写进标题）+ 副标题 + 班徽为信息区，
 * 字体 / 字号 / 排布收进「标题个性化」子分区，实时写入 store、地图页联动。
 */
export default function MetaForm() {
  const { data, setData, badge, setBadge, fontSlots, setFontSlot } = useMapData()
  const badgeRef = useRef<HTMLInputElement>(null)

  const setAlign = (titleAlign: MapData['titleAlign']) => {
    breadcrumb(`班级信息：标题排布 → ${titleAlign}`)
    setData((prev) => ({ ...prev, titleAlign }))
  }

  async function handleBadge(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片过大', { description: '请选择 5MB 以内的图片' })
      return
    }
    try {
      setBadge(await fileToBadgeDataUrl(file))
      breadcrumb(`班级信息：上传班徽（${Math.round(file.size / 1024)}KB）`)
      toast.success('班徽已添加，显示在画布标题旁')
    } catch {
      breadcrumb('班级信息：班徽图片读取失败')
      toast.error('图片读取失败，请重试')
    }
  }

  return (
    <Section icon={PenLine} title="班级信息">
      <div className="space-y-3 md:space-y-4">
        {/* —— 信息区：大标题 / 英文副标题 / 校徽班徽，移动端优先呈现 —— */}
        <div className="space-y-1.5">
          <Label htmlFor="map-title" className="text-xs text-stone-600 md:text-sm">
            大标题
          </Label>
          <Input
            id="map-title"
            value={data.title}
            onChange={(e) => setData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="如：2026届 高三（2）班蹭饭图"
            className="h-8 border-transparent bg-stone-50 text-xs hover:bg-stone-100 focus-visible:ring-stone-300 md:h-9 md:text-sm"
          />
          <p className="text-[11px] text-stone-400">
            年份/届数与「蹭饭图」都直接写进标题；标题中的数字可用下方专用字体渲染
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="map-subtitle" className="text-xs text-stone-600 md:text-sm">
            英文副标题（可选）
          </Label>
          <Input
            id="map-subtitle"
            value={data.subtitle}
            onChange={(e) => setData((prev) => ({ ...prev, subtitle: e.target.value }))}
            placeholder="如：CLASS OF 2026"
            className="h-8 border-transparent bg-stone-50 text-xs hover:bg-stone-100 focus-visible:ring-stone-300 md:h-9 md:text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-stone-600 md:text-sm">校徽 / 班徽（可选）</Label>
          <div className="flex items-center gap-2">
            {badge !== null ? (
              <>
                <img
                  src={badge}
                  alt="班徽预览"
                  className="h-10 w-10 rounded-full border border-stone-200 object-contain"
                />
                <button
                  type="button"
                  onClick={() => { breadcrumb('班级信息：移除班徽'); setBadge(null) }}
                  className="flex items-center gap-1 rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-500 hover:bg-stone-50"
                >
                  <X className="h-3 w-3" />
                  移除
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => badgeRef.current?.click()}
                className="flex items-center gap-1 rounded-md border border-dashed border-stone-300 px-2.5 py-1.5 text-xs text-stone-500 hover:bg-stone-50 hover:text-stone-700"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                上传图片
              </button>
            )}
            <input
              ref={badgeRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleBadge(f)
                e.target.value = ''
              }}
            />
          </div>
          {/* 班徽大小：24–96px（默认 48），实时反映到地图页标题区 */}
          {badge !== null && (
            <div className="flex items-center gap-2 pt-1.5">
              <span className="shrink-0 text-[11px] text-stone-500">大小</span>
              <Slider
                value={data.badgeSize}
                min={24}
                max={96}
                step={2}
                format={(v) => `${v}px`}
                aria-label="班徽大小"
                onChange={(v) => setData((prev) => ({ ...prev, badgeSize: v }))}
              />
            </div>
          )}
        </div>

        {/* —— 个性化区：字体 / 字号 / 排布，移动端默认折叠、排在信息之后 —— */}
        <PersonalizePanel>
          {/* 标题字体：按字符类型分 数字 / 英文 / 中文 三个槽位 */}
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-stone-600 md:text-sm">数字字体</Label>
              <div className="flex items-center">
                <FontSelect
                  value={fontSlots.digit}
                  onChange={(id) => setFontSlot('digit', id)}
                  ariaLabel="数字字体"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-stone-600 md:text-sm">英文字体</Label>
              <div className="flex items-center">
                <FontSelect
                  value={fontSlots.latin}
                  onChange={(id) => setFontSlot('latin', id)}
                  ariaLabel="英文字体"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-stone-600 md:text-sm">中文字体</Label>
              <div className="flex items-center">
                <FontSelect
                  value={fontSlots.han}
                  onChange={(id) => setFontSlot('han', id)}
                  ariaLabel="中文字体"
                />
              </div>
            </div>
          </div>

          {/* 标题字号（px 下拉，与标注字号同一控件） */}
          <div className="space-y-1.5">
            <Label className="text-xs text-stone-600 md:text-sm">标题字号</Label>
            <div className="flex items-center">
              <SizeSelect
                value={data.titleSize}
                options={TITLE_SIZE_OPTIONS}
                onChange={(px) => setData((prev) => ({ ...prev, titleSize: px }))}
                ariaLabel="标题字号"
              />
            </div>
          </div>

          {/* 副标题字号（px 下拉，与标题字号同一控件） */}
          <div className="space-y-1.5">
            <Label className="text-xs text-stone-600 md:text-sm">副标题字号</Label>
            <div className="flex items-center">
              <SizeSelect
                value={data.subtitleSize}
                options={SUBTITLE_SIZE_OPTIONS}
                onChange={(px) => setData((prev) => ({ ...prev, subtitleSize: px }))}
                ariaLabel="副标题字号"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-stone-600 md:text-sm">标题排布</Label>
            <div
              role="radiogroup"
              aria-label="标题排布"
              className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5"
            >
              {(
                [
                  { value: 'left', label: '居左', icon: AlignLeft },
                  { value: 'center', label: '居中', icon: AlignCenter },
                  { value: 'right', label: '居右', icon: AlignRight },
                ] as const
              ).map(({ value, label, icon: Icon }) => {
                const active = data.titleAlign === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setAlign(value)}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors md:px-3 md:text-sm',
                      active
                        ? 'bg-white font-medium text-stone-800 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </PersonalizePanel>
      </div>
    </Section>
  )
}
