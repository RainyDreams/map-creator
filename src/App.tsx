import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router'
import { MapDataProvider, useMapData } from '@/store/MapDataContext'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import EntryPage from '@/pages/EntryPage'
import MapPage from '@/pages/MapPage'
import SiteFooter from '@/components/layout/SiteFooter'
import { ConsentDialog } from '@/components/ConsentDialog'
import { ClipboardList, Info, Loader2, Map as MapIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { onGotoMapExport } from '@/utils/exportBus'
import { takeShareIdFromUrl, fetchShareState } from '@/utils/share'
import { takeSharePayloadFromHash, type ShareLinkPayload } from '@/utils/shareLink'
import { ShareImportLanding } from '@/components/ShareImportLanding'
import { track, trackSessionOnce } from '@/utils/analytics'

/** 协议/隐私/关于页按需加载（独立 chunk），首屏不下载 */
const AgreementPage = lazy(() => import('@/pages/AgreementPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))
const AboutPage = lazy(() => import('@/pages/AboutPage'))
const FeedbackPage = lazy(() => import('@/pages/FeedbackPage'))

/**
 * 路由级全屏加载动画（v1.42.7）：懒加载页面 chunk 下载期间覆盖全屏，
 * 风格与全站一致（stone 底 + 旋转指示器）。
 * 150ms 防闪烁延迟：chunk 已缓存秒开时不闪 Loading。
 */
function RouteLoading() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 150)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-100">
      {show && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
          <p className="text-xs text-stone-400">页面加载中…</p>
        </div>
      )}
    </div>
  )
}

type TabKey = 'entry' | 'map' | 'about'

const SIDEBAR_COLLAPSED_KEY = 'cenfan-sidebar-collapsed'
const SIDEBAR_WIDTH_KEY = 'cenfan-sidebar-width'
const SIDEBAR_DEFAULT_W = 420
const SIDEBAR_MIN_W = 320
const SIDEBAR_MAX_W = 640

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function loadSidebarWidth(): number {
  try {
    const v = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    if (Number.isFinite(v) && v >= SIDEBAR_MIN_W && v <= SIDEBAR_MAX_W) return v
  } catch {
    // 忽略
  }
  return SIDEBAR_DEFAULT_W
}

/**
 * Creator 外壳：
 * - 桌面端（md 及以上）：左录入、右地图，双栏实时联动；录入栏可折叠（持久化），
 *   其右边界可左右拖拽调整宽度（320–640px，持久化）；
 *   页脚位于右侧主区域底部（地图区下方）
 * - 手机端：底部 Tab 栏在“录入 / 地图 / 关于”之间切换；页脚仅在“录入”Tab 底部展示
 */
