import { useMemo } from 'react'
import type { StudentEntry } from '@/types'
import {
  DESIGN_W,
  GEO_FEATURES,
  INSET,
  MAP_H,
  MAP_TRANSFORM,
  MAP_X0,
  MAP_X1,
  TOP,
  getProvinceShape,
  projectToMap,
} from './geo'
import { computeLabelLayout } from './labels'
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
}

/**
 * 中国地图 SVG：省份色块 + 南海诸岛小插图 + 质心定位点 + 左右标注列与引线。
 * 宽度自适应容器，高度按 viewBox 等比缩放；内部全部为 SVG 文本，导出 PNG 时清晰。
 */
export function ChinaMap({ groups }: ChinaMapProps) {
  const layout = useMemo(() => computeLabelLayout(groups), [groups])

  const fillByName = useMemo(() => {
    const m = new Map<string, string>()
    let i = 0
    for (const name of groups.keys()) {
      m.set(name, ACTIVE_FILLS[i % ACTIVE_FILLS.length])
      i += 1
    }
    return m
  }, [groups])

  const dots = useMemo(() => {
    const list: Array<{ name: string; x: number; y: number }> = []
    for (const name of groups.keys()) {
      const c = getProvinceShape(name)?.centroid
      if (!c) continue
      const [x, y] = projectToMap(c[0], c[1])
      list.push({ name, x, y })
    }
    return list
  }, [groups])

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

      {/* 质心定位圆点（压在引线起点之上） */}
      {dots.map((d) => (
        <g key={`dot-${d.name}`}>
          <circle cx={d.x} cy={d.y} r={5.5} fill={DOT_FILL} opacity={0.25} />
          <circle cx={d.x} cy={d.y} r={3.5} fill={DOT_FILL} stroke="#ffffff" strokeWidth={1.4} />
        </g>
      ))}
    </svg>
  )
}
