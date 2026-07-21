import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import type { LabelBlock } from './labels'

export interface LabelColumnsProps {
  left: LabelBlock[]
  right: LabelBlock[]
}

/**
 * 左右两列标注块 + 引线。
 * 引线为质心 → 标注块边缘的三次贝塞尔曲线（主题 leaderLine 色、1px、柔和虚线），
 * 两个控制点取在两端点水平中点处，弧线自然过渡、不穿标注块。
 * 学生行拆分为 姓名/地点 两个 tspan，分别应用「姓名」与「城市/大学」字体槽位。
 */
export function LabelColumns({ left, right }: LabelColumnsProps) {
  const { theme, fontSlots, customFonts } = useMapData()
  const provinceFont = slotFontFamily('province', fontSlots, customFonts)
  const personFont = slotFontFamily('person', fontSlots, customFonts)
  const placeFont = slotFontFamily('place', fontSlots, customFonts)

  return (
    <g>
      {[...left, ...right].map((b) => {
        const midX = (b.centroidX + b.edgeX) / 2
        return (
          <g key={b.province}>
            <path
              d={`M${b.centroidX},${b.centroidY} C${midX},${b.centroidY} ${midX},${b.centerY} ${b.edgeX},${b.centerY}`}
              fill="none"
              stroke={theme.leaderLine}
              strokeWidth={1}
              strokeDasharray="5 4"
              opacity={0.85}
            />
            <text
              x={b.anchorX}
              y={b.headerBaseline}
              textAnchor={b.textAnchor}
              fontSize={b.headerSize}
              fontWeight={700}
              fill={theme.textColor}
              style={{ fontFamily: provinceFont }}
            >
              {b.province}
            </text>
            {b.lines.map((ln, i) => (
              <text
                key={`${b.province}-${i}`}
                x={b.anchorX}
                y={b.firstLineBaseline + i * b.lineH}
                textAnchor={b.textAnchor}
                fontSize={b.lineSize * (ln.scale ?? 1)}
                fill={theme.textColor}
              >
                <tspan style={{ fontFamily: personFont }}>{ln.person}</tspan>
                <tspan>　</tspan>
                <tspan style={{ fontFamily: placeFont }}>{ln.place}</tspan>
              </text>
            ))}
          </g>
        )
      })}
    </g>
  )
}
