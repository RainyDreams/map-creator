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
import {
  DEFAULT_FONT_SLOTS,
  ensureCustomFontsLoaded,
  type CustomFont,
  type FontSlot,
} from '@/utils/fonts'

const STORAGE_KEY = 'cenfan-map-store-v2'
const LEGACY_KEY = 'cenfan-map-data-v1'

interface Persisted {
  data: MapData
  theme: ThemeConfig
  /** 画布分模块字体槽位 */
  fontSlots: Record<FontSlot, string>
  /** 用户上传的自定义字体（dataURL 持久化） */
  customFonts: CustomFont[]
  /** 校徽/班徽图片（dataURL，已压缩） */
  badge: string | null
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
  /** 分模块字体槽位与操作 */
  fontSlots: Record<FontSlot, string>
  setFontSlot: (slot: FontSlot, fontId: string) => void
  customFonts: CustomFont[]
  addCustomFont: (font: CustomFont) => void
  removeCustomFont: (fontId: string) => void
  /** 校徽/班徽 */
  badge: string | null
  setBadge: (dataUrl: string | null) => void
}

const MapDataContext = createContext<MapDataContextValue | null>(null)

function normalizeData(raw: unknown): MapData | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<MapData> & { year?: string }
  if (!Array.isArray(d.students) || !Array.isArray(d.teachers)) return null
  let title = typeof d.title === 'string' ? d.title : ''
  // v1.2 → v1.3 迁移：独立的「届数/年份」字段已移除；
  // 旧数据中 year 非空且标题不含该年份时，把年份并回大标题
  const legacyYear = typeof d.year === 'string' ? d.year.trim() : ''
  if (legacyYear !== '' && !title.includes(legacyYear)) {
    title = `${legacyYear} ${title}`.trim()
  }
  const bigTextStyle = d.bigTextStyle
  return {
    title,
    titleSize:
      typeof d.titleSize === 'number' && d.titleSize >= 16 && d.titleSize <= 64
        ? d.titleSize
        : 30,
    students: d.students,
    teachers: d.teachers,
    showTeachers: d.showTeachers !== false,
    titleAlign:
      d.titleAlign === 'center' ? 'center' : d.titleAlign === 'right' ? 'right' : 'left',
    subtitle: typeof d.subtitle === 'string' ? d.subtitle : '',
    bigTextStyle:
      bigTextStyle === 'inline' || bigTextStyle === 'background' || bigTextStyle === 'hidden'
        ? bigTextStyle
        : 'vertical',
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

function normalizeFontSlots(raw: unknown): Record<FontSlot, string> {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FONT_SLOTS }
  return { ...DEFAULT_FONT_SLOTS, ...(raw as Record<FontSlot, string>) }
}

function normalizeCustomFonts(raw: unknown): CustomFont[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (f): f is CustomFont =>
      !!f && typeof f === 'object' &&
      typeof (f as CustomFont).id === 'string' &&
      typeof (f as CustomFont).name === 'string' &&
      typeof (f as CustomFont).dataUrl === 'string',
  )
}

function loadInitial(): Persisted {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY)
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<Persisted>
      const data = normalizeData(parsed.data)
      if (data) {
        return {
          data,
          theme: normalizeTheme(parsed.theme),
          fontSlots: normalizeFontSlots(parsed.fontSlots),
          customFonts: normalizeCustomFonts(parsed.customFonts),
          badge: typeof parsed.badge === 'string' ? parsed.badge : null,
        }
      }
    }
    // 迁移 v1：仅存了 MapData
    const rawV1 = localStorage.getItem(LEGACY_KEY)
    if (rawV1) {
      const data = normalizeData(JSON.parse(rawV1))
      if (data) {
        return {
          data,
          theme: DEFAULT_THEME,
          fontSlots: { ...DEFAULT_FONT_SLOTS },
          customFonts: [],
          badge: null,
        }
      }
    }
  } catch {
    // 数据损坏则回退空白
  }
  return {
    data: EMPTY_MAP_DATA,
    theme: DEFAULT_THEME,
    fontSlots: { ...DEFAULT_FONT_SLOTS },
    customFonts: [],
    badge: null,
  }
}

export function MapDataProvider({ children }: { children: ReactNode }) {
  const [persisted, setPersisted] = useState<Persisted>(loadInitial)
  const { data, theme, fontSlots, customFonts, badge } = persisted

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
    } catch {
      // 存储失败（如隐私模式）静默忽略
    }
  }, [persisted])

  // 启动与变更时注册自定义字体（FontFace API，幂等）
  useEffect(() => {
    void ensureCustomFontsLoaded(customFonts)
  }, [customFonts])

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

  const setFontSlot = useCallback(
    (slot: FontSlot, fontId: string) =>
      setPersisted((prev) => ({
        ...prev,
        fontSlots: { ...prev.fontSlots, [slot]: fontId },
      })),
    [],
  )

  const addCustomFont = useCallback(
    (font: CustomFont) =>
      setPersisted((prev) => ({
        ...prev,
        customFonts: [...prev.customFonts.filter((f) => f.id !== font.id), font],
      })),
    [],
  )

  const removeCustomFont = useCallback(
    (fontId: string) =>
      setPersisted((prev) => ({
        ...prev,
        customFonts: prev.customFonts.filter((f) => f.id !== fontId),
        // 引用该字体的槽位回退默认，避免悬空引用
        fontSlots: Object.fromEntries(
          Object.entries(prev.fontSlots).map(([slot, id]) => [
            slot,
            id === fontId ? DEFAULT_FONT_SLOTS[slot as FontSlot] : id,
          ]),
        ) as Record<FontSlot, string>,
      })),
    [],
  )

  const setBadge = useCallback(
    (dataUrl: string | null) => setPersisted((prev) => ({ ...prev, badge: dataUrl })),
    [],
  )

  const value = useMemo(
    () => ({
      data,
      setData,
      resetData,
      importStudents,
      theme,
      setTheme,
      fontSlots,
      setFontSlot,
      customFonts,
      addCustomFont,
      removeCustomFont,
      badge,
      setBadge,
    }),
    [
      data,
      setData,
      resetData,
      importStudents,
      theme,
      setTheme,
      fontSlots,
      setFontSlot,
      customFonts,
      addCustomFont,
      removeCustomFont,
      badge,
      setBadge,
    ],
  )

  return <MapDataContext.Provider value={value}>{children}</MapDataContext.Provider>
}

export function useMapData(): MapDataContextValue {
  const ctx = useContext(MapDataContext)
  if (!ctx) throw new Error('useMapData 必须在 <MapDataProvider> 内使用')
  return ctx
}

export { EMPTY_MAP_DATA }
