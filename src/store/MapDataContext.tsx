import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { EMPTY_MAP_DATA, newId, type MapData, type StudentEntry } from '@/types'
import { DEFAULT_THEME, presetById, type ThemeConfig } from '@/utils/themes'
import { isLikelyCountryOrRegion, normalizeProvinceName, provinceOfCity } from '@/utils/geo'
import {
  DEFAULT_FONT_SLOTS,
  ensureCustomFontsLoaded,
  type CustomFont,
  type FontSlot,
} from '@/utils/fonts'
import { fetchShareState, pushShareUpdate, type ShareRole } from '@/utils/share'

const STORAGE_KEY = 'cenfan-map-store-v2'
const LEGACY_KEY = 'cenfan-map-data-v1'

/** 分享协同状态：画布与一条分享短链接绑定后携带 */
export interface ShareMeta {
  id: string
  role: ShareRole
  /** 本端已同步到的服务端版本号 */
  rev: number
  /** 过期时间戳（毫秒），有编辑活动会顺延 */
  expiresAt: number
}

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
  /** 绑定的分享协同（可选） */
  share?: ShareMeta
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
  /** 已绑定分享时给出链接 id 与本端角色（管理台展示用） */
  share?: { id: string; role: ShareRole }
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
  /** —— 分享协同 —— */
  /** 当前画布绑定的分享；未绑定为 null */
  activeShare: ShareMeta | null
  /** 把当前画布绑定到一条分享链接（创建或加入后调用） */
  attachShare: (share: ShareMeta) => void
  /** 解除当前画布的分享绑定（本地不再同步） */
  detachShare: () => void
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
  /**
   * 从 JSON 文件导入为一张新画布并切换过去（不覆盖现有画布）。
   * 字段经 normalize 校验/迁移；名单数据非法时返回 null。
   * 传入 share 时同时绑定协同（打开分享链接场景）。
   */
  importCanvas: (
    input: {
      name?: unknown
      data?: unknown
      theme?: unknown
      fontSlots?: unknown
      badge?: unknown
    },
    share?: ShareMeta,
  ) => string | null
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
  // v1.5 迁移：「蹭饭图」独立大字（bigTextStyle）已取消；旧数据该字段直接忽略
  const ls = (d.labelSizes ?? {}) as Partial<MapData['labelSizes']>
  // v1.6 迁移：字号由百分比改为 px。旧值 60–160 视为百分比，按基准（省份16px/其余13px）换算
  const px = (v: unknown, base: number, min: number, max: number): number => {
    if (typeof v !== 'number') return base
    if (v >= 60 && v <= 160) return Math.round((base * v) / 100) // 旧百分比
    if (v >= min && v <= max) return Math.round(v) // 新 px
    return base
  }
  return {
    title,
    titleSize:
      typeof d.titleSize === 'number' && d.titleSize >= 16 && d.titleSize <= 64
        ? d.titleSize
        : 30,
    students: d.students,
    teachers: d.teachers,
    showTeachers: d.showTeachers !== false,
    // v1.8 迁移：旧数据无 showBadges 字段时默认显示校徽
    showBadges: d.showBadges !== false,
    titleAlign:
      d.titleAlign === 'center' ? 'center' : d.titleAlign === 'right' ? 'right' : 'left',
    subtitle: typeof d.subtitle === 'string' ? d.subtitle : '',
    labelSizes: {
      province: px(ls.province, 16, 10, 28),
      person: px(ls.person, 13, 9, 22),
      place: px(ls.place, 13, 9, 22),
      // v1.10 迁移：旧数据无 teacher 字段时按默认 13px（与学生姓名一致）
      teacher: px(ls.teacher, 13, 9, 22),
    },
    // v1.11 迁移：旧数据无 labelColumns 字段时默认每侧一列
    labelColumns: d.labelColumns === 2 ? 2 : 1,
    // v1.12 迁移：同校合并默认关闭；省份卡片背景默认开启；圆角默认 10
    mergeSameSchool: d.mergeSameSchool === true,
    labelCardBg: d.labelCardBg !== false,
    cardRadius: typeof d.cardRadius === 'number' && Number.isFinite(d.cardRadius)
      ? Math.min(24, Math.max(0, Math.round(d.cardRadius)))
      : 10,
    customOrderProvinces: Array.isArray(d.customOrderProvinces)
      ? d.customOrderProvinces.filter((p): p is string => typeof p === 'string')
      : [],
    calligraphy: normalizeCalligraphy(d.calligraphy),
    badgeOverrides: normalizeBadgeOverrides(d.badgeOverrides),
  }
}

