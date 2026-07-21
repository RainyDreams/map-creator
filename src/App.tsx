import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router'
import { MapDataProvider } from '@/store/MapDataContext'
import EntryPage from '@/pages/EntryPage'
import MapPage from '@/pages/MapPage'
import AgreementPage from '@/pages/AgreementPage'
import PrivacyPage from '@/pages/PrivacyPage'
import AboutPage from '@/pages/AboutPage'
import SiteFooter from '@/components/layout/SiteFooter'
import { ClipboardList, Info, Map as MapIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

type TabKey = 'entry' | 'map' | 'about'

const SIDEBAR_COLLAPSED_KEY = 'cenfan-sidebar-collapsed'

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Creator 外壳：
 * - 桌面端（md 及以上）：左录入、右地图，双栏实时联动；录入栏可折叠，折叠状态持久化；
 *   页脚位于右侧主区域底部（地图区下方）
 * - 手机端：底部 Tab 栏在“录入 / 地图 / 关于”之间切换；页脚仅在“录入”Tab 底部展示
 */
function Creator() {
  const [tab, setTab] = useState<TabKey>('entry')
  const [collapsed, setCollapsed] = useState<boolean>(loadSidebarCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // 隐私模式等写入失败时静默忽略
    }
  }, [collapsed])

  return (
    <div className="flex h-dvh flex-col bg-stone-100">
      {/* 桌面端双栏 */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <aside
          className={cn(
            'relative flex shrink-0 flex-col overflow-hidden bg-white transition-[width] duration-300 ease-in-out',
            collapsed ? 'w-0' : 'w-[420px] border-r border-stone-200',
          )}
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

      {/* 手机端单页 + 底部 Tab；页脚仅在录入页展示，避免挤压地图画布 */}
      <div className="min-h-0 flex-1 overflow-hidden md:hidden">
        {tab === 'entry' ? (
          <EntryPage />
        ) : tab === 'map' ? (
          <MapPage />
        ) : (
          <div className="h-full overflow-y-auto">
            <AboutPage />
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
  return (
    <MapDataProvider>
      <Routes>
        <Route path="/" element={<Creator />} />
        <Route path="/agreement" element={<AgreementPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </MapDataProvider>
  )
}
