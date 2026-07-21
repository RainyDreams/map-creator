import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { EMPTY_MAP_DATA, newId, type MapData, type StudentEntry } from '@/types'
import { DEFAULT_THEME, presetById, type ThemeConfig } from '@/utils/themes'

const STORAGE_KEY = 'cenfan-map-store-v2'
const LEGACY_KEY = 'cenfan-map-data-v1'

interface Persisted {
  data: MapData
  theme: ThemeConfig
}

export interface MapDataContextValue {
  data: MapData
  /** 传入新数据或更新函数；写入后自动持久化到 localStorage */
  setData: (updater: MapData | ((prev: MapData) => MapData)) => void
  /** 清空全部内容（名单、标题、老师），回到空白状态 */
  resetData: () => void
  /** 填充一份示例数据，便于预览效果 */
  fillSample: () => void
  /**
   * 批量导入学生（Excel 上传用）。
   * mode = 'replace' 覆盖现有名单；'append' 追加。
   * 返回导入条数。
   */
  importStudents: (
    students: Array<Omit<StudentEntry, 'id'>>,
    mode: 'replace' | 'append',
  ) => number
  /** 画布主题（预设或自定义），持久化 */
  theme: ThemeConfig
  setTheme: (theme: ThemeConfig) => void
}

const MapDataContext = createContext<MapDataContextValue | null>(null)

/** 内置示例数据，仅通过“填充示例”主动载入 */
export const SAMPLE_DATA: MapData = {
  title: '2026届 高三（2）班',
  year: '2026',
  showTeachers: true,
  students: [
    { id: newId(), name: '张示例', university: '清华大学', city: '北京' },
    { id: newId(), name: '李示例', university: '北京大学', city: '北京' },
    { id: newId(), name: '王示例', university: '复旦大学', city: '上海' },
    { id: newId(), name: '赵示例', university: '浙江大学', city: '杭州' },
    { id: newId(), name: '刘示例', university: '武汉大学', city: '武汉' },
    { id: newId(), name: '陈示例', university: '中山大学', city: '广州' },
    { id: newId(), name: '杨示例', university: '电子科技大学', city: '成都' },
    { id: newId(), name: '周示例', university: '西安交通大学', city: '西安' },
    { id: newId(), name: '吴示例', university: '哈尔滨工业大学', city: '哈尔滨' },
  ],
  teachers: [
    { id: newId(), name: '王示例', subject: '物理' },
    { id: newId(), name: '郭示例', subject: '语文' },
  ],
}

function normalizeData(raw: unknown): MapData | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<MapData>
  if (!Array.isArray(d.students) || !Array.isArray(d.teachers)) return null
  return {
    title: typeof d.title === 'string' ? d.title : '',
    year: typeof d.year === 'string' ? d.year : '',
    students: d.students,
    teachers: d.teachers,
    showTeachers: d.showTeachers !== false,
  }
}

function normalizeTheme(raw: unknown): ThemeConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_THEME
  const t = raw as ThemeConfig
  // 自定义主题直接使用；预设 id 回查预设（防止调色后旧数据漂移）
  if (t.id === 'custom' && typeof t.canvasBg === 'string') return t
  if (typeof t.id === 'string') return presetById(t.id)
  return DEFAULT_THEME
}

function loadInitial(): Persisted {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY)
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<Persisted>
      const data = normalizeData(parsed.data)
      if (data) return { data, theme: normalizeTheme(parsed.theme) }
    }
    // 迁移 v1：仅存了 MapData
    const rawV1 = localStorage.getItem(LEGACY_KEY)
    if (rawV1) {
      const data = normalizeData(JSON.parse(rawV1))
      if (data) return { data, theme: DEFAULT_THEME }
    }
  } catch {
    // 数据损坏则回退空白
  }
  return { data: EMPTY_MAP_DATA, theme: DEFAULT_THEME }
}

export function MapDataProvider({ children }: { children: ReactNode }) {
  const [persisted, setPersisted] = useState<Persisted>(loadInitial)
  const { data, theme } = persisted

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
    } catch {
      // 存储失败（如隐私模式）静默忽略
    }
  }, [persisted])

  const setData = useCallback(
    (updater: MapData | ((prev: MapData) => MapData)) => {
      setPersisted((prev) => ({
        ...prev,
        data: typeof updater === 'function' ? updater(prev.data) : updater,
      }))
    },
    [],
  )

  const resetData = useCallback(
    () => setPersisted((prev) => ({ ...prev, data: EMPTY_MAP_DATA })),
    [],
  )

  const fillSample = useCallback(
    () => setPersisted((prev) => ({ ...prev, data: SAMPLE_DATA })),
    [],
  )

  const importStudents = useCallback(
    (students: Array<Omit<StudentEntry, 'id'>>, mode: 'replace' | 'append') => {
      const withIds = students.map((s) => ({ ...s, id: newId() }))
      setPersisted((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          students: mode === 'replace' ? withIds : [...prev.data.students, ...withIds],
        },
      }))
      return withIds.length
    },
    [],
  )

  const setTheme = useCallback(
    (theme: ThemeConfig) => setPersisted((prev) => ({ ...prev, theme })),
    [],
  )

  const value = useMemo(
    () => ({ data, setData, resetData, fillSample, importStudents, theme, setTheme }),
    [data, setData, resetData, fillSample, importStudents, theme, setTheme],
  )

  return <MapDataContext.Provider value={value}>{children}</MapDataContext.Provider>
}

export function useMapData(): MapDataContextValue {
  const ctx = useContext(MapDataContext)
  if (!ctx) throw new Error('useMapData 必须在 <MapDataProvider> 内使用')
  return ctx
}

export { EMPTY_MAP_DATA }
