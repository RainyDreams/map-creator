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

/** 蹭饭图全部数据 */
export interface MapData {
  /** 班级/标题，如“2026届 高三（2）班” */
  title: string
  /** 届数/年份，如“2026” */
  year: string
  students: StudentEntry[]
  teachers: TeacherEntry[]
  /** 老师名单是否在地图上显示（关闭开关时图上隐藏，数据保留） */
  showTeachers: boolean
  /** 画布标题排布：居左（侧面）或居中 */
  titleAlign: 'left' | 'center'
}

export const EMPTY_MAP_DATA: MapData = {
  title: '',
  year: '',
  students: [],
  teachers: [],
  showTeachers: true,
  titleAlign: 'left',
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
