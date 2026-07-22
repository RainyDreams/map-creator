import { useMapData } from '@/store/MapDataContext'
import { slotFontFamily } from '@/utils/fonts'
import type { TeacherEntry } from '@/types'

/** 画布按 1500px 设计：px 字号 ÷ 15 = cqw，使 HTML 覆盖层与 SVG 标注同比例缩放 */
const cqw = (px: number): string => `${(px / 15).toFixed(3)}cqw`

/**
 * 左下角"相伴三年的老师们"名单；
 * 无老师数据或在录入页关闭"显示老师"时整块不渲染。
 * 字号跟随「字体设置 → 老师名单」（默认与学生姓名一致），标题比名单大 3px。
 * 字号/内边距用 cqw 随画布宽度缩放，避免窄画布（尤其移动端）上相对学生标注过大。
 */
export function TeachersBlock({ teachers }: { teachers: TeacherEntry[] }) {
  const { data, theme, fontSlots, customFonts } = useMapData()
  if (!data.showTeachers || teachers.length === 0) return null
  const titleFont = slotFontFamily('han', fontSlots, customFonts)
  const personFont = slotFontFamily('person', fontSlots, customFonts)
  const placeFont = slotFontFamily('place', fontSlots, customFonts)
  const size = data.labelSizes.teacher
  return (
    <div
      className="absolute bottom-12 left-6 z-10 max-w-[45%] rounded-lg bg-white/60 backdrop-blur-[2px]"
      style={{ padding: `${cqw(12)} ${cqw(16)}` }}
    >
      <p
        className="mb-1 tracking-wide"
        style={{
          fontFamily: titleFont,
          color: theme.titleColor,
          fontSize: cqw(size + 3),
          lineHeight: 1.4,
        }}
      >
        相伴三年的老师们：
      </p>
      <ul>
        {teachers.map((t) => (
          <li
            key={t.id}
            style={{ color: theme.textColor, fontSize: cqw(size), lineHeight: 1.6 }}
          >
            <span className="font-semibold" style={{ fontFamily: personFont }}>
              {t.name}
            </span>
            {t.subject.trim() !== '' && (
              <span
                className="ml-1 opacity-70"
                style={{ fontFamily: placeFont, fontSize: cqw(Math.max(9, size - 1)) }}
              >
                （{t.subject}）
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
