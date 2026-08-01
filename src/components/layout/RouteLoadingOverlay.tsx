import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useLocation, type LinkProps } from 'react-router'
import { Loader2 } from 'lucide-react'

/**
 * 路由切换全屏加载动画（v1.42.8）。
 *
 * 背景：react-router v7 的导航包在 startTransition 里，React 对 transition 中
 * 新触发的 Suspense 会「挂起提交、保留旧界面」，Suspense fallback 根本不会显示。
 * 因此改为在链接点击时主动开启全屏遮罩，路由真正提交（懒加载 chunk 就绪）后收起。
 *
 * 防抖策略：
 * - 150ms 内完成的跳转不显示，避免秒开页面闪 Loading；
 * - 显示后最短保留 400ms，避免一闪而过；
 * - 15s 兜底自动关闭，防止异常状态下遮罩卡死页面。
 */
const BeginLoadingContext = createContext<(to: string) => void>(() => {})

const SHOW_DELAY = 150
const MIN_VISIBLE = 400
const SAFETY_TIMEOUT = 15000

export function RouteLoadingProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [fromPath, setFromPath] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const visibleRef = useRef(false)
  const shownAtRef = useRef(0)
  const delayTimer = useRef(0)
  const minTimer = useRef(0)
  const safetyTimer = useRef(0)

  const setVisibleBoth = useCallback((v: boolean) => {
    visibleRef.current = v
    if (v) shownAtRef.current = Date.now()
    setVisible(v)
  }, [])

  const begin = useCallback(
    (to: string) => {
      if (!to || to === location.pathname) return
      window.clearTimeout(delayTimer.current)
      window.clearTimeout(minTimer.current)
      window.clearTimeout(safetyTimer.current)
      setFromPath(location.pathname)
      delayTimer.current = window.setTimeout(() => setVisibleBoth(true), SHOW_DELAY)
      safetyTimer.current = window.setTimeout(() => {
        setVisibleBoth(false)
        setFromPath(null)
      }, SAFETY_TIMEOUT)
    },
    [location.pathname, setVisibleBoth],
  )

  // 路由提交完成（路径变化）→ 收起遮罩，但保证最短展示时长
  useEffect(() => {
    if (fromPath === null || location.pathname === fromPath) return
    window.clearTimeout(delayTimer.current)
    window.clearTimeout(safetyTimer.current)
    if (!visibleRef.current) {
      setFromPath(null)
      return
    }
    const elapsed = Date.now() - shownAtRef.current
    if (elapsed >= MIN_VISIBLE) {
      setVisibleBoth(false)
      setFromPath(null)
    } else {
      window.clearTimeout(minTimer.current)
      minTimer.current = window.setTimeout(() => {
        setVisibleBoth(false)
        setFromPath(null)
      }, MIN_VISIBLE - elapsed)
    }
  }, [location.pathname, fromPath, setVisibleBoth])

  return (
    <BeginLoadingContext.Provider value={begin}>
      {children}
      <div
        aria-hidden={!visible}
        className={`fixed inset-0 z-[60] flex items-center justify-center bg-stone-100 transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
          <p className="text-xs text-stone-400">页面加载中…</p>
        </div>
      </div>
    </BeginLoadingContext.Provider>
  )
}

function isPlainLeftClick(e: MouseEvent<HTMLAnchorElement>) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

/** 站内链接：点击时触发全屏加载遮罩，路由提交后自动收起。用法与 react-router Link 一致。 */
export function AppLink({ to, onClick, target, ...rest }: LinkProps) {
  const begin = useContext(BeginLoadingContext)
  return (
    <Link
      to={to}
      target={target}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || !isPlainLeftClick(e) || (target && target !== '_self')) return
        begin(typeof to === 'string' ? to : (to.pathname ?? ''))
      }}
      {...rest}
    />
  )
}
