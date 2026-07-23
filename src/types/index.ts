/** 学生条目：谁去了哪所大学 */
export interface StudentEntry {
  id: string
  name: string
  university: string
  /** 城市名，如“北京”“武汉”。可由大学名自动推断，也可手动修改 */
  city: string
  /**
   * 境外（海外）学生：true 时不在中国地图上定位/引线，
   * city 字段存放国家或地区名（如“美国”“新加坡”），
   * 在地图右下角「海外 / 境外」区块中单独列出
   */
  overseas?: boolean
}

/** 老师条目（可选填） */
export interface TeacherEntry {
  id: string
  name: string
  /** 任教学科，如“物理” */
  subject: string
}

/**
 * 地图标注四个模块的字号（px，以 1500px 宽虚拟画布为基准）。
 * province 省份名 / person 姓名 / place 城市·大学 / teacher 老师名单。
 */
export interface LabelSizes {
  province: number
  person: number
  place: number
  teacher: number
}

export const DEFAULT_LABEL_SIZES: LabelSizes = { province: 16, person: 13, place: 13, teacher: 13 }

/** 大学毛笔字图片（用户自备的透明底横版 PNG，同校学生共用） */
export interface CalligraphyAsset {
  /** 图片 dataURL（上传时已压缩到合理尺寸，保留透明底） */
  dataUrl: string
  /** 图片宽高（布局按宽高比计算显示宽度） */
  w: number
  h: number
  /** 显示大小倍率（0.3–3，默认 1；通过自绘滑块调节） */
  scale: number
}

/** 单个学生的校徽覆盖设置：可隐藏自动校徽，或上传自定义校徽图片（替代自动匹配） */
export interface StudentBadge {
  /** true 时该学生的校徽不显示（即使全局校徽开关开启） */
  hidden?: boolean
  /** 自定义校徽图片 dataURL（方形 PNG，上传时已压缩）；设置后替代自动匹配的校徽 */
  dataUrl?: string
}

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
  /** 校徽图片是否在地图上显示（关闭时图上不渲染校徽，大学文字照常） */
  showBadges: boolean
  /** 画布标题排布：居左 / 居中 / 居右 */
  titleAlign: 'left' | 'center' | 'right'
  /** 英文副标题（可选，显示在标题下方） */
  subtitle: string
  /** 地图标注三个模块的字号（px，画布基准） */
  labelSizes: LabelSizes
  /** 每侧标注列数：1（默认）或 2（人多时更宽松，文字列宽减半）。自定义位置模式下作为基础布局 */
  labelColumns: 1 | 2
  /**
   * 省份卡片位置模式（v1.15）：false = 一列/两列自动布局（忽略拖动偏移，偏移数据保留）；
   * true = 自定义位置（应用 provinceOffsets，卡片可拖动；拖动卡片会自动切到此模式）
   */
  customPosition: boolean
  /** 同校合并：同一大学的多名同学姓名一人一行竖排，右侧只显示一次 校徽 + 学校 · 城市 */
  mergeSameSchool: boolean
  /** 省份名单卡片背景：开启后每个省份块衬一个圆角底色卡片（引线被卡片遮住，不再穿过名单） */
  labelCardBg: boolean
  /** 省份卡片圆角（画布单位，0–24） */
  cardRadius: number
  /** 省份卡片填充色（'' = 跟随主题页脚底色；也可自定义为任意 hex 颜色） */
  cardColor: string
  /** 省份卡片不透明度（0.3–1，默认 0.92） */
  cardOpacity: number
  /** 省份卡片边缘羽化/模糊半径（画布单位，0–10，0 = 清晰边缘） */
  cardBlur: number
  /**
   * 省份卡片手动拖动偏移（画布 viewBox 单位）：省份名 → {dx, dy}。
   * 拖动只平移渲染位置，块在列中的占位不变；引线与文字随卡片一起移动
   */
  provinceOffsets: Record<string, { dx: number; dy: number }>
  /**
   * 老师名单块手动拖动偏移（画布设计 px，画布按 1500px 宽设计）：
   * v1.16 起老师块可自由拖动；v1.21.1 起纵向动态限幅（上不超画布顶、下 +1200），
   * 存储层限幅 ±4000 仅防损坏数据
   */
  teachersOffset: { dx: number; dy: number }
  /**
   * 省内手动排序的省份列表：在录入弹窗中拖动调整过顺序的省份，
   * 该省在地图上保持手动顺序（不再按软科排名自动排序）
   */
  customOrderProvinces: string[]
  /**
   * 大学名（trim 后）→ 用户上传的毛笔字图片。
   * 上传后地图上该校不再显示大学文字，校徽后直接渲染这张图片
   */
  calligraphy: Record<string, CalligraphyAsset>
  /** 学生 id → 校徽覆盖设置（隐藏或自定义图片，优先于全局校徽开关与自动匹配） */
  badgeOverrides: Record<string, StudentBadge>
}

export const EMPTY_MAP_DATA: MapData = {
  title: '',
  titleSize: 30,
  students: [],
  teachers: [],
  showTeachers: true,
  showBadges: true,
  titleAlign: 'left',
  subtitle: '',
  labelSizes: DEFAULT_LABEL_SIZES,
  labelColumns: 1,
  customPosition: false,
  mergeSameSchool: false,
  labelCardBg: true,
  cardRadius: 10,
  cardColor: '',
  cardOpacity: 0.92,
  cardBlur: 0,
  provinceOffsets: {},
  teachersOffset: { dx: 0, dy: 0 },
  customOrderProvinces: [],
  calligraphy: {},
  badgeOverrides: {},
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
