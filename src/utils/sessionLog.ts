/**
 * 会话日志缓冲（仅内存，不上传）：
 * - 包裹 console.log/info/warn/error + window error/unhandledrejection，
 *   把当次浏览器会话的控制台记录存入环形缓冲（最多 300 条，刷新即清空）；
 * - 唯一出口是 getSessionLog()——只有在用户于反馈表单主动勾选
 *   「附带本次会话日志」并点击提交时，才会随反馈上传到 /api/logs（保留 48 小时）。
 */

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

/** 安装包裹（幂等；任何一步失败都不影响原 console 行为） */
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
    window.addEventListener('error', (ev) => {
      push('error', [`${ev.message} @${ev.filename}:${ev.lineno}`])
    })
    window.addEventListener('unhandledrejection', (ev) => {
      push('error', ['unhandledrejection', stringify(ev.reason)])
    })
  } catch {
    // 不影响应用
  }
}

/** 取当前会话日志副本（仅供反馈表单主动上传使用） */
export function getSessionLog(): SessionLogEntry[] {
  return buffer.slice()
}
