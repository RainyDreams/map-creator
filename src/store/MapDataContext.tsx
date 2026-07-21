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

/** 一张独立画布：完整的一份蹭饭图工程（名单 + 主题 + 字体 + 班徽） */
export interface CanvasDoc {
  id: string
  /** 画布名（管理台展示用，可与标题不同） */
  name: string
  data: MapData
  theme: ThemeConfig
  fontSlots: Record<FontSlot, string>
  badge: string | null
  updatedAt: number
}

interface Persisted {
  /** 全部画布（至少一张） */
  canvases: CanvasDoc[]
  /** 当前编辑中的画布 id */
  activeId: string
  /** 用户上传的自定义字体（全局共享，dataURL 持久化） */
  customFonts: CustomFont[]
}

/** 旧版（v1.2 及以前）单画布持久化结构，用于迁移 */
interface LegacyPersisted {
  data?: unknown
  theme?: unknown
  fontSlots?: unknown
  customFonts?: unknown
  badge?: unknown
}

export interface CanvasSummary {
  id: string
  name: string
  studentCount: number
  updatedAt: number
  active: boolean
}

export interface MapDataContextValue {
  data: MapData
  /** 传入新数据或更新函数；写入后自动持久化到 localStorage */
  setData: (updater: MapData | ((prev: MapData) => MapData)) => void
  /** 清空当前画布全部内容（名单、标题、老师），回到空白状态 */
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
  /** —— 多画布管理 —— */
  canvases: CanvasSummary[]
  activeCanvasId: string
  activeCanvasName: string
  switchCanvas: (id: string) => void
  /** 新建空白画布并切换过去，返回新画布 id */
  createCanvas: (name?: string) => string
  renameCanvas: (id: string, name: string) => void
  /** 复制指定画布（含全部内容），返回新画布 id 并切换过去 */
  duplicateCanvas: (id: string) => string
  /** 删除指定画布；至少保留一张 */
  deleteCanvas: (id: string) => void
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

function newCanvasDoc(name: string): CanvasDoc {
  return {
    id: newId(),
    name,
    data: EMPTY_MAP_DATA,
    theme: DEFAULT_THEME,
    fontSlots: { ...DEFAULT_FONT_SLOTS },
    badge: null,
    updatedAt: Date.now(),
  }
}

function loadInitial(): Persisted {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY)
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<Persisted> & LegacyPersisted
      // v1.4 多画布结构
      if (Array.isArray(parsed.canvases) && parsed.canvases.length > 0) {
        const canvases = parsed.canvases
          .map((c): CanvasDoc | null => {
            const data = normalizeData(c?.data)
            if (!data || typeof c?.id !== 'string') return null
            return {
              id: c.id,
              name: typeof c.name === 'string' && c.name.trim() !== '' ? c.name : '未命名画布',
              data,
              theme: normalizeTheme(c.theme),
              fontSlots: normalizeFontSlots(c.fontSlots),
              badge: typeof c.badge === 'string' ? c.badge : null,
              updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : Date.now(),
            }
          })
          .filter((c): c is CanvasDoc => c !== null)
        if (canvases.length > 0) {
          const activeId =
            typeof parsed.activeId === 'string' &&
            canvases.some((c) => c.id === parsed.activeId)
              ? parsed.activeId
              : canvases[0].id
          return { canvases, activeId, customFonts: normalizeCustomFonts(parsed.customFonts) }
        }
      }
      // v1.2/v1.3 单画布结构 → 迁移为一张画布
      const data = normalizeData(parsed.data)
      if (data) {
        const doc: CanvasDoc = {
          id: newId(),
          name: data.title.trim() || '我的蹭饭图',
          data,
          theme: normalizeTheme(parsed.theme),
          fontSlots: normalizeFontSlots(parsed.fontSlots),
          badge: typeof parsed.badge === 'string' ? parsed.badge : null,
          updatedAt: Date.now(),
        }
        return { canvases: [doc], activeId: doc.id, customFonts: normalizeCustomFonts(parsed.customFonts) }
      }
    }
    // 迁移 v1：仅存了 MapData
    const rawV1 = localStorage.getItem(LEGACY_KEY)
    if (rawV1) {
      const data = normalizeData(JSON.parse(rawV1))
      if (data) {
        const doc: CanvasDoc = {
          id: newId(),
          name: data.title.trim() || '我的蹭饭图',
          data,
          theme: DEFAULT_THEME,
          fontSlots: { ...DEFAULT_FONT_SLOTS },
          badge: null,
          updatedAt: Date.now(),
        }
        return { canvases: [doc], activeId: doc.id, customFonts: [] }
      }
    }
  } catch {
    // 数据损坏则回退空白
  }
  const doc = newCanvasDoc('我的蹭饭图')
  return { canvases: [doc], activeId: doc.id, customFonts: [] }
}

