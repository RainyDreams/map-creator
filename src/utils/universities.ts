/**
 * 大学数据客户端：批量查询 /api/universities（软科排名/省份/城市/校徽 slug）。
 * 内存缓存 + 批量合并请求；接口不可用时全部降级为 null，前端回退本地推断逻辑。
 */

export interface UniInfo {
  /** 匹配到的规范校名 */
  n: string | null
  /** 城市（校区城市优先） */
  c: string | null
  /** 省份全称 */
  p: string | null
  /** 软科 2025 主榜排名；501 表示 500+；null 表示未上榜/未收录 */
  r: number | null
  /** 校徽 slug（有值即可请求 /api/school-badge?name=...） */
  b: string | null
}

/** key 为查询时使用的原始校名（trim 后） */
const cache = new Map<string, UniInfo>()
/** 正在飞行中的请求去重 */
const inflight = new Map<string, Promise<void>>()

const EMPTY: UniInfo = { n: null, c: null, p: null, r: null, b: null }

/** 同步读缓存；未预取过返回 undefined（调用方应先 prefetchUniversities） */
export function getUniInfoSync(name: string): UniInfo | undefined {
  return cache.get(name.trim())
}

/**
 * 批量预取一批校名的数据（自动跳过已缓存/飞行中）。
 * 返回的 Map 只含本次新取回的条目；全量数据用 getUniInfoSync 读取。
 */
export async function prefetchUniversities(names: string[]): Promise<Map<string, UniInfo>> {
  const want = [...new Set(names.map((s) => s.trim()).filter((s) => s !== '' && !cache.has(s)))]
  const fresh = new Map<string, UniInfo>()
  if (want.length === 0) return fresh

  const todo = want.filter((n) => !inflight.has(n))
  if (todo.length === 0) {
    await Promise.all(want.map((n) => inflight.get(n)))
    return fresh
  }

  const task = (async () => {
    try {
      const res = await fetch(`/api/universities?names=${encodeURIComponent(todo.join(','))}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { results?: Array<{ q: string } & UniInfo> }
      const seen = new Set<string>()
      for (const item of json.results ?? []) {
        const info: UniInfo = { n: item.n, c: item.c, p: item.p, r: item.r, b: item.b }
        cache.set(item.q, info)
        fresh.set(item.q, info)
        seen.add(item.q)
      }
      for (const q of todo) {
        if (!seen.has(q)) {
          cache.set(q, EMPTY)
          fresh.set(q, EMPTY)
        }
      }
    } catch (err) {
      console.warn('[大学数据] 批量查询失败，回退本地推断', err)
      for (const q of todo) {
        // 失败不写缓存，下次还会重试
        fresh.set(q, EMPTY)
      }
    } finally {
      for (const q of todo) inflight.delete(q)
    }
  })()

  for (const q of todo) inflight.set(q, task)
  await task
  return fresh
}

/** 校徽图片地址（经本站 Pages Function 代理，不直连第三方） */
export function schoolBadgeUrl(university: string): string {
  return `/api/school-badge?name=${encodeURIComponent(university.trim())}`
}

/* ---------- 校徽 dataURL 预取缓存：渲染与导出都直接用内联数据，避免导出时逐张重新 fetch ---------- */

/** key 为原始校名（trim 后）；value 为 dataURL，null 表示取不到（404/失败） */
const badgeCache = new Map<string, string | null>()
const badgeInflight = new Map<string, Promise<void>>()

/** 同步读校徽 dataURL 缓存；未预取过返回 undefined */
export function getBadgeDataUrlSync(university: string): string | null | undefined {
  return badgeCache.get(university.trim())
}

/**
 * 批量预取校徽并转成 dataURL 缓存（自动跳过已缓存/飞行中）。
 * 之后渲染 <image> 与导出 PNG 都直接使用内联 dataURL：
 * html-to-image 看到 data: 协议会跳过网络内联步骤，首次导出也能明显提速。
 */
export async function prefetchBadgeDataUrls(universities: string[]): Promise<void> {
  const todo = [...new Set(
    universities.map((s) => s.trim()).filter((s) => s !== '' && !badgeCache.has(s) && !badgeInflight.has(s)),
  )]
  await Promise.all(
    todo.map((name) => {
      const task = (async () => {
        try {
          const res = await fetch(schoolBadgeUrl(name))
          if (!res.ok) {
            badgeCache.set(name, null) // 404 等：记住"没有"，不再反复请求
            return
          }
          const blob = await res.blob()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader()
            fr.onload = () => resolve(String(fr.result))
            fr.onerror = () => reject(new Error('校徽读取失败'))
            fr.readAsDataURL(blob)
          })
          badgeCache.set(name, dataUrl)
        } catch {
          // 网络失败不写缓存，下次还会重试
        } finally {
          badgeInflight.delete(name)
        }
      })()
      badgeInflight.set(name, task)
      return task
    }),
  )
}
