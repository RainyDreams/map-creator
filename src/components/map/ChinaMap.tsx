import { useEffect, useId, useMemo, useState } from 'react'
import type { CalligraphyAsset, StudentBadge, StudentEntry } from '@/types'
import { useMapData } from '@/store/MapDataContext'
import { prefetchCityCenters } from '@/utils/cities'
import { slotFontFamily } from '@/utils/fonts'
import {
  DESIGN_W,
  getGeoFeatures,
  INSET,
  isGeoReady,
  loadGeoFeatures,
  MAP_H,
  MAP_TRANSFORM,
  MAP_X0,
  MAP_X1,
  TOP,
  BOTTOM,
} from './geo'
import { computeLabelLayout, textEms, type CityCenterMap, type UniEnrichment } from './labels'
import { LabelColumns } from './LabelColumns'

export interface ChinaMapProps {
  /** 省份全称 → 该省学生列表（已在外层分组好） */
  groups: Map<string, StudentEntry[]>
  /** 左下角覆盖层（老师名单块）需预留的高度（viewBox 单位） */
  reserveLeftBottom?: number
  /** 右下角覆盖层（未定位提示块）需预留的高度（viewBox 单位） */
  reserveRightBottom?: number
  /** 原始校名 → 院校补充信息（软科排名/校徽），提供后省内按排名排序 */
  uniInfo?: Map<string, UniEnrichment>
  /** 三个标注模块的字号（px，以 1500px 宽画布为基准） */
  labelSizes?: { province: number; person: number; place: number }
  /** 省内手动排序的省份（保持手动顺序，不按排名重排） */
  manualProvinces?: Set<string>
  /** 大学名 → 用户上传的毛笔字图片（提供后该校文字被图片替代） */
  calligraphy?: Record<string, CalligraphyAsset>
  /** 学生 id → 校徽覆盖（隐藏或自定义图片） */
  badgeOverrides?: Record<string, StudentBadge>
}

/**
 * 中国地图 SVG：省份色块 + 南海诸岛小插图 + 城市级定位点 + 左右标注列与引线。
 * 宽度自适应容器，高度按 viewBox 等比缩放；内部全部为 SVG 文本，导出 PNG 时清晰。
 * 定位点优先落到学生实际城市（/api/cities 提供坐标）；接口不可用时回退省份质心。
 */
