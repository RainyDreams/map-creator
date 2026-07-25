/**
 * isolate 内存限流（每次请求 0 次 KV 写入）：
 * - 在每个 isolate 进程内维护滑动窗口计数，不持久化、不跨 isolate；
 * - 是「尽力而为」的限流——多 isolate 并发时各自计数（约等于限额 × isolate 数），
 *   Cloudflare 边缘的 DDoS 防护作为兜底；精确全局限流在这个体量下不值得烧 KV 写额度；
 * - KV 免费版写额度极小（约 1000 次/天），绝不能拿来做限流计数器。
 */

const buckets = new Map<string, { count: number; reset: number }>()

/** 返回 true = 放行；false = 超限 */
export function rateLimitOk(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
  } else {
    b.count += 1
    if (b.count > limit) return false
  }
  // 防内存膨胀：bucket 过多时顺手清理过期项
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.reset <= now) buckets.delete(k)
    }
  }
  return true
}

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown'
}
