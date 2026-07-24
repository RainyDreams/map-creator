/**
 * JavaScript 错误自动上报（匿名、尽力而为、绝不打扰用户）：
 * - 捕获 window error（含资源加载失败）与 unhandledrejection；
 * - 只上报错误技术信息：kind/message/stack/页面路径/版本/UA——
 *   页面路径只取 pathname，query 与 hash（可能含分享数据）一律剥离；
 * - 客户端去重（同签名一次会话只报一次）+ 会话级总量上限（6 条）；
 * - 短暂聚合后发送（sendBeacon 优先，失败静默丢弃），离线/失败一律不打扰；
 * - 仅生产环境启用（本站域名），本地开发不上报。
 */
import { APP_VERSION } from '@/version'

/** 一次会话最多上报条数（客户端自限，服务端另有限流兜底） */
const SESSION_MAX = 6
/** 聚合发送的延迟（ms）：合并同一时刻的错误爆发 */
const FLUSH_DELAY = 1200

interface ErrorPayload {
  kind: 'error' | 'unhandledrejection' | 'resource'
  message: string
  stack?: string
  page: string
  version: string
  ua: string
  line?: number
  col?: number
}

let sent = 0
const sentSigs = new Set<string>()
let queue: ErrorPayload[] = []
let timer: ReturnType<typeof setTimeout> | null = null

/** 仅生产域名启用；localStorage 调试开关可在任意环境打开（排障用） */
function enabled(): boolean {
  try {
    if (localStorage.getItem('cenfan-errdebug') === '1') return true
  } catch {
    // localStorage 不可用时按域名判断
  }
  const h = window.location.hostname
  return h === 'map.linkbrain.top' || h.slice(-22) === '.cengfan-map.pages.dev'
}

/** 去查询/哈希的干净 URL（分享链接数据在 hash 里，绝不能上报） */
function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw, window.location.origin)
    return u.origin + u.pathname
  } catch {
    return ''
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

function signatureOf(p: ErrorPayload): string {
  const top = (p.stack ?? '').split('\n').find((l) => l.trim() !== '') ?? ''
  return `${p.kind}|${p.message}|${top}`
}

function flush() {
  timer = null
  const batch = queue
  queue = []
  for (const p of batch) {
    if (sent >= SESSION_MAX) return
    sent += 1
    const body = JSON.stringify(p)
    try {
      if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon(
          '/api/error-report',
          new Blob([body], { type: 'application/json' }),
        )
        if (ok) continue
      }
      // sendBeacon 不可用/失败时回退 keepalive fetch；结果一律不处理
      fetch('/api/error-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    } catch {
      // 上报失败静默丢弃
    }
  }
}

function enqueue(p: ErrorPayload) {
  if (!enabled() || sent >= SESSION_MAX) return
  const sig = signatureOf(p)
  if (sentSigs.has(sig)) return
  sentSigs.add(sig)
  queue.push(p)
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(flush, FLUSH_DELAY)
}

function basePayload(kind: ErrorPayload['kind'], message: string): ErrorPayload {
  return {
    kind,
    message: truncate(message || 'unknown error', 500),
    page: window.location.pathname,
    version: APP_VERSION,
    ua: truncate(navigator.userAgent, 200),
  }
}

/** 安装全局错误监听（应用启动时调用一次） */
export function initErrorReporter(): void {
  if (!enabled()) return

  window.addEventListener(
    'error',
    (ev) => {
      // 资源加载失败（script/img/link 等）：target 是元素，没有 message
      const target = ev.target as EventTarget | null
      if (target && target !== window && !(ev as ErrorEvent).message) {
        const el = target as { src?: string; href?: string; tagName?: string }
        const src = cleanUrl(el.src ?? el.href ?? '')
        const p = basePayload('resource', `资源加载失败：${el.tagName ?? 'unknown'} ${src}`)
        enqueue(p)
        return
      }
      const e = ev as ErrorEvent
      const p = basePayload('error', e.message ?? 'unknown error')
      if (typeof e.error?.stack === 'string') p.stack = truncate(e.error.stack, 2000)
      if (typeof e.lineno === 'number') p.line = e.lineno
      if (typeof e.colno === 'number') p.col = e.colno
      enqueue(p)
    },
    true, // capture：资源错误不冒泡，必须捕获阶段监听
  )

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = (ev as PromiseRejectionEvent).reason
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : (() => {
              try {
                return JSON.stringify(reason)
              } catch {
                return 'unhandled rejection'
              }
            })()
    const p = basePayload('unhandledrejection', message)
    if (reason instanceof Error && typeof reason.stack === 'string') {
      p.stack = truncate(reason.stack, 2000)
    }
    enqueue(p)
  })

  // 页面隐藏/关闭前把队列里剩余的错误发出去
  const flushNow = () => {
    if (timer !== null) {
      clearTimeout(timer)
      flush()
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
  })
  window.addEventListener('pagehide', flushNow)
}
