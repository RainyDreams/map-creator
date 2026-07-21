import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import type { TeacherEntry } from '@/types'

/**
 * 左下角"相伴三年的老师们"名单；
 * 无老师数据或在录入页关闭"显示老师"时整块不渲染。
 */
export function TeachersBlock({ teachers }: { teachers: TeacherEntry[] }) {
  const { data, theme, fontSlots, customFonts } = useMapData()
  if (!data.showTeachers || teachers.length === 0) return null
  const titleFont = slotFontFamily('title', fontSlots, customFonts)
  const personFont = slotFontFamily('person', fontSlots, customFonts)
  const placeFont = slotFontFamily('place', fontSlots, customFonts)
  return (
    <div className="absolute bottom-12 left-6 z-10 max-w-[45%] rounded-lg bg-white/60 px-4 py-3 backdrop-blur-[2px]">
      <p
        className="mb-1 text-xl tracking-wide"
        style={{ fontFamily: titleFont, color: theme.titleColor }}
      >
        相伴三年的老师们：
      </p>
      <ul>
        {teachers.map((t) => (
          <li key={t.id} className="text-sm leading-6" style={{ color: theme.textColor }}>
            <span className="font-semibold" style={{ fontFamily: personFont }}>
              {t.name}
            </span>
            {t.subject.trim() !== '' && (
              <span className="ml-1 text-xs opacity-70" style={{ fontFamily: placeFont }}>
                （{t.subject}）
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
