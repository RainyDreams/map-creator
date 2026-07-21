import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlignCenter, AlignLeft, PenLine } from 'lucide-react'
import { useMapData } from '@/store/MapDataContext'
import { cn } from '@/lib/utils'
import type { MapData } from '@/types'

/** 标题与届数：实时写入 store，地图页联动 */
export default function MetaForm() {
  const { data, setData } = useMapData()

  const setAlign = (titleAlign: MapData['titleAlign']) =>
    setData((prev) => ({ ...prev, titleAlign }))

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
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-stone-600 md:text-sm">标题排布</Label>
          {/* Segmented 小控件：居左 / 居中，写入 data.titleAlign */}
          <div
            role="radiogroup"
            aria-label="标题排布"
            className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5"
          >
            {(
              [
                { value: 'left', label: '居左', icon: AlignLeft },
                { value: 'center', label: '居中', icon: AlignCenter },
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
      </CardContent>
    </Card>
  )
}
