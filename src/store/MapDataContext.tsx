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

const STORAGE_KEY = 'cenfan-map-data-v1'

export interface MapDataContextValue {
  data: MapData
  /** 传入新数据或更新函数；写入后自动持久化到 localStorage */
  setData: (updater: MapData | ((prev: MapData) => MapData)) => void
  /** 清空并恢复默认示例数据 */
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
}

const MapDataContext = createContext<MapDataContextValue | null>(null)

/** 内置示例数据，便于用户开箱看到效果、照着改 */
export const SAMPLE_DATA: MapData = {
  title: '2026届 高三（2）班',
  year: '2026',
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

function loadInitial(): MapData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MapData
      if (parsed && Array.isArray(parsed.students) && Array.isArray(parsed.teachers)) {
        return parsed
      }
    }
  } catch {
    // 数据损坏则回退到示例
  }
  return SAMPLE_DATA
}

export function MapDataProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<MapData>(loadInitial)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // 存储失败（如隐私模式）静默忽略
    }
  }, [data])

  const setData = useCallback(
    (updater: MapData | ((prev: MapData) => MapData)) => {
      setDataState((prev) => (typeof updater === 'function' ? updater(prev) : updater))
    },
    [],
  )

  const resetData = useCallback(() => setDataState(SAMPLE_DATA), [])

  const importStudents = useCallback(
    (students: Array<Omit<StudentEntry, 'id'>>, mode: 'replace' | 'append') => {
      const withIds = students.map((s) => ({ ...s, id: newId() }))
      setDataState((prev) => ({
        ...prev,
        students: mode === 'replace' ? withIds : [...prev.students, ...withIds],
      }))
      return withIds.length
    },
    [],
  )

  const value = useMemo(
    () => ({ data, setData, resetData, importStudents }),
    [data, setData, resetData, importStudents],
  )

  return <MapDataContext.Provider value={value}>{children}</MapDataContext.Provider>
}

export function useMapData(): MapDataContextValue {
  const ctx = useContext(MapDataContext)
  if (!ctx) throw new Error('useMapData 必须在 <MapDataProvider> 内使用')
  return ctx
}

export { EMPTY_MAP_DATA }
