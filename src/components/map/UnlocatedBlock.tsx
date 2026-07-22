import { useMapData } from '@/store/MapDataContext'
import type { StudentEntry } from '@/types'

/**
 * 温和提示块：列出 resolveProvince 返回 null 的学生姓名，
 * 提示回录入页补充城市/大学；无未定位学生时不渲染。
 * 定位由外层容器负责（与 OverseasBlock 在右下角纵向堆叠）。
 * 卡片用半透明白 + 主题色文字，保证任何主题下可读。
 */
export function UnlocatedBlock({ students }: { students: StudentEntry[] }) {
  const { theme } = useMapData()
  if (students.length === 0) return null
  return (
    <div
      className="max-w-full rounded-lg border bg-white/75 px-3.5 py-2.5 backdrop-blur-[2px]"
      style={{ borderColor: theme.leaderLine }}
    >
      <p className="text-xs font-semibold" style={{ color: theme.accent }}>
        以下 {students.length} 位同学暂未在地图上定位：
      </p>
      <p className="mt-0.5 text-xs leading-5" style={{ color: theme.textColor }}>
        {students.map((s) => s.name || '（未命名）').join('、')}
      </p>
      <p className="mt-1 text-[11px] opacity-70" style={{ color: theme.textColor }}>
        请回录入页补充Ta们的城市或大学信息
      </p>
    </div>
  )
}
