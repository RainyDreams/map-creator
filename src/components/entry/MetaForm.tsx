import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlignCenter, AlignLeft, AlignRight, ImagePlus, PenLine, X } from 'lucide-react'
import { toast } from 'sonner'
import { useMapData } from '@/store/MapDataContext'
import { cn } from '@/lib/utils'
import type { MapData } from '@/types'

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

/** 标题/届数/副标题/标题排布/班徽：实时写入 store，地图页联动 */
export default function MetaForm() {
  const { data, setData, badge, setBadge } = useMapData()
  const badgeRef = useRef<HTMLInputElement>(null)

  const setAlign = (titleAlign: MapData['titleAlign']) =>
    setData((prev) => ({ ...prev, titleAlign }))

  async function handleBadge(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片过大', { description: '请选择 5MB 以内的图片' })
      return
    }
    try {
      setBadge(await fileToBadgeDataUrl(file))
      toast.success('班徽已添加，显示在画布标题旁')
    } catch {
      toast.error('图片读取失败，请重试')
    }
  }

  return (
    <Card className="gap-4 rounded-xl border-stone-200 bg-white py-4 shadow-sm md:gap-6 md:py-6">
      <CardHeader className="px-4 pb-0 md:px-6">
        <CardTitle className="flex items-center gap-2 text-sm text-stone-700 md:text-base">
          <PenLine className="h-4 w-4 text-stone-400" />
          班级信息
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 md:space-y-4 md:px-6">
        <div className="space-y-1.5">
          <Label htmlFor="map-title" className="text-xs text-stone-600 md:text-sm">
            标题
          </Label>
          <Input
            id="map-title"
            value={data.title}
            onChange={(e) => setData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="如：2026届 高三（2）班"
            className="h-8 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:h-9 md:text-sm"
          />
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
            className="h-8 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:h-9 md:text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="map-year" className="text-xs text-stone-600 md:text-sm">
            届数 / 年份
          </Label>
          <Input
            id="map-year"
            value={data.year}
            onChange={(e) => setData((prev) => ({ ...prev, year: e.target.value }))}
            placeholder="如：2026"
            inputMode="numeric"
            className="h-8 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:h-9 md:text-sm"
          />
          <p className="text-[11px] text-stone-400">
            标题中已含年份时，画布不会重复显示大号年份
          </p>
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
                  onClick={() => setBadge(null)}
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
        </div>
      </CardContent>
    </Card>
  )
}
