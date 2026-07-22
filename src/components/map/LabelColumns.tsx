import { useMemo } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import { schoolBadgeUrl } from '@/utils/universities'
import {
  BADGE_GAP,
  BADGE_RATIO,
  CALLI_RATIO,
  GROUP_GAP,
  NAME_PLACE_GAP,
  calliSize,
  studentRowCount,
  textEms,
  type LabelBlock,
  type StudentLineParts,
} from './labels'

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
  const { theme, fontSlots, customFonts, data } = useMapData()
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
    // 姓名与其后内容的间隙：有校徽时留 BADGE_GAP 呼吸（校徽与校名无间隙）；
    // 不显示校徽的同学（个人隐藏或全局关闭）姓名与校名之间留 NAME_PLACE_GAP，避免名字挨着校名
    const placeOnOwnLines = ln.ownLine
    const gapAfterName = placeOnOwnLines ? 0 : ln.badge ? BADGE_GAP : NAME_PLACE_GAP
    const badgeSlot = ln.badge ? badgeSize + gapAfterName : placeOnOwnLines ? 0 : gapAfterName
    const badgeRow = placeOnOwnLines ? 1 : 0
    const personW = measureW(ln.person, b.personSize, personFont)
    // 毛笔字图片尺寸（随地点字号与列缩放联动）
    const calli = ln.calli ?? null
    const calliW = calli ? calliSize(calli, b.placeSize).w : 0
    const calliH = calli ? b.placeSize * CALLI_RATIO * calli.sizeScale : 0
    /** 首行文本（大学/城市段第 0 行）宽度 */
    const firstTextW =
      ln.placeLines.length > 0 ? measureW(ln.placeLines[0] ?? '', b.placeSize, placeFont) : 0

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
      // 右对齐：姓名右端依次让出 文本+图片+校徽 的宽度（各段之间无间隙，姓名与校徽间留 BADGE_GAP）
      const rightW = (placeOnOwnLines ? 0 : firstTextW + (calli ? calliW + 2 : 0)) + badgeSlot
      rows.push(
        <text
          key={`${key}-p`}
          x={b.anchorX - rightW}
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

    // 校徽（在大学段第一行文字/图片前）
    if (ln.badge && ln.uni) {
      const badgeBaseline = b.firstLineBaseline + (rowOffset + badgeRow) * b.lineH
      let badgeX: number
      if (b.textAnchor === 'start') {
        badgeX = b.anchorX + (placeOnOwnLines ? 0 : personW + gapAfterName)
      } else {
        const afterW = firstTextW + (calli ? calliW + 2 : 0)
        badgeX = b.anchorX - afterW - badgeSize
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

    // 毛笔字图片（替代大学文字；校徽后直接跟随，无间隙）
    if (calli) {
      const imgBaseline = b.firstLineBaseline + (rowOffset + badgeRow) * b.lineH
      let imgX: number
      if (b.textAnchor === 'start') {
        imgX = b.anchorX + (placeOnOwnLines ? badgeSlot : personW + badgeSlot)
      } else {
        imgX = b.anchorX - firstTextW - (firstTextW > 0 ? 2 : 0) - calliW
      }
      rows.push(
        <image
          key={`${key}-c`}
          href={calli.dataUrl}
          x={imgX}
          y={imgBaseline - calliH * 0.8}
          width={calliW}
          height={calliH}
          preserveAspectRatio="none"
        />,
      )
    }

    // 大学 · 城市（逐行；续行与大学起点对齐）。有毛笔字图片时此处只剩「· 城市」文本
    ln.placeLines.forEach((seg, r) => {
      if (seg === '') return
      const baseline = b.firstLineBaseline + (rowOffset + r + (placeOnOwnLines ? 1 : 0)) * b.lineH
      let x: number
      if (b.textAnchor === 'start') {
        const lineStart =
          (placeOnOwnLines ? 0 : personW) + badgeSlot + (calli && r === 0 ? calliW + 2 : 0)
        x = b.anchorX + lineStart
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

    return { nodes: rows, rows: studentRowCount(ln) }
  }

  /** 渲染一个同校合并单元：姓名一人一行竖排，学校信息（校徽+毛笔字/文字）在右侧垂直居中只显示一次 */
  function renderGroup(b: LabelBlock, ln: StudentLineParts, rowOffset: number, key: string) {
    const names = ln.groupNames ?? []
    const badgeSize = b.placeSize * BADGE_RATIO
    const calli = ln.calli ?? null
    const calliW = calli ? calliSize(calli, b.placeSize).w : 0
    const calliH = calli ? b.placeSize * CALLI_RATIO * calli.sizeScale : 0
    const badgeSlot = ln.badge ? badgeSize + BADGE_GAP : 0
    const nameColW = Math.max(0, ...names.map((n) => measureW(n, b.personSize, personFont)))
    const schoolTextW = Math.max(0, ...ln.placeLines.map((t) => measureW(t, b.placeSize, placeFont)))
    const schoolW = badgeSlot + calliW + (calli && schoolTextW > 0 ? 2 : 0) + schoolTextW

    const rows = studentRowCount(ln)
    const schoolRows = Math.max(1, ln.placeLines.length)
    // 学校信息垂直居中于姓名列
    const schoolStart = rowOffset + (rows - schoolRows) / 2

    const nodes: React.ReactNode[] = []
    // 姓名列（一人一行）
    names.forEach((n, idx) => {
      const baseline = b.firstLineBaseline + (rowOffset + idx) * b.lineH
      const x = b.textAnchor === 'start' ? b.anchorX : b.anchorX - schoolW - GROUP_GAP
      nodes.push(
        <text
          key={`${key}-n${idx}`}
          x={x}
          y={baseline}
          textAnchor={b.textAnchor === 'start' ? 'start' : 'end'}
          fontSize={b.personSize}
          fill={theme.textColor}
          style={{ fontFamily: personFont }}
        >
          {n}
        </text>,
      )
    })
    // 学校信息：校徽 → 毛笔字图片 → 文字行
    const schoolX = b.textAnchor === 'start' ? b.anchorX + nameColW + GROUP_GAP : b.anchorX - schoolW
    const firstBaseline = b.firstLineBaseline + schoolStart * b.lineH
    if (ln.badge && ln.uni) {
      nodes.push(
        <image
          key={`${key}-b`}
          href={ln.badgeUrl ?? schoolBadgeUrl(ln.uni)}
          x={schoolX}
          y={firstBaseline - badgeSize * 0.86}
          width={badgeSize}
          height={badgeSize}
        />,
      )
    }
    if (calli) {
      nodes.push(
        <image
          key={`${key}-c`}
          href={calli.dataUrl}
          x={schoolX + badgeSlot}
          y={firstBaseline - calliH * 0.8}
          width={calliW}
          height={calliH}
          preserveAspectRatio="none"
        />,
      )
    }
    ln.placeLines.forEach((seg, r) => {
      if (seg === '') return
      const baseline = b.firstLineBaseline + (schoolStart + r) * b.lineH
      nodes.push(
        <text
          key={`${key}-z${r}`}
          x={schoolX + badgeSlot + (calli && r === 0 ? calliW + 2 : 0)}
          y={baseline}
          textAnchor="start"
          fontSize={b.placeSize}
          fill={theme.textColor}
          style={{ fontFamily: placeFont }}
        >
          {seg}
        </text>,
      )
    })
    return { nodes, rows }
  }

  const showCard = data.labelCardBg
  const cardRx = data.cardRadius

  const allBlocks = [...left, ...right]
  return (
    <g>
      {/* 第一遍：全部引线（压在卡片与文字下层——开启卡片背景时，引线被其他省份卡片
          自然遮住，视觉上不再穿过别人的名单） */}
      {allBlocks.map((b) => {
        const midX = (b.centroidX + b.edgeX) / 2
        const midY = (b.centroidY + b.centerY) / 2
        return (
          <path
            key={`leader-${b.province}`}
            d={`M${b.centroidX},${b.centroidY} C${midX},${b.centroidY} ${midX},${midY} ${b.edgeX},${b.centerY}`}
            fill="none"
            stroke={theme.leaderLine}
            strokeWidth={1}
            strokeDasharray="5 4"
            opacity={0.85}
          />
        )
      })}
      {/* 第二遍：卡片背景 + 省份名 + 学生行 */}
      {allBlocks.map((b) => {
        let rowOffset = 0
        return (
          <g key={b.province}>
            {showCard && (
              <rect
                x={b.cardX}
                y={b.cardY}
                width={b.cardW}
                height={b.cardH}
                rx={cardRx}
                fill={theme.footerBg}
                opacity={0.92}
                stroke={theme.leaderLine}
                strokeOpacity={0.35}
                strokeWidth={0.75}
              />
            )}
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
              const { nodes, rows } = ln.groupNames
                ? renderGroup(b, ln, rowOffset, `${b.province}-${i}`)
                : renderStudent(b, ln, rowOffset, `${b.province}-${i}`)
              rowOffset += rows
              return <g key={`${b.province}-${i}`}>{nodes}</g>
            })}
          </g>
        )
      })}
    </g>
  )
}
