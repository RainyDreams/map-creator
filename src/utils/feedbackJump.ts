/**
 * 跨域反馈跳转（map → feedback.linkbrain.top）：
 *
 * 反馈平台独立成站后，「附带使用日志」的链路拆成两段：
 * 1. 本站（日志产生地）：用户授权后先把累积日志 POST 到 /api/logs 拿到日志 ID；
 * 2. 跳转反馈平台时以 URL 参数携带 log/cu/cs（日志 ID + Clarity 标识），
 *    反馈提交时随表单上送——管理员在后台可把反馈、日志、Clarity 录屏三者对照。
 *
 * 隐私边界不变：日志只在用户主动选择「附带使用日志」时上传；
 * 不上传时仅携带 Clarity 匿名标识（不含任何操作记录）。
 */

import Clarity from '@microsoft/clarity'
import { APP_VERSION } from '@/version'
import { getSessionLog, clearSessionLog } from '@/utils/sessionLog'

const FEEDBACK_ORIGIN = 'https://feedback.linkbrain.top'

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

/** 构造反馈平台跳转 URL：固定带产品参数；Clarity 标识始终携带；有日志时带 logId */
export function buildFeedbackUrl(logId = ''): string {
  const p = new URLSearchParams({ product: 'cengfan' })
  const cu = clarityCookie('_clck')
  const cs = clarityCookie('_clsk')
  if (cu !== '') p.set('cu', cu)
  if (cs !== '') p.set('cs', cs)
  if (logId !== '') p.set('log', logId)
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
    }
    return id
  } catch {
    return ''
  }
}
