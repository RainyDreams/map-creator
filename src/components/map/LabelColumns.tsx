import { useMemo } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import { schoolBadgeUrl } from '@/utils/universities'
import { BADGE_GAP, BADGE_RATIO, textEms, type LabelBlock, type StudentLineParts } from './labels'

export interface LabelColumnsProps {
  left: LabelBlock[]
  right: LabelBlock[]
}

/**
 * 左右两列标注块 + 引线。
 * 引线为质心 → 标注块边缘的三次贝塞尔曲线（主题 leaderLine 色、1px、柔和虚线），
 * 两个控制点取在两端点水平中点处，弧线自然过渡、不穿标注块。
 *
 * 学生行排版：`姓名[校徽]大学 · 城市`——姓名/校徽/大学之间无间隙；
 * 超长校名由 labels.ts 预先换行（placeLines），此处逐行渲染：
 * 首行与姓名同行，续行与大学起点对齐；绝不省略号截断、不缩小单行字号。
 * 校徽渲染在大学段第一行文字前（本站代理地址，同源无跨域污染，可随导出进 PNG）。
 */
export function LabelColumns({ left, right }: LabelColumnsProps) {
  const { theme, fontSlots, customFonts } = useMapData()
  const provinceFont = slotFontFamily('province', fontSlots, customFonts)
  const personFont = slotFontFamily('person', fontSlots, customFonts)
  const placeFont = slotFontFamily('place', fontSlots, customFonts)

  /**
   * 文字真实宽度测量（canvas measureText + 实际字体栈）。
   * 右对齐列的校徽/姓名定位必须精确——按 em 估算会把「 · 」等窄字符算宽，
   * 导致校徽与校名之间出现明显间隙。字体未就绪等异常时回退 em 估算。
   */
  const measureCtx = useMemo(() => document.createElement('canvas').getContext('2d'), [])
  const measureW = (text: string, px: number, family: string): number => {
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
  }

  /** 渲染一个学生行（可能占多行），返回占用行数 */
  function renderStudent(b: LabelBlock, ln: StudentLineParts, rowOffset: number, key: string) {
    const badgeSize = b.placeSize * BADGE_RATIO
    // 校徽与校名之间无间隙；与姓名之间留 BADGE_GAP 呼吸（大学独占行时不需要）
    const placeOnOwnLines = ln.placeLines[0] === ''
    const gap = ln.badge && !placeOnOwnLines ? BADGE_GAP : 0
    const badgeSlot = ln.badge ? badgeSize + gap : 0
    const badgeRow = placeOnOwnLines ? 1 : 0
    const personW = measureW(ln.person, b.personSize, personFont)

    const rows: React.ReactNode[] = []
    // 姓名（仅首行）
    const row0Baseline = b.firstLineBaseline + rowOffset * b.lineH
    if (b.textAnchor === 'start') {
      rows.push(
        <text
          key={`${key}-p`}
          x={b.anchorX}
          y={row0Baseline}
          textAnchor="start"
          fontSize={b.personSize}
          fill={theme.textColor}
          style={{ fontFamily: personFont }}
        >
          {ln.person}
        </text>,
      )
    } else {
      // 右对齐：姓名右端与校徽之间留 BADGE_GAP，校徽右缘顶到校名（无间隙）
      const placeW0 = placeOnOwnLines ? 0 : measureW(ln.placeLines[0], b.placeSize, placeFont)
      rows.push(
        <text
          key={`${key}-p`}
          x={b.anchorX - placeW0 - badgeSlot}
          y={row0Baseline}
          textAnchor="end"
          fontSize={b.personSize}
          fill={theme.textColor}
          style={{ fontFamily: personFont }}
        >
          {ln.person}
        </text>,
      )
    }

    // 校徽（在大学段第一行文字前）
    if (ln.badge && ln.uni) {
      const badgeBaseline = b.firstLineBaseline + (rowOffset + badgeRow) * b.lineH
      let badgeX: number
      if (b.textAnchor === 'start') {
        badgeX = b.anchorX + (placeOnOwnLines ? 0 : personW + gap)
      } else {
        const placeW = measureW(ln.placeLines[badgeRow] ?? '', b.placeSize, placeFont)
        badgeX = b.anchorX - placeW - badgeSize
      }
      rows.push(
        <image
          key={`${key}-b`}
          href={ln.badgeUrl ?? schoolBadgeUrl(ln.uni)}
          x={badgeX}
          y={badgeBaseline - badgeSize * 0.86}
          width={badgeSize}
          height={badgeSize}
        />,
      )
    }

    // 大学 · 城市（逐行；续行与大学起点对齐）
    ln.placeLines.forEach((seg, r) => {
      if (seg === '') return
      const baseline = b.firstLineBaseline + (rowOffset + r) * b.lineH
      let x: number
      if (b.textAnchor === 'start') {
        x = b.anchorX + (placeOnOwnLines ? (ln.badge ? badgeSize : 0) : personW + badgeSlot)
      } else {
        x = b.anchorX
      }
      rows.push(
        <text
          key={`${key}-z${r}`}
          x={x}
          y={baseline}
          textAnchor={b.textAnchor}
          fontSize={b.placeSize}
          fill={theme.textColor}
          style={{ fontFamily: placeFont }}
        >
          {seg}
        </text>,
      )
    })

    return { nodes: rows, rows: ln.placeLines.length }
  }

  return (
    <g>
      {[...left, ...right].map((b) => {
        const midX = (b.centroidX + b.edgeX) / 2
        let rowOffset = 0
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
              const { nodes, rows } = renderStudent(b, ln, rowOffset, `${b.province}-${i}`)
              rowOffset += rows
              return <g key={`${b.province}-${i}`}>{nodes}</g>
            })}
          </g>
        )
      })}
    </g>
  )
}
