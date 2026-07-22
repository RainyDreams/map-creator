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

/**
 * 地图标注三个模块的字号（px，以 1400px 宽虚拟画布为基准）。
 * province 省份名 / person 姓名 / place 城市·大学。
 */
export interface LabelSizes {
  province: number
  person: number
  place: number
}

export const DEFAULT_LABEL_SIZES: LabelSizes = { province: 16, person: 13, place: 13 }

/** 蹭饭图全部数据 */
export interface MapData {
  /** 大标题，如“2026届 高三（2）班的蹭饭图”——年份直接写进标题，其中的数字可用专用字体渲染 */
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
  /** 地图标注三个模块的字号（px，画布基准） */
  labelSizes: LabelSizes
  /**
   * 省内手动排序的省份列表：在录入弹窗中拖动调整过顺序的省份，
   * 该省在地图上保持手动顺序（不再按软科排名自动排序）
   */
  customOrderProvinces: string[]
}

export const EMPTY_MAP_DATA: MapData = {
  title: '',
  titleSize: 30,
  students: [],
  teachers: [],
  showTeachers: true,
  titleAlign: 'left',
  subtitle: '',
  labelSizes: DEFAULT_LABEL_SIZES,
  customOrderProvinces: [],
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
