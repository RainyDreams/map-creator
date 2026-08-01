import { useEffect, useMemo, useState } from 'react'
import { Palette } from 'lucide-react'
import { Section } from '@/components/entry/Section'
import { ProvinceColorPicker } from '@/components/entry/ProvinceColorPicker'
import { useMapData } from '@/store/MapDataContext'
import { getGeoFeatures, isGeoReady, loadGeoFeatures } from '@/components/map/geo'
import { resolveProvince } from '@/utils/geo'

/**
 * 省份颜色面板（v1.40）：集中调整每个省份在地图上的填色。
 * 分两组——「有同学的省份」（缺省跟随主题色板循环）与「其他省份」
 * （三态：保持默认底色 / 主题自动填充 / 自定义）。
 * 与学生名单模态框分组头部的颜色控件共用 ProvinceColorPicker，数据互通。
 */
export function ProvinceColorPanel() {
  const { data } = useMapData()
  const [geoReady, setGeoReady] = useState(isGeoReady())

  useEffect(() => {
    if (geoReady) return
    let cancelled = false
    loadGeoFeatures()
      .then(() => {
        if (!cancelled) setGeoReady(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [geoReady])

  const { active, others } = useMemo(() => {
    const activeSet = new Set<string>()
    for (const s of data.students) {
      if (s.overseas === true) continue
      const p = resolveProvince(s)
      if (p !== null) activeSet.add(p)
    }
    const all = geoReady ? getGeoFeatures().map((f) => f.name).filter((n) => n !== '') : []
    return {
      active: all.filter((n) => activeSet.has(n)),
      others: all.filter((n) => !activeSet.has(n)),
    }
  }, [data.students, geoReady])

  const customized = Object.keys(data.provinceColors).length

  const row = (name: string, allowAuto: boolean) => (
    <div key={name} className="flex items-center justify-between gap-1 rounded px-1 py-0.5">
      <span className="truncate text-xs text-stone-600">{name}</span>
      <ProvinceColorPicker prov={name} allowAuto={allowAuto} />
    </div>
  )

  return (
    <Section
      icon={Palette}
      title="省份颜色"
      titleHint="可选"
      summary={customized > 0 ? `已自定义 ${customized} 省` : '跟随主题'}
      mobileOpen={false}
      desktopOpen={false}
    >
      {!geoReady ? (
        <p className="text-xs text-stone-400">地图数据加载中…</p>
      ) : (
        <div className="space-y-3">
          {active.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-stone-500">
                有同学的省份（{active.length}）
              </p>
              <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-2">
                {active.map((n) => row(n, false))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 text-[11px] font-medium text-stone-500">
              其他省份（{others.length}）
            </p>
            <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-2">
              {others.map((n) => row(n, true))}
            </div>
          </div>
          <p className="text-[10px] leading-relaxed text-stone-400">
            只影响地图上的省份填色，名单卡片样式不变。无同学的省份可保持默认底色、
            按主题自动填充（渐变色点）或自定义颜色。
          </p>
        </div>
      )}
    </Section>
  )
}
