/**
 * 「我的反馈被回复」通知（页脚红点）：
 * - 用户在本机提交反馈时记住 id（cenfan-my-feedback，最多 20 条）；
 * - 页脚定期拉取公开反馈板，发现「我的反馈」出现回复、或回复时间晚于上次已读，
 *   则在「问题反馈」链接上显示红点；
 * - 进入反馈页并加载列表后调用 markRepliesSeen() 标记已读，红点消失；
 * - 跨标签页/组件同步靠 CustomEvent（EVENT_NAME），不引入状态库。
 */

const MY_IDS_KEY = 'cenfan-my-feedback'
const SEEN_KEY = 'cenfan-reply-seen'
export const REPLY_EVENT = 'cenfan-reply-notify'
const MAX_MY_IDS = 20
/** 反馈板列表本机缓存有效期（公开接口本身也有 20s CDN 缓存） */
const LIST_CACHE_MS = 60_000

interface PublicItem {
  id: string
  replyTs?: number
  reply?: string
}

let listCache: { at: number; items: PublicItem[] } | null = null

export function rememberMyFeedback(id: string): void {
  try {
    const arr = JSON.parse(localStorage.getItem(MY_IDS_KEY) ?? '[]') as string[]
    if (!Array.isArray(arr)) return
    if (arr.includes(id)) return
    arr.unshift(id)
    localStorage.setItem(MY_IDS_KEY, JSON.stringify(arr.slice(0, MAX_MY_IDS)))
  } catch {
    // 忽略
  }
}

function myIds(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(MY_IDS_KEY) ?? '[]') as string[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function seenMap(): Record<string, number> {
  try {
    const m = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, number>
    return m && typeof m === 'object' ? m : {}
  } catch {
    return {}
  }
}

/** 根据列表计算是否有未读回复（纯函数，便于测试） */
export function hasUnreadReply(items: PublicItem[]): boolean {
  const mine = new Set(myIds())
  if (mine.size === 0) return false
  const seen = seenMap()
  return items.some((it) => {
    if (!mine.has(it.id) || !it.reply) return false
    const ts = typeof it.replyTs === 'number' ? it.replyTs : 0
    return ts > (seen[it.id] ?? 0)
  })
}

/** 拉反馈板（带 60s 本机缓存）并计算是否有我的未读回复 */
export async function checkNewReplies(force = false): Promise<boolean> {
  try {
    // 本机从未提交过反馈就不发请求，避免无意义消耗
    if (myIds().length === 0) return false
    if (!force && listCache && Date.now() - listCache.at < LIST_CACHE_MS) {
      return hasUnreadReply(listCache.items)
    }
    const res = await fetch('/api/feedback')
    if (!res.ok) return false
    const data = (await res.json()) as { items: PublicItem[] }
    listCache = { at: Date.now(), items: data.items ?? [] }
    return hasUnreadReply(listCache.items)
  } catch {
    return false
  }
}

/** 反馈页加载列表后调用：把我的反馈的当前回复时间标记为已读 */
export function markRepliesSeen(items: PublicItem[]): void {
  const mine = new Set(myIds())
  if (mine.size === 0) return
  const seen = seenMap()
  let changed = false
  for (const it of items) {
    if (!mine.has(it.id) || !it.reply) continue
    const ts = typeof it.replyTs === 'number' ? it.replyTs : Date.now()
    if (ts > (seen[it.id] ?? 0)) {
      seen[it.id] = ts
      changed = true
    }
  }
  if (changed) {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
    } catch {
      // 忽略
    }
  }
  // 同步缓存，随后广播让页脚立即消点
  listCache = { at: Date.now(), items }
  window.dispatchEvent(new CustomEvent(REPLY_EVENT))
}
