import { useMapData } from '@/store/MapDataContext'
import type { LabelBlock } from './labels'

/** 省份名等装饰文字：马善政毛笔体优先，楷体兜底；学生姓名行保持默认黑体以保证生僻字可读 */
const CALLIGRAPHY = '"MaShanZheng","Kaiti SC","STKaiti","KaiTi","楷体",serif'

export interface LabelColumnsProps {
  left: LabelBlock[]
  right: LabelBlock[]
}

/**
 * 左右两列标注块 + 引线。
 * 引线为质心 → 标注块边缘的三次贝塞尔曲线（主题 leaderLine 色、1px、柔和虚线），
 * 两个控制点取在两端点水平中点处，弧线自然过渡、不穿标注块。
 */
export function LabelColumns({ left, right }: LabelColumnsProps) {
  const { theme } = useMapData()
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
              style={{ fontFamily: CALLIGRAPHY }}
            >
              {b.province}
            </text>
            {b.lines.map((ln, i) => (
              <text
                key={`${b.province}-${i}`}
                x={b.anchorX}
                y={b.firstLineBaseline + i * b.lineH}
                textAnchor={b.textAnchor}
                fontSize={b.lineSize}
                fill={theme.textColor}
              >
                {ln}
              </text>
            ))}
          </g>
        )
      })}
    </g>
  )
}
