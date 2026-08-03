/**
 * 跨域反馈跳转（map → feedback.linkbrain.top）：
 *
 * 反馈平台独立成站后，「附带使用日志」的链路拆成两段：
 * 1. 本站（日志产生地）：点击反馈时先把累积日志 POST 到 /api/logs 拿到日志 ID，
 *    ID 登记进本地累积清单（localStorage，7 天有效，与服务端保留期一致）；
 * 2. 跳转反馈平台时以 URL 参数携带 log/cu/cs——log 为逗号分隔的全部累积 ID，
 *    即使用户之前上传过日志却没提交反馈，这些 ID 也会一并带入下次反馈；
 *    反馈提交成功后，反馈页通过 postMessage 回执通知本站清除这批 ID。
 * 管理员在后台可把反馈、多份日志、Clarity 录屏三者对照。
 *
 * 隐私边界：日志只含页面操作与报错记录，不含名单数据；服务端保留 7 天。
 */

import Clarity from '@microsoft/clarity'
import { APP_VERSION } from '@/version'
import { getSessionLog, clearSessionLog } from '@/utils/sessionLog'

/** 反馈平台源（postMessage 回执的 origin 校验也用） */
export const FEEDBACK_ORIGIN = 'https://feedback.linkbrain.top'

/** 本地累积的已上传日志 ID：{id, ts} 列表，反馈提交成功（收到回执）才清除 */
const PENDING_KEY = 'cenfan-pending-log-ids'
/** 与服务端日志保留期一致（7 天）：过期的 ID 服务端已删，不再附带 */
const LOG_TTL_MS = 7 * 24 * 60 * 60 * 1000

function readPending(): { id: string; ts: number }[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as { id: string; ts: number }[]
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (e) => e && typeof e.id === 'string' && /^[0-9a-z:]{8,48}$/.test(e.id) && typeof e.ts === 'number',
    )
  } catch {
    return []
  }
}

function writePending(list: { id: string; ts: number }[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list))
  } catch {
    // 存储不可用时静默（内存语义退化为当次有效）
  }
}

/** 上传成功后登记一个日志 ID（本地累积，跨会话持久） */
function addPendingLogId(id: string): void {
  const now = Date.now()
  const list = readPending().filter((e) => now - e.ts < LOG_TTL_MS && e.id !== id)
  list.push({ id, ts: now })
  writePending(list)
}

/** 取当前应附带的全部日志 ID（顺带清理过期项） */
export function getPendingLogIds(): string[] {
  const now = Date.now()
  const list = readPending().filter((e) => now - e.ts < LOG_TTL_MS)
  writePending(list)
  return list.map((e) => e.id)
}

/** 反馈提交成功回执：把这批 ID 从本地累积中移除 */
export function ackPendingLogIds(ids: string[]): void {
  if (!Array.isArray(ids) || ids.length === 0) return
  const drop = new Set(ids)
  writePending(readPending().filter((e) => !drop.has(e.id)))
}

/** 打开反馈跳转对话框的全局事件名（App 挂载的对话框监听） */
export const FEEDBACK_JUMP_EVENT = 'cenfan:feedback-jump'

/** 任意入口触发反馈跳转对话框（页脚、导出失败提示条等） */
export function openFeedbackJump(): void {
  try {
    window.dispatchEvent(new CustomEvent(FEEDBACK_JUMP_EVENT))
  } catch {
    // 静默
  }
}

/** 读取 Clarity Cookie 标识（_clck=匿名用户 ID，_clsk=会话 ID；分隔符新版为 ^ 旧版为 |，取主体部分） */
function clarityCookie(key: '_clck' | '_clsk'): string {
  try {
    for (const part of document.cookie.split(';')) {
      const t = part.trim()
      if (t.startsWith(`${key}=`)) {
        const v = decodeURIComponent(t.slice(key.length + 1))
        const cut = v.search(/[|^]/)
        return (cut >= 0 ? v.slice(0, cut) : v).slice(0, 40)
      }
    }
  } catch {
    // 忽略
  }
  return ''
}

/** 构造反馈平台跳转 URL：固定带产品参数；Clarity 标识始终携带；有累积日志时带 log 参数（逗号分隔多 ID） */
export function buildFeedbackUrl(logIds = ''): string {
  const p = new URLSearchParams({ product: 'cengfan' })
  const cu = clarityCookie('_clck')
  const cs = clarityCookie('_clsk')
  if (cu !== '') p.set('cu', cu)
  if (cs !== '') p.set('cs', cs)
  if (logIds !== '') p.set('log', logIds)
  return `${FEEDBACK_ORIGIN}/?${p.toString()}`
}

/**
 * 上传累积使用日志到 /api/logs，返回日志 ID（无内容/失败返回 ''）。
 * 成功即清空本机累积（「从上次上传完开始记录」语义），并在 Clarity 会话打 logId 标签。
 */
export async function uploadSessionLog(): Promise<string> {
  try {
    const entries = getSessionLog()
    if (entries.length === 0) return ''
    let net = 'unknown'
    try {
      net =
        (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType ??
        'unknown'
    } catch {
      // 忽略
    }
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries,
        meta: {
          version: APP_VERSION,
          ua: navigator.userAgent,
          page: location.pathname,
          viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}x`,
          lang: navigator.language,
          net,
          clarityUser: clarityCookie('_clck'),
          claritySession: clarityCookie('_clsk'),
        },
      }),
    })
    if (!res.ok) return ''
    const data = (await res.json()) as { id?: unknown }
    const id = typeof data.id === 'string' ? data.id : ''
    if (id !== '') {
      try {
        Clarity.setTag('logId', id)
      } catch {
        // 忽略
      }
      clearSessionLog()
      // 登记进本地累积清单：本次反馈若未提交，该 ID 会随下次反馈一并附带
      addPendingLogId(id)
    }
    return id
  } catch {
    return ''
  }
}
