/**
 * 画布下方分布统计表（v1.25，可选模块）：
 * 在「排版设计 → 卡片样式 → 画布下方分布统计表」开启后，渲染在地图与页脚之间，
 * 随导出一起进 PNG。内容 = 各省份（拆分卡合并回基础省）人数降序 + 海外/境外 + 未定位，
 * 标题行带全班总人数。字号/间距用 cqw 随画布宽度缩放（与 TeachersBlock 同一套）。
 * 不交互、纯展示；无数据时不渲染（MapPage 侧已挡）。
 */
import { useMemo } from 'react'
import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import { baseProvince, type StudentEntry } from '@/types'

/** 画布按 1500px 设计：px 字号 ÷ 15 = cqw，使本模块与 SVG 标注同比例缩放 */
const cqw = (px: number): string => `${(px / 15).toFixed(3)}cqw`

export function StatsBlock({
  groups,
  overseas,
  unlocated,
}: {
  /** 省份卡片键（含拆分键）→ 学生列表 */
  groups: Map<string, StudentEntry[]>
  overseas: StudentEntry[]
  unlocated: StudentEntry[]
}) {
  const { theme, fontSlots, customFonts, data } = useMapData()
  const provinceFont = slotFontFamily('province', fontSlots, customFonts)
  const personFont = slotFontFamily('person', fontSlots, customFonts)

  /** 省份 → 人数（拆分卡合并回基础省；人数降序，同数按拼音/笔画序稳定） */
  const rows = useMemo(() => {
    const m = new Map<string, number>()
    for (const [key, students] of groups) {
      const base = baseProvince(key)
      m.set(base, (m.get(base) ?? 0) + students.length)
    }
    const arr = [...m.entries()].map(([name, count]) => ({ name, count }))
    arr.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    return arr
  }, [groups])

  const total = data.students.length
  if (rows.length === 0 && overseas.length === 0 && unlocated.length === 0) return null

  const entries: Array<{ name: string; count: number }> = [...rows]
  if (overseas.length > 0) entries.push({ name: '海外 / 境外', count: overseas.length })
  if (unlocated.length > 0) entries.push({ name: '未定位', count: unlocated.length })

  return (
    <div
      data-testid="stats-block"
      style={{
        width: '92%',
        margin: '0 auto',
        padding: `${cqw(10)} 0 ${cqw(14)}`,
        textAlign: 'center',
        color: theme.textColor,
      }}
    >
      <div
        style={{
          fontFamily: provinceFont,
          fontWeight: 700,
          fontSize: cqw(data.labelSizes.province - 2),
          letterSpacing: '0.06em',
          marginBottom: cqw(6),
        }}
      >
        各地分布统计（共 {total} 人）
      </div>
      <div
        style={{
          fontFamily: personFont,
          fontSize: cqw(data.labelSizes.person),
          lineHeight: 1.9,
        }}
      >
        {entries.map((e, i) => (
          <span key={e.name}>
            {i > 0 && (
              <span style={{ color: theme.leaderLine, margin: `0 ${cqw(7)}` }}>·</span>
            )}
            <span>{e.name} </span>
            <span style={{ fontWeight: 700, color: theme.accent }} className="tabular-nums">
              {e.count}
            </span>
            <span style={{ fontSize: '0.82em', opacity: 0.65 }}> 人</span>
          </span>
        ))}
      </div>
    </div>
  )
}
