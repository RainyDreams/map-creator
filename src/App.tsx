import { useState } from 'react'
import { Routes, Route } from 'react-router'
import { MapDataProvider } from '@/store/MapDataContext'
import EntryPage from '@/pages/EntryPage'
import MapPage from '@/pages/MapPage'
import AgreementPage from '@/pages/AgreementPage'
import PrivacyPage from '@/pages/PrivacyPage'
import AboutPage from '@/pages/AboutPage'
import SiteFooter from '@/components/layout/SiteFooter'
import { ClipboardList, Map as MapIcon } from 'lucide-react'

type TabKey = 'entry' | 'map'

/**
 * Creator 外壳：
 * - 桌面端（md 及以上）：左录入、右地图，双栏实时联动
 * - 手机端：底部 Tab 栏在“录入 / 地图”之间切换
 */
function Creator() {
  const [tab, setTab] = useState<TabKey>('entry')

  return (
    <div className="flex h-dvh flex-col bg-amber-50/60">
      {/* 桌面端双栏 */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <aside className="flex w-[420px] shrink-0 flex-col border-r border-amber-200/70 bg-white/80">
          <div className="min-h-0 flex-1">
            <EntryPage />
          </div>
          <SiteFooter />
        </aside>
        <main className="min-w-0 flex-1">
          <MapPage />
        </main>
      </div>

      {/* 手机端单页 + 底部 Tab；页脚仅在录入页展示，避免挤压地图画布 */}
      <div className="min-h-0 flex-1 overflow-hidden md:hidden">
        {tab === 'entry' ? <EntryPage /> : <MapPage />}
      </div>
      {tab === 'entry' && (
        <div className="md:hidden">
          <SiteFooter />
        </div>
      )}
      <nav className="flex shrink-0 border-t border-amber-200/70 bg-white md:hidden">
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
        active ? 'font-semibold text-amber-700' : 'text-stone-400'
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
