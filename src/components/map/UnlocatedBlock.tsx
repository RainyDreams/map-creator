import { useMapData } from '@/store/MapDataContext'
import type { StudentEntry } from '@/types'

/** 画布按 1500px 设计：px 字号 ÷ 15 = cqw，使 HTML 覆盖层与 SVG 标注同比例缩放 */
const cqw = (px: number): string => `${(px / 15).toFixed(3)}cqw`

/**
 * 温和提示块：列出 resolveProvince 返回 null 的学生姓名，
 * 提示回录入页补充城市/大学；无未定位学生时不渲染。
 * 定位由外层容器负责（与 OverseasBlock 在右下角纵向堆叠）。
 * 字号用 cqw 随画布宽度缩放；卡片用半透明白 + 主题色文字，保证任何主题下可读。
 */
export function UnlocatedBlock({ students }: { students: StudentEntry[] }) {
  const { theme } = useMapData()
  if (students.length === 0) return null
  return (
    <div
      className="max-w-full rounded-lg border bg-white/75 backdrop-blur-[2px]"
      style={{ borderColor: theme.leaderLine, padding: `${cqw(10)} ${cqw(14)}` }}
    >
      <p className="font-semibold" style={{ color: theme.accent, fontSize: cqw(12) }}>
        以下 {students.length} 位同学暂未在地图上定位：
      </p>
      <p className="mt-0.5" style={{ color: theme.textColor, fontSize: cqw(12), lineHeight: 1.7 }}>
        {students.map((s) => s.name || '（未命名）').join('、')}
      </p>
      <p className="mt-1 opacity-70" style={{ color: theme.textColor, fontSize: cqw(11) }}>
        请回录入页补充Ta们的城市或大学信息
      </p>
    </div>
  )
}
