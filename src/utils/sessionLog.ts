/**
 * 会话日志缓冲（仅内存，不上传）：
 * - 包裹 console.log/info/warn/error + window error/unhandledrejection + 资源加载失败（捕获阶段），
 *   把当次浏览器会话的控制台记录存入环形缓冲（最多 300 条，刷新即清空）；
 * - 面包屑（breadcrumb）：应用启动信息、路由跳转、页面可见性、网络断连/恢复等关键事件
 *   自动记录——保证日志「详细且永远有内容」，不再只是控制台输出；
 * - 业务模块可调用 breadcrumb() 追加关键动作（如导出开始/完成/失败）；
 * - 唯一出口是 getSessionLog()——只有在用户于反馈表单主动勾选
 *   「附带本次会话日志」并点击提交时，才会随反馈上传到 /api/logs（保留 48 小时）。
 */

import { APP_VERSION } from '@/version'

export interface SessionLogEntry {
  t: number
  level: 'log' | 'info' | 'warn' | 'error'
  text: string
}

const MAX_ENTRIES = 300
const MAX_TEXT = 500
const buffer: SessionLogEntry[] = []
let installed = false

function stringify(v: unknown): string {
  if (typeof v === 'string') return v
  if (v instanceof Error) return `${v.name}: ${v.message}`
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function push(level: SessionLogEntry['level'], args: unknown[]): void {
  const text = args
    .map(stringify)
    .join(' ')
    .replace(/https?:\/\/[^\s)]+/g, (u) => u.split('?')[0].split('#')[0]) // 去掉 URL 参数/锚点（分享数据在 hash 里）
    .slice(0, MAX_TEXT)
  if (text.trim() === '') return
  buffer.push({ t: Date.now(), level, text })
  if (buffer.length > MAX_ENTRIES) buffer.shift()
}

/** 面包屑：记录一个关键动作/事件（业务模块主动调用，如导出、导入、分享） */
export function breadcrumb(text: string): void {
  try {
    push('info', [`[行为] ${text}`])
  } catch {
    // 静默
  }
}

/** 去掉 query/hash 的干净 URL（分享数据在 hash 里，绝不进日志） */
function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw, window.location.origin)
    return u.origin + u.pathname
  } catch {
    return ''
  }
}

/** 当前网络状态描述（navigator.connection 非标准，做防御性读取） */
function netInfo(): string {
  try {
    const c = (navigator as { connection?: { effectiveType?: string } }).connection
    return c?.effectiveType ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** 安装包裹与全局监听（幂等；任何一步失败都不影响原 console 行为） */
export function initSessionLog(): void {
  if (installed) return
  installed = true
  try {
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      const orig = console[level].bind(console)
      console[level] = (...args: unknown[]) => {
        try {
          push(level, args)
        } catch {
          // 静默
        }
        orig(...args)
      }
    }

    // 任何 JavaScript 报错都要进日志（含堆栈首行定位）
    window.addEventListener('error', (ev) => {
      const e = ev as ErrorEvent
      push('error', [`${e.message} @${e.filename}:${e.lineno}:${e.colno}`])
    })
    // 资源加载失败（script/img/link 等）：不冒泡，必须捕获阶段
    window.addEventListener(
      'error',
      (ev) => {
        const target = ev.target as EventTarget | null
        if (target && target !== window && !(ev as ErrorEvent).message) {
          const el = target as { src?: string; href?: string; tagName?: string }
          push('error', [`资源加载失败：${el.tagName ?? 'unknown'} ${cleanUrl(el.src ?? el.href ?? '')}`])
        }
      },
      true,
    )
    window.addEventListener('unhandledrejection', (ev) => {
      push('error', ['unhandledrejection', stringify(ev.reason)])
    })

    // —— 面包屑：启动信息（版本/路径/视口/语言/网络/触屏） ——
    const touch = 'ontouchstart' in window ? '触屏' : '非触屏'
    breadcrumb(
      `应用启动 v${APP_VERSION} · ${location.pathname} · 视口 ${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}x · ${navigator.language} · 网络 ${netInfo()} · ${touch}`,
    )

    // —— 面包屑：SPA 路由跳转（pushState/replaceState/popstate） ——
    const wrapHistory = (fn: History['pushState']) =>
      function (this: History, ...args: Parameters<History['pushState']>) {
        const r = fn.apply(this, args)
        breadcrumb(`路由 → ${location.pathname}`)
        return r
      }
    history.pushState = wrapHistory(history.pushState)
    history.replaceState = wrapHistory(history.replaceState)
    window.addEventListener('popstate', () => breadcrumb(`路由 → ${location.pathname}`))

    // —— 面包屑：页面可见性与网络状态 ——
    document.addEventListener('visibilitychange', () => {
      breadcrumb(document.visibilityState === 'hidden' ? '页面切到后台' : '页面回到前台')
    })
    window.addEventListener('online', () => breadcrumb('网络恢复'))
    window.addEventListener('offline', () => breadcrumb('网络断开'))
  } catch {
    // 不影响应用
  }
}

/** 取当前会话日志副本（仅供反馈表单主动上传使用） */
export function getSessionLog(): SessionLogEntry[] {
  return buffer.slice()
}