/** v1.9 迁移：旧数据无 badgeOverrides 字段时回退空表；逐项校验结构 */
function normalizeBadgeOverrides(raw: unknown): MapData['badgeOverrides'] {
  const out: MapData['badgeOverrides'] = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, o] of Object.entries(raw as Record<string, unknown>)) {
    const b = o as Partial<MapData['badgeOverrides'][string]> | null
    if (!b || typeof b !== 'object') continue
    const item: MapData['badgeOverrides'][string] = {}
    if (b.hidden === true) item.hidden = true
    if (typeof b.dataUrl === 'string' && b.dataUrl.startsWith('data:image/')) {
      item.dataUrl = b.dataUrl
    }
    if (item.hidden || item.dataUrl) out[id] = item
  }
  return out
}

/** v1.7 迁移：旧数据无 calligraphy 字段时回退空表；逐项校验结构 */
function normalizeCalligraphy(raw: unknown): MapData['calligraphy'] {
  const out: MapData['calligraphy'] = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [uni, asset] of Object.entries(raw as Record<string, unknown>)) {
    const a = asset as Partial<MapData['calligraphy'][string]> | null
    if (
      a && typeof a === 'object' &&
      typeof a.dataUrl === 'string' && a.dataUrl.startsWith('data:image/') &&
      typeof a.w === 'number' && a.w > 0 &&
      typeof a.h === 'number' && a.h > 0
    ) {
      out[uni] = {
        dataUrl: a.dataUrl,
        w: a.w,
        h: a.h,
        scale: typeof a.scale === 'number' && a.scale >= 0.3 && a.scale <= 3 ? a.scale : 1,
      }
    }
  }
  return out
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
  const slots = { ...DEFAULT_FONT_SLOTS }
  if (!raw || typeof raw !== 'object') return slots
  const r = raw as Record<string, string>
  // v1.6 迁移：旧槽位 year→digit（数字）、title→han+latin（中文/英文沿用原标题字体）
  if (typeof r.year === 'string' && typeof r.digit !== 'string') slots.digit = r.year
  if (typeof r.title === 'string') {
    if (typeof r.han !== 'string') slots.han = r.title
    if (typeof r.latin !== 'string') slots.latin = r.title
  }
  for (const slot of ['digit', 'latin', 'han', 'province', 'person', 'place'] as const) {
    if (typeof r[slot] === 'string') slots[slot] = r[slot]
  }
  return slots
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

/** 分享协同元信息校验（localStorage 迁移防御） */
function normalizeShare(raw: unknown): ShareMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const s = raw as Partial<ShareMeta>
  if (typeof s.id !== 'string' || !/^[A-Za-z0-9]{10}$/.test(s.id)) return undefined
  return {
    id: s.id,
    role: s.role === 'admin' ? 'admin' : 'member',
    rev: typeof s.rev === 'number' && s.rev >= 0 ? s.rev : 0,
    expiresAt: typeof s.expiresAt === 'number' ? s.expiresAt : 0,
  }
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
              share: normalizeShare(c.share),
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

/** 协同推送防抖（毫秒） */
const SHARE_PUSH_DEBOUNCE = 2000
/** 协同拉取轮询间隔（毫秒） */
const SHARE_PULL_INTERVAL = 5000

