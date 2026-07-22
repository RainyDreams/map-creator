import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import type { StudentEntry } from '@/types'

/**
 * 右下角「海外 / 境外的同学们」区块：
 * 列出境外学生（姓名 大学 · 国家/地区），不指向中国地图、无引线。
 * 字号与老师名单一致（labelSizes.teacher），字体跟随标题/姓名/地点槽位。
 * 卡片为半透明白 + 主题色文字，任何主题下可读。
 */
export function OverseasBlock({ students }: { students: StudentEntry[] }) {
  const { data, theme, fontSlots, customFonts } = useMapData()
  if (students.length === 0) return null
  const titleFont = slotFontFamily('han', fontSlots, customFonts)
  const personFont = slotFontFamily('person', fontSlots, customFonts)
  const placeFont = slotFontFamily('place', fontSlots, customFonts)
  const size = data.labelSizes.teacher
  return (
    <div className="w-fit max-w-full rounded-lg bg-white/60 px-4 py-3 backdrop-blur-[2px]">
      <p
        className="mb-1 tracking-wide whitespace-nowrap"
        style={{
          fontFamily: titleFont,
          color: theme.titleColor,
          fontSize: `${size + 3}px`,
          lineHeight: 1.4,
        }}
      >
        海外 / 境外的同学们：
      </p>
      <ul>
        {students.map((s) => (
          <li
            key={s.id}
            className="whitespace-nowrap"
            style={{ color: theme.textColor, fontSize: `${size}px`, lineHeight: 1.6 }}
          >
            <span className="font-semibold" style={{ fontFamily: personFont }}>
              {s.name || '（未命名）'}
            </span>
            {(s.university.trim() !== '' || s.city.trim() !== '') && (
              <span className="ml-1.5 opacity-80" style={{ fontFamily: placeFont }}>
                {[s.university.trim(), s.city.trim()].filter(Boolean).join(' · ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