export function MapDataProvider({ children }: { children: ReactNode }) {
  const [persisted, setPersisted] = useState<Persisted>(loadInitial)
  const { canvases, activeId, customFonts } = persisted
  const active = canvases.find((c) => c.id === activeId) ?? canvases[0]
  const { data, theme, fontSlots, badge } = active

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

  /** 更新当前画布的部分字段（并刷新 updatedAt） */
  const patchActive = useCallback(
    (patch: Partial<Omit<CanvasDoc, 'id' | 'updatedAt'>>) => {
      setPersisted((prev) => ({
        ...prev,
        canvases: prev.canvases.map((c) =>
          c.id === prev.activeId ? { ...c, ...patch, updatedAt: Date.now() } : c,
        ),
      }))
    },
    [],
  )

  const setData = useCallback(
    (updater: MapData | ((prev: MapData) => MapData)) => {
      setPersisted((prev) => ({
        ...prev,
        canvases: prev.canvases.map((c) =>
          c.id === prev.activeId
            ? {
                ...c,
                data: typeof updater === 'function' ? updater(c.data) : updater,
                updatedAt: Date.now(),
              }
            : c,
        ),
      }))
    },
    [],
  )

  const resetData = useCallback(() => patchActive({ data: EMPTY_MAP_DATA }), [patchActive])

  const importStudents = useCallback(
    (students: Array<Omit<StudentEntry, 'id'>>, mode: 'replace' | 'append') => {
      const withIds = students.map((s) => ({ ...s, id: newId() }))
      setPersisted((prev) => ({
        ...prev,
        canvases: prev.canvases.map((c) =>
          c.id === prev.activeId
            ? {
                ...c,
                data: {
                  ...c.data,
                  students:
                    mode === 'replace' ? withIds : [...c.data.students, ...withIds],
                },
                updatedAt: Date.now(),
              }
            : c,
        ),
      }))
      return withIds.length
    },
    [],
  )

  const setTheme = useCallback(
    (theme: ThemeConfig) => patchActive({ theme }),
    [patchActive],
  )

  const setFontSlot = useCallback(
    (slot: FontSlot, fontId: string) =>
      setPersisted((prev) => ({
        ...prev,
        canvases: prev.canvases.map((c) =>
          c.id === prev.activeId
            ? { ...c, fontSlots: { ...c.fontSlots, [slot]: fontId }, updatedAt: Date.now() }
            : c,
        ),
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
        // 所有画布中引用该字体的槽位回退默认，避免悬空引用
        canvases: prev.canvases.map((c) => ({
          ...c,
          fontSlots: Object.fromEntries(
            Object.entries(c.fontSlots).map(([slot, id]) => [
              slot,
              id === fontId ? DEFAULT_FONT_SLOTS[slot as FontSlot] : id,
            ]),
          ) as Record<FontSlot, string>,
        })),
      })),
    [],
  )

  const setBadge = useCallback(
    (dataUrl: string | null) => patchActive({ badge: dataUrl }),
    [patchActive],
  )

  /* ---------------- 多画布管理 ---------------- */

  const switchCanvas = useCallback(
    (id: string) =>
      setPersisted((prev) =>
        prev.canvases.some((c) => c.id === id) ? { ...prev, activeId: id } : prev,
      ),
    [],
  )

  const createCanvas = useCallback((name?: string) => {
    const doc = newCanvasDoc(name?.trim() || '')
    setPersisted((prev) => {
      const finalName = doc.name !== '' ? doc.name : `画布 ${prev.canvases.length + 1}`
      const named = { ...doc, name: finalName }
      return { ...prev, canvases: [...prev.canvases, named], activeId: named.id }
    })
    return doc.id
  }, [])

  const renameCanvas = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (trimmed === '') return
    setPersisted((prev) => ({
      ...prev,
      canvases: prev.canvases.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
    }))
  }, [])

  const duplicateCanvas = useCallback((id: string) => {
    const newDocId = newId()
    setPersisted((prev) => {
      const src = prev.canvases.find((c) => c.id === id)
      if (!src) return prev
      const copy: CanvasDoc = {
        ...JSON.parse(JSON.stringify(src)),
        id: newDocId,
        name: `${src.name} 副本`,
        updatedAt: Date.now(),
      }
      return { ...prev, canvases: [...prev.canvases, copy], activeId: copy.id }
    })
    return newDocId
  }, [])

  const deleteCanvas = useCallback((id: string) => {
    setPersisted((prev) => {
      if (prev.canvases.length <= 1) return prev // 至少保留一张
      const rest = prev.canvases.filter((c) => c.id !== id)
      const activeId = prev.activeId === id ? rest[0].id : prev.activeId
      return { ...prev, canvases: rest, activeId }
    })
  }, [])

  const canvasSummaries = useMemo<CanvasSummary[]>(
    () =>
      canvases.map((c) => ({
        id: c.id,
        name: c.name,
        studentCount: c.data.students.filter(
          (s) => s.name.trim() || s.university.trim() || s.city.trim(),
        ).length,
        updatedAt: c.updatedAt,
        active: c.id === active.id,
      })),
    [canvases, active.id],
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
      canvases: canvasSummaries,
      activeCanvasId: active.id,
      activeCanvasName: active.name,
      switchCanvas,
      createCanvas,
      renameCanvas,
      duplicateCanvas,
      deleteCanvas,
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
      canvasSummaries,
      active.id,
      active.name,
      switchCanvas,
      createCanvas,
      renameCanvas,
      duplicateCanvas,
      deleteCanvas,
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
