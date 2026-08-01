import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppLink } from '@/components/layout/RouteLoadingOverlay'

/**
 * 静态信息页通用外壳：返回首页 + 标题 + 正文。
 * 风格与应用一致：暖黄米色系、低饱和、充足留白，移动端可读。
 * hideHome：二级页面（如反馈详情）隐藏「返回首页」，只保留页面自己的返回项，避免误触。
 */
export default function StaticPageLayout({
  title,
  hideHome = false,
  children,
}: {
  title: string
  hideHome?: boolean
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-amber-50/60">
      <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:py-12">
        {!hideHome && (
          <AppLink
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-white/80 px-3 py-1.5 text-xs text-stone-500 transition-colors hover:border-amber-300 hover:text-amber-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回首页
          </AppLink>
        )}
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-stone-800 sm:text-3xl">
          {title}
        </h1>
        <div className="mt-6 space-y-6 pb-16 text-sm leading-7 text-stone-600">
          {children}
        </div>
      </div>
    </div>
  )
}

/** 章节标题 */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-stone-800">{children}</h2>
  )
}
