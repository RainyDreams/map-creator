import { useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectionProps {
  icon: LucideIcon
  title: string
  /** 标题旁的弱化补充（如「可选填」），浅色小字 */
  titleHint?: string
  /** 标题右侧摘要：折叠时也保留，让收起状态仍有信息量（如「已填 28 人」「一列 · 13px」） */
  summary?: ReactNode
  /** 标题右侧常驻操作（开关、小按钮等）：独立于折叠按钮，点击不触发展开 */
  headerExtra?: ReactNode
  /** 移动端默认是否展开（移动端屏幕紧张，次要分区默认收起） */
  mobileOpen?: boolean
  /** 桌面端默认是否展开（默认 true：桌面空间充裕，全部铺开） */
  desktopOpen?: boolean
  children: ReactNode
}

/**
 * 录入页统一的可折叠分区：
 * - 五个分区（班级信息/学生名单/老师名单/画布风格/排版设计）共用同一外观与交互；
 * - 标题加粗深色突出，摘要与补充浅色弱化——一眼看清主次；
 * - 移动端默认只展开核心分区，其余收起但保留摘要；桌面端默认全展开；
 * - 展开/收起用 grid-rows 过渡动画，轻量无依赖。
 */
export function Section({
  icon: Icon,
  title,
  titleHint,
  summary,
  headerExtra,
  mobileOpen = true,
  desktopOpen = true,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
      ? mobileOpen
      : desktopOpen,
  )

  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3.5 py-3 md:px-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Icon className="h-4 w-4 shrink-0 text-stone-400" />
          <span className="truncate text-sm font-semibold text-stone-800">{title}</span>
          {titleHint && (
            <span className="shrink-0 text-xs font-normal text-stone-400">{titleHint}</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {summary && <span className="text-xs font-normal text-stone-400">{summary}</span>}
            <ChevronDown
              className={cn(
                'h-4 w-4 text-stone-400 transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </span>
        </button>
        {headerExtra && <div className="flex shrink-0 items-center gap-2">{headerExtra}</div>}
      </div>
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-stone-100 px-3.5 py-3 md:px-4 md:py-4">{children}</div>
        </div>
      </div>
    </section>
  )
}