function Creator() {
  const [tab, setTab] = useState<TabKey>('entry')
  const [collapsed, setCollapsed] = useState<boolean>(loadSidebarCollapsed)
  const [sidebarWidth, setSidebarWidth] = useState<number>(loadSidebarWidth)
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{ startX: number; startW: number } | null>(null)
  const { canvases, importCanvas, switchCanvas } = useMapData()

  // 打开分享短链接：?share=<id> → 拉取协同文档并加入协同
  useEffect(() => {
    const id = takeShareIdFromUrl()
    if (!id) return
    let cancelled = false
    toast.loading('正在打开分享的画布…', { id: 'share-open' })
    fetchShareState(id).then((state) => {
      if (cancelled) return
      if (!state || !state.changed) {
        toast.error('分享链接不存在或已超过 7 天有效期', { id: 'share-open' })
        return
      }
      // 本机已有绑定同一链接的画布（多端回访）：直接切换过去，轮询会自动补齐最新内容
      const existing = canvases.find((c) => c.share?.id === id)
      if (existing) {
        switchCanvas(existing.id)
        toast.success(`已切换到协同画布「${existing.name}」`, {
          id: 'share-open',
          description: '修改会自动同步到所有打开该链接的设备',
        })
        return
      }
      const docId = importCanvas(
        {
          name: state.name,
          data: state.data,
          theme: state.theme,
          fontSlots: state.fontSlots,
          badge: null,
        },
        { id, role: state.role, rev: state.rev, expiresAt: state.expiresAt },
      )
      if (docId === null) {
        toast.error('分享的画布数据不完整，无法打开', { id: 'share-open' })
        return
      }
      toast.success(`已加入协同画布「${state.name || '未命名画布'}」`, {
        id: 'share-open',
        description: '你是成员，你的修改会自动同步给所有打开链接的设备',
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 录入页「预览并导出为图片」：切到地图 Tab（MapPage 挂载后自动开始导出）
  useEffect(() => onGotoMapExport(() => setTab('map')), [])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // 隐私模式等写入失败时静默忽略
    }
  }, [collapsed])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
    } catch {
      // 忽略
    }
  }, [sidebarWidth])

  // 侧栏宽度拖拽：在文档级监听移动/抬起，拖拽中禁用宽度过渡动画
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const s = dragState.current
      if (!s) return
      const next = s.startW + (e.clientX - s.startX)
      setSidebarWidth(Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, next)))
    }
    const onUp = () => {
      dragState.current = null
      setDragging(false)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  return (
    <div className="flex h-dvh flex-col bg-stone-100">
      {/* 桌面端双栏 */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <aside
          className={cn(
            'relative flex shrink-0 flex-col overflow-hidden bg-white',
            dragging ? '' : 'transition-[width] duration-300 ease-in-out',
            collapsed ? 'w-0' : 'border-r border-stone-200',
          )}
          style={collapsed ? undefined : { width: sidebarWidth }}
        >
          {/* 折叠按钮：悬浮于录入栏右上角（页头右上为空白区） */}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="收起录入栏"
            title="收起录入栏"
            className="absolute top-2.5 right-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-400 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-700"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <div className="min-h-0 flex-1">
            <EntryPage />
          </div>
          {/* 宽度拖拽柄：贴在录入栏右边界，悬浮时显现 */}
          {!collapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="拖拽调整录入栏宽度"
              title="拖拽调整录入栏宽度"
              onMouseDown={(e) => {
                dragState.current = { startX: e.clientX, startW: sidebarWidth }
                setDragging(true)
                e.preventDefault()
              }}
              className={cn(
                'absolute top-0 right-0 z-30 h-full w-1.5 cursor-col-resize transition-colors',
                dragging ? 'bg-stone-400/60' : 'bg-transparent hover:bg-stone-300/60',
              )}
            />
          )}
        </aside>
        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* 折叠后的展开悬浮钮：贴在地图区左缘 */}
          {collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="展开录入栏"
              title="展开录入栏"
              className="absolute top-1/2 left-0 z-20 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-stone-200 bg-white text-stone-400 shadow-md transition-colors hover:w-7 hover:text-stone-700"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
          <div className="min-h-0 flex-1">
            <MapPage />
          </div>
          <SiteFooter />
        </main>
      </div>
      {/* 拖拽中全局改变光标并禁用文本选择 */}
      {dragging && <div className="fixed inset-0 z-40 cursor-col-resize select-none" />}

      {/* 手机端单页 + 底部 Tab；页脚仅在录入页展示，避免挤压地图画布 */}
      <div className="min-h-0 flex-1 overflow-hidden md:hidden">
        {tab === 'entry' ? (
          <EntryPage />
        ) : tab === 'map' ? (
          <MapPage />
        ) : (
          <div className="h-full overflow-y-auto">
            <Suspense fallback={<RouteLoading />}>
              <AboutPage />
            </Suspense>
          </div>
        )}
      </div>
      {tab === 'entry' && (
        <div className="md:hidden">
          <SiteFooter />
        </div>
      )}
      <nav className="flex shrink-0 border-t border-stone-200 bg-white md:hidden">
        <TabButton
          active={tab === 'entry'}
          onClick={() => setTab('entry')}
          icon={<ClipboardList className="h-5 w-5" />}
          label="录入"
        />
        <TabButton
          active={tab === 'map'}
          onClick={() => setTab('map')}
          icon={<MapIcon className="h-5 w-5" />}
          label="地图"
        />
        <TabButton
          active={tab === 'about'}
          onClick={() => setTab('about')}
          icon={<Info className="h-5 w-5" />}
          label="关于"
        />
      </nav>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
        active ? 'font-semibold text-stone-900' : 'text-stone-400 hover:text-stone-600'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

export default function App() {
  /** hash 分享链接（#import=…）解码出的画布数据：展示预览落地页 */
  const [importPayload, setImportPayload] = useState<ShareLinkPayload | null>(null)
  useEffect(() => {
    const p = takeSharePayloadFromHash()
    if (p) setImportPayload(p)
  }, [])

  // 通知「功能更新」遮罩：应用框架首帧已提交渲染，可撤除遮罩——
  // 字体等后台资源继续加载（font-display:swap 渐进显示），
  // 不再等 window.load 把所有字体下载完才撤；index.html 侧保留 load 兜底
  useEffect(() => {
    window.dispatchEvent(new Event('cenfan:app-ready'))
  }, [])

  // 匿名使用统计：会话每天一次 + 页面访问计数（仅事件名，不含路径参数；需用户已同意协议）
  const { pathname } = useLocation()
  useEffect(() => {
    trackSessionOnce()
    track('pv')
  }, [pathname])

  return (
    <MapDataProvider>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Creator />} />
          {/* Pages 会把 debug.html 规范化重定向到 /debug，调试入口与正式入口共用 Creator */}
          <Route path="/debug" element={<Creator />} />
          <Route path="/agreement" element={<AgreementPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
        </Routes>
      </Suspense>
      {importPayload !== null && (
        <ShareImportLanding payload={importPayload} onClose={() => setImportPayload(null)} />
      )}
      <ConsentDialog />
      <Toaster position="top-center" richColors />
    </MapDataProvider>
  )
}
