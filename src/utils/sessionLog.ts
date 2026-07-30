/**
 * 使用日志缓冲（跨会话累积，本机持久化，仅用户主动上传时外发）：
 * - 包裹 console.log/info/warn/error + window error/unhandledrejection + 资源加载失败（捕获阶段）；
 * - 面包屑（breadcrumb）：应用启动信息、路由跳转、页面可见性、网络断连/恢复等关键事件
 *   自动记录——保证日志「详细且永远有内容」，不再只是控制台输出；
 * - 业务模块可调用 breadcrumb() 追加关键动作（如导出开始/完成/失败）；
 * - 累积范围：从上次成功上传后开始（从未上传过则从首次访问开始）——
 *   每条日志即时节流持久化到 localStorage，刷新/关闭浏览器不丢失；
 * - 唯一出口是 getSessionLog()——只有在用户于反馈表单主动勾选
 *   「附带我的使用日志」并点击提交时，才会随反馈上传到 /api/logs（保留 48 小时）；
 *   上传成功后调用 clearSessionLog() 清空本机累积，重新开始记录；
 * - 容量有界：最多 800 条且序列化后约 ≤ 200KB，超出丢弃最旧条目并插入截断标记。
 */

import { APP_VERSION } from '@/version'

export interface SessionLogEntry {
  t: number
  level: 'log' | 'info' | 'warn' | 'error'
  text: string
}

const MAX_ENTRIES = 800
const MAX_TEXT = 500
/** 持久化体积上限（字符数，约 200KB）：localStorage 总量有限，名单数据也在用 */
const MAX_STORE_CHARS = 200_000
const STORE_KEY = 'cenfan-session-log-v2'
const buffer: SessionLogEntry[] = []
let installed = false
let loaded = false
let flushTimer: number | null = null
/** 是否已插入过截断标记（避免反复插入） */
let truncatedMark = false
/** fetch 失败/4xx/5xx 去重键（方法+路径+状态），每会话每种只记一次 */
const netLogged = new Set<string>()

function loadStored(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as SessionLogEntry[]
      if (Array.isArray(arr)) {
        for (const e of arr) {
          if (e && typeof e.t === 'number' && typeof e.text === 'string') {
            buffer.push({ t: e.t, level: e.level ?? 'log', text: e.text.slice(0, MAX_TEXT) })
          }
        }
      }
    }
  } catch {
    // 数据损坏则从零开始
  }
}

