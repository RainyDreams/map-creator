import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import { schoolBadgeUrl } from '@/utils/universities'
import { textEms, type LabelBlock, type StudentLineParts } from './labels'

export interface LabelColumnsProps {
  left: LabelBlock[]
  right: LabelBlock[]
}

/** 校徽边长 = 地点字号 × 1.05，图标与文字间距 2px（与 labels.ts 的行宽估算一致） */
const BADGE_RATIO = 1.05
const BADGE_GAP = 2

interface LineGeom {
  personX: number
  personAnchor: 'start' | 'end'
  placeX: number
  placeAnchor: 'start' | 'end'
  badgeX: number | null
  badgeSize: number
}

/**
 * 计算一行内 姓名 / 校徽 / 大学·城市 三段的水平位置。
 * 右列（左对齐）：姓名 →（全角空格）→ 校徽 → 地点段，依次向右排；
 * 左列（右对齐）：地点段贴锚点右对齐，校徽在地点段左侧，姓名再向左排。
 * 宽度全部用 labels.ts 的 textEms 估算（CJK 为等宽 1em，估算精度足够）。
 */
function lineGeom(b: LabelBlock, ln: StudentLineParts): LineGeom {
  const k = ln.scale ?? 1
  const pSize = b.personSize * k
  const zSize = b.placeSize * k
  const badgeSize = zSize * BADGE_RATIO
  const personW = textEms(ln.person) * pSize
  const spaceW = pSize // 姓名与大学间的全角空格
  const placeW = textEms(ln.place) * zSize
  const badgeW = ln.badge ? badgeSize + BADGE_GAP : 0

  if (b.textAnchor === 'start') {
    const badgeX = ln.badge ? b.anchorX + personW + spaceW : null
    return {
      personX: b.anchorX,
      personAnchor: 'start',
      placeX: b.anchorX + personW + spaceW + badgeW,
      placeAnchor: 'start',
      badgeX,
      badgeSize,
    }
  }
  // 右对齐：地点段右端贴锚点
  const placeX = b.anchorX
  const badgeX = ln.badge ? b.anchorX - placeW - badgeSize : null
  const personX = b.anchorX - placeW - badgeW - spaceW
  return {
    personX,
    personAnchor: 'end',
    placeX,
    placeAnchor: 'end',
    badgeX,
    badgeSize,
  }
}

/**
 * 左右两列标注块 + 引线。
 * 引线为质心 → 标注块边缘的三次贝塞尔曲线（主题 leaderLine 色、1px、柔和虚线），
 * 两个控制点取在两端点水平中点处，弧线自然过渡、不穿标注块。
 * 学生行拆分为 姓名 / 大学·城市 两个 text，分别应用「姓名」与「城市/大学」字体槽位与字号；
 * 有校徽的院校在大学名前渲染校徽图标（本站代理地址，同源无跨域污染，可随导出进 PNG）。
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
            {b.lines.map((ln, i) => {
              const k = ln.scale ?? 1
              const g = lineGeom(b, ln)
              const baseline = b.firstLineBaseline + i * b.lineH
              return (
                <g key={`${b.province}-${i}`}>
                  <text
                    x={g.personX}
                    y={baseline}
                    textAnchor={g.personAnchor}
                    fontSize={b.personSize * k}
                    fill={theme.textColor}
                    style={{ fontFamily: personFont }}
                  >
                    {ln.person}
                  </text>
                  {g.badgeX !== null && ln.uni && (
                    <image
                      href={schoolBadgeUrl(ln.uni)}
                      x={g.badgeX}
                      y={baseline - g.badgeSize * 0.86}
                      width={g.badgeSize}
                      height={g.badgeSize}
                    />
                  )}
                  <text
                    x={g.placeX}
                    y={baseline}
                    textAnchor={g.placeAnchor}
                    fontSize={b.placeSize * k}
                    fill={theme.textColor}
                    style={{ fontFamily: placeFont }}
                  >
                    {ln.place}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
    </g>
  )
}
