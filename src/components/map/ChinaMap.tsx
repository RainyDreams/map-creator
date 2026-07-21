import { useEffect, useMemo, useState } from 'react'
import type { StudentEntry } from '@/types'
import { prefetchCityCenters } from '@/utils/cities'
import {
  DESIGN_W,
  GEO_FEATURES,
  INSET,
  MAP_H,
  MAP_TRANSFORM,
  MAP_X0,
  MAP_X1,
  TOP,
} from './geo'
import { computeLabelLayout, type CityCenterMap } from './labels'
import { LabelColumns } from './LabelColumns'

/** 无学生省份：浅米色 */
const EMPTY_FILL = '#ece4cf'
/** 有学生省份：低饱和暖色轮换 */
const ACTIVE_FILLS = [
  '#f0b26b',
  '#e89a6a',
  '#ecc369',
  '#dd9264',
  '#e5b05f',
  '#e9c07f',
  '#df9f7e',
  '#e6bd57',
]
const DOT_FILL = '#c2410c'

export interface ChinaMapProps {
  /** 省份全称 → 该省学生列表（已在外层分组好） */
  groups: Map<string, StudentEntry[]>
  /** 左下角覆盖层（老师名单块）需预留的高度（viewBox 单位） */
  reserveLeftBottom?: number
  /** 右下角覆盖层（未定位提示块）需预留的高度（viewBox 单位） */
  reserveRightBottom?: number
}

/**
 * 中国地图 SVG：省份色块 + 南海诸岛小插图 + 城市级定位点 + 左右标注列与引线。
 * 宽度自适应容器，高度按 viewBox 等比缩放；内部全部为 SVG 文本，导出 PNG 时清晰。
 * 定位点优先落到学生实际城市（/api/cities 提供坐标）；接口不可用时回退省份质心。
 */
export function ChinaMap({ groups, reserveLeftBottom, reserveRightBottom }: ChinaMapProps) {
  const [cityCenters, setCityCenters] = useState<CityCenterMap | null>(null)

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

  const layout = useMemo(
    () =>
      computeLabelLayout(groups, cityCenters ?? undefined, {
        reserveLeftBottom,
        reserveRightBottom,
      }),
    [groups, cityCenters, reserveLeftBottom, reserveRightBottom],
  )

  const fillByName = useMemo(() => {
    const m = new Map<string, string>()
    let i = 0
    for (const name of groups.keys()) {
      m.set(name, ACTIVE_FILLS[i % ACTIVE_FILLS.length])
      i += 1
    }
    return m
  }, [groups])

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
        <clipPath id="cf-main-clip">
          <rect x={MAP_X0 - 6} y={TOP - 6} width={MAP_X1 - MAP_X0 + 12} height={MAP_H + 12} />
        </clipPath>
        <clipPath id="cf-inset-clip">
          <rect x={INSET.x} y={INSET.y} width={INSET.w} height={INSET.h} />
        </clipPath>
      </defs>

      {/* 主图省份（裁剪掉 17.5°N 以南，南沙等只进小插图） */}
      <g clipPath="url(#cf-main-clip)">
        <g transform={MAP_TRANSFORM}>
          {GEO_FEATURES.map((f, i) => (
            <path
              key={f.name || `feature-${i}`}
              d={f.d}
              fill={fillByName.get(f.name) ?? EMPTY_FILL}
              stroke="#ffffff"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          ))}
        </g>
      </g>

      {/* 南海诸岛小插图 */}
      <rect
        x={INSET.x}
        y={INSET.y}
        width={INSET.w}
        height={INSET.h}
        rx={3}
        fill="#f6eeda"
        stroke="#d3c19a"
        strokeWidth={1}
      />
      <g clipPath="url(#cf-inset-clip)">
        <g transform={INSET.transform}>
          {GEO_FEATURES.map((f, i) => (
            <path
              key={`inset-${f.name || i}`}
              d={f.d}
              fill={fillByName.get(f.name) ?? EMPTY_FILL}
              stroke="#ffffff"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          ))}
        </g>
      </g>

      {/* 标注列 + 引线 */}
      <LabelColumns left={layout.left} right={layout.right} />

      {/* 城市级定位圆点（压在引线起点之上）；主点带光晕，多城市时副点略小 */}
      {dots.map((d) =>
        d.primary ? (
          <g key={`dot-${d.key}`}>
            <circle cx={d.x} cy={d.y} r={5.5} fill={DOT_FILL} opacity={0.25} />
            <circle cx={d.x} cy={d.y} r={3.5} fill={DOT_FILL} stroke="#ffffff" strokeWidth={1.4} />
          </g>
        ) : (
          <circle
            key={`dot-${d.key}`}
            cx={d.x}
            cy={d.y}
            r={2.6}
            fill={DOT_FILL}
            stroke="#ffffff"
            strokeWidth={1.1}
            opacity={0.9}
          />
        ),
      )}
    </svg>
  )
}
