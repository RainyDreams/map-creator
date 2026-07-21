/** 学生条目：谁去了哪所大学 */
export interface StudentEntry {
  id: string
  name: string
  university: string
  /** 城市名，如“北京”“武汉”。可由大学名自动推断，也可手动修改 */
  city: string
}

/** 老师条目（可选填） */
export interface TeacherEntry {
  id: string
  name: string
  /** 任教学科，如“物理” */
  subject: string
}

/** 「蹭饭图」大字的呈现方式预设 */
export type BigTextStyle =
  /** 画布右侧竖排大字（经典样式） */
  | 'vertical'
  /** 跟随标题，接在标题文字之后 */
  | 'inline'
  /** 半透明超大字衬在地图背景层 */
  | 'background'
  /** 不显示 */
  | 'hidden'

/** 蹭饭图全部数据 */
export interface MapData {
  /** 大标题，如“2026届 高三（2）班”——年份直接写进标题，其中的数字可用专用字体渲染 */
  title: string
  /** 标题字号（px，画布基准 20–56） */
  titleSize: number
  students: StudentEntry[]
  teachers: TeacherEntry[]
  /** 老师名单是否在地图上显示（关闭开关时图上隐藏，数据保留） */
  showTeachers: boolean
  /** 画布标题排布：居左 / 居中 / 居右 */
  titleAlign: 'left' | 'center' | 'right'
  /** 英文副标题（可选，显示在标题下方） */
  subtitle: string
  /** 「蹭饭图」大字呈现方式 */
  bigTextStyle: BigTextStyle
}

export const EMPTY_MAP_DATA: MapData = {
  title: '',
  titleSize: 30,
  students: [],
  teachers: [],
  showTeachers: true,
  titleAlign: 'left',
  subtitle: '',
  bigTextStyle: 'vertical',
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
