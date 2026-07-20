import type { StudentEntry } from '@/types'

/**
 * 温和提示块：列出 resolveProvince 返回 null 的学生姓名，
 * 提示回录入页补充城市/大学；无未定位学生时不渲染。
 */
export function UnlocatedBlock({ students }: { students: StudentEntry[] }) {
  if (students.length === 0) return null
  return (
    <div className="absolute right-4 bottom-4 z-10 max-w-[42%] rounded-lg border border-amber-200/80 bg-amber-50/85 px-3.5 py-2.5 backdrop-blur-[2px]">
      <p className="text-xs font-semibold text-amber-800">
        以下 {students.length} 位同学暂未在地图上定位：
      </p>
      <p className="mt-0.5 text-xs leading-5 text-amber-900/80">
        {students.map((s) => s.name || '（未命名）').join('、')}
      </p>
      <p className="mt-1 text-[11px] text-stone-500">请回录入页补充Ta们的城市或大学信息</p>
    </div>
  )
}