export function ChinaMap({ groups, reserveLeftBottom, reserveRightBottom, uniInfo, labelSizes, manualProvinces, calligraphy, badgeOverrides }: ChinaMapProps) {
  const { theme, fontSlots, customFonts } = useMapData()
  const [cityCenters, setCityCenters] = useState<CityCenterMap | null>(null)
  /** 地图轮廓数据（/data/china.json）异步加载：未就绪时渲染同尺寸占位 SVG，避免布局跳动 */
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
  // 桌面端与移动端布局会同时挂载两个 ChinaMap（CSS 隐藏其一）；
  // clipPath id 必须按实例唯一，否则 url(#id) 解析到另一个实例的裁剪区，小插图溢出画框
  const uid = useId().replace(/:/g, '')
  const mainClipId = `cf-main-clip-${uid}`
  const insetClipId = `cf-inset-clip-${uid}`

  /** 省份集合的稳定键，用于触发城市坐标预取 */
  const provincesKey = useMemo(() => [...groups.keys()].join('|'), [groups])

  useEffect(() => {
    const provinces = provincesKey === '' ? [] : provincesKey.split('|')
    if (provinces.length === 0) {
      setCityCenters(null)
      return
    }
    let cancelled = false
    prefetchCityCenters(provinces)
      .then((m) => {
        if (!cancelled) setCityCenters(m.size > 0 ? m : null)
      })
      .catch(() => {
        if (!cancelled) setCityCenters(null)
      })
    return () => {
      cancelled = true
    }
  }, [provincesKey])

  /**
   * 换行判定用的真实文字宽度测量（canvas measureText + 姓名/地点实际字体栈）。
   * 字体未就绪时 measureText 回落到已加载字体，测量偏保守；fontTick 在字体
   * 就绪后触发 layout 重算，消除「（北京）· 北京」这类行的误换行。
   */
  const personFont = slotFontFamily('person', fontSlots, customFonts)
  const placeFont = slotFontFamily('place', fontSlots, customFonts)
  const measureCtx = useMemo(() => document.createElement('canvas').getContext('2d'), [])
  const measure = useMemo(
    () =>
      (text: string, px: number, slot: 'person' | 'place'): number => {
        const family = slot === 'person' ? personFont : placeFont
        if (measureCtx) {
          try {
            measureCtx.font = `${px}px ${family}`
            const w = measureCtx.measureText(text).width
            if (w > 0) return w
          } catch {
            // 回退估算
          }
        }
        return textEms(text) * px
      },
    [measureCtx, personFont, placeFont],
  )

  /** 网络字体/自定义字体加载完成后触发一次重排，让换行判定用到真实字宽 */
  const [fontTick, setFontTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    document.fonts?.ready
      ?.then(() => {
        if (!cancelled) setFontTick((t) => t + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [personFont, placeFont])

  const layout = useMemo(
    () =>
      computeLabelLayout(groups, cityCenters ?? undefined, {
        reserveLeftBottom,
        reserveRightBottom,
        uniInfo,
        sizes: labelSizes,
        manualProvinces,
        measure,
        calligraphy,
        badgeOverrides,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, cityCenters, reserveLeftBottom, reserveRightBottom, uniInfo, labelSizes, manualProvinces, measure, fontTick, calligraphy, badgeOverrides],
  )

  const fillByName = useMemo(() => {
    const m = new Map<string, string>()
    const actives = theme.provinceActive
    let i = 0
    for (const name of groups.keys()) {
      m.set(name, actives[i % actives.length])
      i += 1
    }
    return m
  }, [groups, theme.provinceActive])

  /** 城市级定位圆点：每省一个主点（引线起点/点簇中心），多城市时逐城一个小副点 */
  const dots = useMemo(() => {
    const list: Array<{ key: string; x: number; y: number; primary: boolean }> = []
    for (const b of [...layout.left, ...layout.right]) {
      list.push({ key: `${b.province}-main`, x: b.centroidX, y: b.centroidY, primary: true })
      b.cityPoints.forEach((p, idx) => {
        if (Math.abs(p.x - b.centroidX) < 0.01 && Math.abs(p.y - b.centroidY) < 0.01) return
        list.push({ key: `${b.province}-${idx}`, x: p.x, y: p.y, primary: false })
      })
    }
    return list
  }, [layout])

  // 地图数据未就绪：渲染与正式图同高度的占位 SVG（与 labels.ts 的 svgHeight 公式一致）
  if (!geoReady) {
    const h = Math.max(
      TOP + MAP_H + BOTTOM + Math.max(reserveLeftBottom ?? 0, reserveRightBottom ?? 0),
      120,
    )
    return (
      <svg
        viewBox={`0 0 ${DESIGN_W} ${Math.round(h)}`}
        className="block h-auto w-full"
        role="img"
        aria-label="地图加载中"
      />
    )
  }
  const features = getGeoFeatures()

  return (
    <svg
      viewBox={`0 0 ${DESIGN_W} ${Math.round(layout.svgHeight)}`}
      className="block h-auto w-full"
      role="img"
      aria-label="班级蹭饭地图"
      style={{
        fontFamily: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif',
      }}
    >
      <defs>
        <clipPath id={mainClipId}>
          <rect x={MAP_X0 - 6} y={TOP - 6} width={MAP_X1 - MAP_X0 + 12} height={MAP_H + 12} />
        </clipPath>
        <clipPath id={insetClipId}>
          <rect x={INSET.x} y={INSET.y} width={INSET.w} height={INSET.h} />
        </clipPath>
      </defs>

      {/* 主图省份（裁剪掉 17.5°N 以南，南沙等只进小插图）；无名要素为十段线细多边形，用引线色填充+描边保证亚像素厚度下仍可见 */}
      <g clipPath={`url(#${mainClipId})`}>
        <g transform={MAP_TRANSFORM}>
          {features.map((f, i) =>
            f.name === '' ? (
              <path
                key={`dash-${i}`}
                d={f.d}
                fill={theme.leaderLine}
                stroke={theme.leaderLine}
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <path
                key={f.name}
                d={f.d}
                fill={fillByName.get(f.name) ?? theme.provinceBase}
                stroke="#ffffff"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ),
          )}
        </g>
      </g>

      {/* 南海诸岛小插图：白底增强对比，十段线细多边形用引线色填充+描边 */}
      <rect
        x={INSET.x}
        y={INSET.y}
        width={INSET.w}
        height={INSET.h}
        rx={3}
        fill="#ffffff"
        stroke={theme.leaderLine}
        strokeWidth={1}
        opacity={0.75}
      />
      <g clipPath={`url(#${insetClipId})`}>
        <g transform={INSET.transform}>
          {features.map((f, i) =>
            f.name === '' ? (
              <path
                key={`inset-dash-${i}`}
                d={f.d}
                fill={theme.leaderLine}
                stroke={theme.leaderLine}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              // 白底小插图上白色描边会隐形，海南/台湾/南海诸岛必须用引线色描边才能看清轮廓
              <path
                key={`inset-${f.name}`}
                d={f.d}
                fill={fillByName.get(f.name) ?? theme.provinceBase}
                stroke={theme.leaderLine}
                strokeWidth={0.8}
                strokeOpacity={0.65}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ),
          )}
        </g>
      </g>

      {/* 标注列 + 引线 */}
      <LabelColumns left={layout.left} right={layout.right} />

      {/* 城市级定位圆点（压在引线起点之上）；主点带光晕，多城市时副点略小 */}
      {dots.map((d) =>
        d.primary ? (
          <g key={`dot-${d.key}`}>
            <circle cx={d.x} cy={d.y} r={5.5} fill={theme.accent} opacity={0.25} />
            <circle cx={d.x} cy={d.y} r={3.5} fill={theme.accent} stroke="#ffffff" strokeWidth={1.4} />
          </g>
        ) : (
          <circle
            key={`dot-${d.key}`}
            cx={d.x}
            cy={d.y}
            r={2.6}
            fill={theme.accent}
            stroke="#ffffff"
            strokeWidth={1.1}
            opacity={0.9}
          />
        ),
      )}
    </svg>
  )
}