/** 节流持久化（800ms 尾随）：控制台爆发时不会每条都写 localStorage */
function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    try {
      let out = buffer
      let json = JSON.stringify(out)
      // 体积超限：从头部丢弃最旧条目，直到装得下
      while (json.length > MAX_STORE_CHARS && out.length > 1) {
        out = out.slice(Math.max(1, Math.floor(out.length * 0.2)))
        json = JSON.stringify(out)
      }
      if (out.length !== buffer.length) {
        buffer.splice(0, buffer.length, ...out)
        if (!truncatedMark) {
          truncatedMark = true
          buffer.unshift({ t: Date.now(), level: 'warn', text: '…（早期日志因容量限制已截断）' })
        }
      }
      localStorage.setItem(STORE_KEY, JSON.stringify(buffer))
    } catch {
      // 存储失败（隐私模式/满）静默忽略，内存缓冲仍在
    }
  }, 800)
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v
  // Error：附堆栈前 3 帧——只留 message 时经常看不出调用链
  if (v instanceof Error) {
    const stack = (v.stack ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('Error'))
      .slice(0, 3)
      .join(' ← ')
    return `${v.name}: ${v.message}${stack ? ` | ${stack}` : ''}`
  }
  // Event：html-to-image 等库在图片加载失败时以裸 Event reject，
  // JSON.stringify 只能得到 {"isTrusted":true}——提取事件类型与目标资源地址
  if (typeof Event !== 'undefined' && v instanceof Event) {
    const t = v.target as {
      tagName?: string
      src?: string
      href?: string | { baseVal?: string }
    } | null
    const href = typeof t?.href === 'object' ? t?.href?.baseVal : t?.href
    const where = [t?.tagName, t?.src ?? href ?? ''].filter(Boolean).join(' ')
    return `[事件 ${v.type}]${where ? ` ${where}` : ''}`
  }
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function push(level: SessionLogEntry['level'], args: unknown[]): void {
  loadStored()
  const text = args
    .map(stringify)
    .join(' ')
    .replace(/https?:\/\/[^\s)]+/g, (u) => u.split('?')[0].split('#')[0]) // 去掉 URL 参数/锚点（分享数据在 hash 里）
    .slice(0, MAX_TEXT)
  if (text.trim() === '') return
  buffer.push({ t: Date.now(), level, text })
  if (buffer.length > MAX_ENTRIES) buffer.shift()
  scheduleFlush()
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

    // 任何 JavaScript 报错都要进日志（含堆栈前 2 帧定位）；
    // Clarity 脚本自身的内部异常不是应用错误，过滤掉不污染使用日志
    window.addEventListener('error', (ev) => {
      const e = ev as ErrorEvent
      if ((e.filename ?? '').includes('clarity') || (e.error?.stack ?? '').includes('clarity')) return
      const errStack: string = typeof e.error?.stack === 'string' ? e.error.stack : ''
      const stackTop = errStack
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '' && !l.startsWith('Error'))
        .slice(0, 2)
        .join(' ← ')
      push('error', [
        `${e.message} @${e.filename}:${e.lineno}:${e.colno}${stackTop ? ` | ${stackTop}` : ''}`,
      ])
    })
    // 资源加载失败（script/img/link 等）：不冒泡，必须捕获阶段
    window.addEventListener(
      'error',
      (ev) => {
        const target = ev.target as EventTarget | null
        if (target && target !== window && !(ev as ErrorEvent).message) {
          // SVG 元素（如校徽 <image>）的 href 是 SVGAnimatedString 对象而非字符串，
          // 直接读会拼出 "[object SVGAnimatedString]" 丢失真实地址——取 baseVal
          const el = target as {
            src?: string
            href?: string | { baseVal?: string }
            tagName?: string
          }
          const hrefRaw = typeof el.href === 'object' ? (el.href?.baseVal ?? '') : (el.href ?? '')
          push('error', [`资源加载失败：${el.tagName ?? 'unknown'} ${cleanUrl(el.src ?? hrefRaw)}`])
        }
      },
      true,
    )
    window.addEventListener('unhandledrejection', (ev) => {
      const reason = ev.reason
      if (reason instanceof Error && (reason.stack ?? '').includes('clarity')) return
      push('error', ['unhandledrejection', stringify(reason)])
    })

    // fetch 失败与 4xx/5xx：API 级错误（如校徽 404、接口 500）此前完全不可见——
    // 只有当 URL 挂在 <img> 上时才碰巧被资源监听捕获。同一「方法+路径+状态」
    // 每次会话只记一次（校徽 404 可能连续几十次），控制日志体积；
    // 路径一律去 query/hash（校名等名单数据不进日志）
    const origFetch = window.fetch.bind(window)
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const t0 = performance.now()
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const path = cleanUrl(raw)
      const method = init?.method ?? 'GET'
      try {
        const res = await origFetch(input, init)
        if (res.status >= 400) {
          const key = `${method} ${path} ${res.status}`
          if (!netLogged.has(key)) {
            netLogged.add(key)
            push('warn', [
              `[网络] ${method} ${path} → ${res.status}（${Math.round(performance.now() - t0)}ms）`,
            ])
          }
        }
        return res
      } catch (err) {
        const key = `${method} ${path} fail`
        if (!netLogged.has(key)) {
          netLogged.add(key)
          push('warn', [
            `[网络] ${method} ${path} → 请求失败（${Math.round(performance.now() - t0)}ms）：${stringify(err)}`,
          ])
        }
        throw err
      }
    }) as typeof window.fetch

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

/** 取累积日志副本（仅供反馈表单主动上传使用） */
export function getSessionLog(): SessionLogEntry[] {
  loadStored()
  return buffer.slice()
}

/**
 * 上传成功后清空本机累积（「从上次上传完开始记录」的语义落点）：
 * 清空后立刻补一条启动面包屑作为新周期的基线。
 */
export function clearSessionLog(): void {
  loadStored()
  buffer.length = 0
  truncatedMark = false
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    // 忽略
  }
  breadcrumb('使用日志已随反馈上传，本机记录重新开始')
}
