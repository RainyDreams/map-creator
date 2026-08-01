import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

/**
 * 路由级错误兜底（v1.42.9）：懒加载分块彻底拉取失败（自动刷新已用过一次仍失败）
 * 或页面渲染异常时，展示可手动重试的全屏界面，而不是整页白屏。
 */
export class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[路由] 页面渲染失败：', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (error !== null) {
      return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-100 px-6">
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <p className="text-base font-medium text-stone-700">页面加载失败</p>
            <p className="text-xs leading-5 text-stone-400">
              可能是网络波动或版本更新导致的临时问题，刷新页面通常即可恢复。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2 text-sm text-white transition-colors hover:bg-stone-700"
            >
              <RefreshCw className="h-4 w-4" />
              重新加载
            </button>
            <p className="max-h-20 overflow-hidden break-all text-[10px] leading-4 text-stone-300">
              {String(error.message ?? error)}
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
