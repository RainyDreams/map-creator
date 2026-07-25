/**
 * 匿名使用统计（为管理端「统计与分析」提供数据）：
 * - 只发送事件名（session / pv / export / feedback / log / share），
 *   不带任何页面参数、名单内容或身份标识；服务端按天聚合计数；
 * - 仅在用户已同意协议（与启用 Clarity 的同一同意）后发送；
 * - session 事件每个浏览器会话每天只发一次（sessionStorage 控制）。
 */

import { APP_VERSION } from '@/version'

export type AnalyticsEvent = 'session' | 'pv' | 'export' | 'feedback' | 'log' | 'share'

const SESSION_MARK_KEY = 'cenfan-an-session-day'

function consentGiven(): boolean {
  try {
    return localStorage.getItem('cenfan-consent-v1') === '1'
  } catch {
    return false
  }
}

/** 发送一个匿名计数事件（sendBeacon 优先，失败静默） */
export function track(name: AnalyticsEvent): void {
  if (!consentGiven()) return
  try {
    const body = JSON.stringify({ name, v: APP_VERSION })
    const blob = new Blob([body], { type: 'application/json' })
    if (navigator.sendBeacon && navigator.sendBeacon('/api/analytics', blob)) return
    void fetch('/api/analytics', { method: 'POST', body, keepalive: true }).catch(() => {})
  } catch {
    // 静默
  }
}

/** 每个浏览器会话每天上报一次 session（用于估算日会话数） */
export function trackSessionOnce(): void {
  try {
    const day = new Date().toISOString().slice(0, 10)
    if (sessionStorage.getItem(SESSION_MARK_KEY) === day) return
    sessionStorage.setItem(SESSION_MARK_KEY, day)
    track('session')
  } catch {
    // 静默
  }
}