export function MapDataProvider({ children }: { children: ReactNode }) {
  const [persisted, setPersisted] = useState<Persisted>(loadInitial)
  const { canvases, activeId, customFonts } = persisted
  const active = canvases.find((c) => c.id === activeId) ?? canvases[0]
  const { data, theme, fontSlots, badge } = active
  const activeShare = active.share ?? null

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

  /* ---------------- 分享协同同步引擎 ----------------
   * 推送：本地编辑（名单/主题/字体/画布名）防抖 2s 后 PUT 到服务端；
   * 拉取：每 5s 带 rev 轮询，有变化时整包应用（last-write-wins）。
   * suppressPushRef：应用远端修改会触发本地 state 变化，置位以避免回声推送。
   * pushInFlightRef：推送在途时跳过该次轮询，避免 rev 竞态。
   * syncInitRef：挂载/切换画布后的首次 effect 不推送（内容本就来自服务端）。
   */
  const suppressPushRef = useRef(false)
  const pushInFlightRef = useRef(false)
  const syncInitRef = useRef<string | null>(null)
  const shareRevRef = useRef(0)
  const activeShareId = activeShare?.id ?? null
  const activeShareRev = activeShare?.rev ?? 0

  useEffect(() => {
    shareRevRef.current = activeShareRev
  }, [activeShareRev])

  const activeName = active.name

  // —— 推送 ——
  useEffect(() => {
    if (!activeShareId) return
    if (syncInitRef.current !== activeShareId) {
      syncInitRef.current = activeShareId
      return
    }
    if (suppressPushRef.current) {
      suppressPushRef.current = false
      return
    }
    const snapshot = { name: activeName, data, theme, fontSlots }
    const shareId = activeShareId
    const timer = setTimeout(() => {
      pushInFlightRef.current = true
      void pushShareUpdate(shareId, snapshot).then((result) => {
        pushInFlightRef.current = false
        if (result.ok && typeof result.rev === 'number') {
          // 只回写 rev/expiresAt；这些字段不在推送依赖里，不会再次触发推送
          setPersisted((prev) => ({
            ...prev,
            canvases: prev.canvases.map((c) =>
              c.share?.id === shareId
                ? {
                    ...c,
                    share: {
                      ...c.share,
                      rev: result.rev ?? c.share.rev,
                      expiresAt: result.expiresAt ?? c.share.expiresAt,
                    },
                  }
                : c,
            ),
          }))
        } else if (result.gone) {
          setPersisted((prev) => ({
            ...prev,
            canvases: prev.canvases.map((c) =>
              c.share?.id === shareId ? { ...c, share: undefined } : c,
            ),
          }))
          toast('分享链接已过期，协同已断开', {
            id: `share-gone-${shareId}`,
            description: '本地内容已保留，可重新生成分享链接',
          })
        }
      })
    }, SHARE_PUSH_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [activeShareId, activeName, data, theme, fontSlots])

  // —— 拉取 ——
  useEffect(() => {
    if (!activeShareId) return
    const shareId = activeShareId
    let stopped = false
    const pull = async () => {
      if (stopped) return
      if (document.visibilityState !== 'visible') return
      if (pushInFlightRef.current) return
      const state = await fetchShareState(shareId, shareRevRef.current)
      if (!state || stopped || !state.changed) return
      const remoteData = normalizeData(state.data)
      if (!remoteData) return
      // 防回声：本次 state 变化不触发推送
      suppressPushRef.current = true
      setPersisted((prev) => ({
        ...prev,
        canvases: prev.canvases.map((c) =>
          c.share?.id === shareId
            ? {
                ...c,
                name:
                  typeof state.name === 'string' && state.name.trim() !== ''
                    ? state.name
                    : c.name,
                data: remoteData,
                theme: normalizeTheme(state.theme),
                fontSlots: normalizeFontSlots(state.fontSlots),
                share: {
                  id: shareId,
                  role: state.role,
                  rev: state.rev,
                  expiresAt: state.expiresAt || c.share.expiresAt,
                },
                updatedAt: Date.now(),
              }
            : c,
        ),
      }))
      toast('画布已同步其他设备的修改', { id: `share-sync-${shareId}` })
    }
    void pull()
    const timer = setInterval(() => void pull(), SHARE_PULL_INTERVAL)
    const onVisible = () => void pull()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [activeShareId])

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
      // Excel 导入的境外自动识别：城市栏填的是国家/地区名（如“美国”）时标记 overseas，
      // 地图上不指向中国，单独列入「海外 / 境外」区块；错别字不匹配名单，仍按未定位处理
      const withIds = students.map((s) => {
        const city = s.city.trim()
        const overseas =
          s.overseas === true ||
          (city !== '' && !provinceOfCity(city) && !normalizeProvinceName(city) && isLikelyCountryOrRegion(city))
        return { ...s, id: newId(), overseas: overseas || undefined }
      })
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

  /* ---------------- 分享协同绑定 ---------------- */

  const attachShare = useCallback((share: ShareMeta) => {
    setPersisted((prev) => ({
      ...prev,
      canvases: prev.canvases.map((c) =>
        c.id === prev.activeId ? { ...c, share } : c,
      ),
    }))
  }, [])

  const detachShare = useCallback(() => {
    setPersisted((prev) => ({
      ...prev,
      canvases: prev.canvases.map((c) =>
        c.id === prev.activeId ? { ...c, share: undefined } : c,
      ),
    }))
  }, [])

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
      // 副本不参与原画布的协同
      delete copy.share
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

  const importCanvas = useCallback(
    (
      input: { name?: unknown; data?: unknown; theme?: unknown; fontSlots?: unknown; badge?: unknown },
      share?: ShareMeta,
    ): string | null => {
      const data = normalizeData(input.data)
      if (!data) return null
      const doc: CanvasDoc = {
        id: newId(),
        name:
          typeof input.name === 'string' && input.name.trim() !== ''
            ? input.name.trim()
            : '导入的画布',
        data,
        theme: normalizeTheme(input.theme),
        fontSlots: normalizeFontSlots(input.fontSlots),
        badge:
          typeof input.badge === 'string' && input.badge.startsWith('data:image/')
            ? input.badge
            : null,
        updatedAt: Date.now(),
        share,
      }
      setPersisted((prev) => ({ ...prev, canvases: [...prev.canvases, doc], activeId: doc.id }))
      return doc.id
    },
    [],
  )

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
        share: c.share ? { id: c.share.id, role: c.share.role } : undefined,
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
      activeShare,
      attachShare,
      detachShare,
      canvases: canvasSummaries,
      activeCanvasId: active.id,
      activeCanvasName: active.name,
      switchCanvas,
      createCanvas,
      renameCanvas,
      duplicateCanvas,
      deleteCanvas,
      importCanvas,
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
      activeShare,
      attachShare,
      detachShare,
      canvasSummaries,
      active.id,
      active.name,
      switchCanvas,
      createCanvas,
      renameCanvas,
      duplicateCanvas,
      deleteCanvas,
      importCanvas,
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
