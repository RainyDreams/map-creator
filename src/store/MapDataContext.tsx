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
    titleAlign: d.titleAlign === 'center' ? 'center' : 'left',
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
    () => ({ data, setData, resetData, importStudents, theme, setTheme }),
    [data, setData, resetData, importStudents, theme, setTheme],
  )

  return <MapDataContext.Provider value={value}>{children}</MapDataContext.Provider>
}

export function useMapData(): MapDataContextValue {
  const ctx = useContext(MapDataContext)
  if (!ctx) throw new Error('useMapData 必须在 <MapDataProvider> 内使用')
  return ctx
}

export { EMPTY_MAP_DATA }
