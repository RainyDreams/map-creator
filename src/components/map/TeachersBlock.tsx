import type { TeacherEntry } from '@/types'

/** 左下角"相伴三年的老师们"名单；无老师数据时整块不渲染 */
export function TeachersBlock({ teachers }: { teachers: TeacherEntry[] }) {
  if (teachers.length === 0) return null
  return (
    <div className="absolute bottom-12 left-6 z-10 max-w-[45%] rounded-lg bg-white/55 px-4 py-3 backdrop-blur-[2px]">
      <p className="font-calligraphy mb-1 text-xl tracking-wide text-stone-800">
        相伴三年的老师们：
      </p>
      <ul>
        {teachers.map((t) => (
          <li key={t.id} className="text-sm leading-6 text-stone-700">
            <span className="font-semibold">{t.name}</span>
            {t.subject.trim() !== '' && (
              <span className="ml-1 text-xs text-stone-500">（{t.subject}）</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
