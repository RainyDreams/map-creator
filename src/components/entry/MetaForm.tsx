import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PenLine } from 'lucide-react'
import { useMapData } from '@/store/MapDataContext'

/** 标题与届数：实时写入 store，地图页联动 */
export default function MetaForm() {
  const { data, setData } = useMapData()

  return (
    <Card className="rounded-xl border-amber-200/70 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-stone-700">
          <PenLine className="h-4 w-4 text-amber-600" />
          班级信息
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="map-title" className="text-stone-600">
            标题
          </Label>
          <Input
            id="map-title"
            value={data.title}
            onChange={(e) => setData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="如：2026届 高三（2）班"
            className="border-amber-200/80 bg-amber-50/40 focus-visible:ring-amber-300"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="map-year" className="text-stone-600">
            届数 / 年份
          </Label>
          <Input
            id="map-year"
            value={data.year}
            onChange={(e) => setData((prev) => ({ ...prev, year: e.target.value }))}
            placeholder="如：2026"
            inputMode="numeric"
            className="border-amber-200/80 bg-amber-50/40 focus-visible:ring-amber-300"
          />
        </div>
      </CardContent>
    </Card>
  )
}
