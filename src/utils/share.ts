/**
 * 分享为链接 / 多端协同：
 * 用户点击「分享为链接」时，把画布数据（剥离图片二进制后）POST 到
 * /api/share 存入 Cloudflare KV，换取 10 位短 id，拼成 https://…/?share=<id>。
 *
 * 协同模型：
 * - 链接对应服务端同一份「协同文档」，带 rev 版本号；
 * - 任何打开链接的设备都会加入协同：编辑防抖后自动 PUT 推送，
 *   并定时带 rev 轮询拉取他人修改（last-write-wins）；
 * - 角色用 cookie 界定：创建者 = 管理员，后加入者 = 成员，均可编辑；
 * - 数据在无编辑活动 7 天后由服务端自动删除（有编辑则自动顺延）。
 *
 * 说明：毛笔字、自定义校徽、班徽等图片二进制不随链接分享
 * （接收方设备 localStorage 容量有限），分享弹窗中会明确告知。
 */
import type { MapData } from '@/types'

export type ShareRole = 'admin' | 'member'

export interface ShareCreateResult {
  id: string
  url: string
  rev: number
  role: ShareRole
  /** 过期时间戳（毫秒） */
  expiresAt: number
  /** 因容量原因被剥离、不随链接分享的内容说明 */
  stripped: string[]
}

/** GET 轮询返回：rev 未变时只有元信息；有变化时带全文 */
export interface ShareState {
  changed: boolean
  rev: number
  role: ShareRole
  expiresAt: number
  name?: string
  data?: unknown
  theme?: unknown
  fontSlots?: unknown
}

export interface SharePushResult {
  ok: boolean
  rev?: number
  expiresAt?: number
  /** 链接已过期/被删除 */
  gone?: boolean
  /** 无角色 cookie（理论上本端不会发生，兜底） */
  forbidden?: boolean
}

/** 深拷贝 data 并剥离图片类数据；返回剥离说明（hash 链接分享也复用此函数） */
export function stripBinary(
  data: MapData,
  badge: string | null,
  stripped: string[],
): MapData {
  const copy: MapData = JSON.parse(JSON.stringify(data))
  if (Object.keys(copy.calligraphy).length > 0) {
    copy.calligraphy = {}
    stripped.push('大学毛笔字图片')
  }
  let removedCustomBadge = false
  for (const id of Object.keys(copy.badgeOverrides)) {
    const o = copy.badgeOverrides[id]
    if (o?.dataUrl) {
      delete o.dataUrl
      removedCustomBadge = true
    }
    // 仅剩空对象时整体移除；隐藏标记保留
    if (o && !o.dataUrl && !o.hidden) delete copy.badgeOverrides[id]
  }
  if (removedCustomBadge) stripped.push('自定义校徽图片')
  if (badge !== null) stripped.push('班徽图片')
  return copy
}

/** 生成分享短链接（创建协同文档）；接口失败时抛出带中文信息的 Error */
export async function createShareLink(canvas: {
  name: string
  data: MapData
  theme: unknown
  fontSlots: unknown
  badge: string | null
}): Promise<ShareCreateResult> {
  const stripped: string[] = []
  const data = stripBinary(canvas.data, canvas.badge, stripped)
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'cenfan-map-share',
      name: canvas.name,
      data,
      theme: canvas.theme,
      fontSlots: canvas.fontSlots,
    }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null
    if (err?.error === 'payload_too_large') {
      throw new Error('画布数据过大，无法生成链接，请改用导出 JSON 文件分享')
    }
    if (err?.error === 'share_disabled') {
      throw new Error('分享链接功能暂时关闭，请改用导出图片或 JSON 文件分享')
    }
    throw new Error('分享链接生成失败，请稍后重试')
  }
  const { id, rev, expiresAt } = (await res.json()) as {
    id: string
    rev: number
    expiresAt: number
  }
  return {
    id,
    url: `${window.location.origin}/?share=${id}`,
    rev,
    role: 'admin',
    expiresAt,
    stripped,
  }
}

/** 从当前地址栏取出 share 短 id 并清理 URL；无则返回 null */
export function takeShareIdFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('share')
    if (!id) return null
    // 清掉地址栏参数：避免刷新重复导入，也避免用户把带参数的地址再误转发
    window.history.replaceState(null, '', window.location.pathname)
    return id
  } catch {
    return null
  }
}

/**
 * 拉取协同文档状态。
 * 传 rev 时为轮询模式：服务端 rev 未变只回 changed:false；
 * 链接不存在/已过期/网络失败返回 null。
 */
export async function fetchShareState(id: string, rev?: number): Promise<ShareState | null> {
  try {
    const revPart = typeof rev === 'number' && rev > 0 ? `&rev=${rev}` : ''
    const res = await fetch(`/api/share?id=${encodeURIComponent(id)}${revPart}`, {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const parsed = (await res.json()) as Partial<ShareState>
    if (typeof parsed?.rev !== 'number') return null
    return {
      changed: parsed.changed === true,
      rev: parsed.rev,
      role: parsed.role === 'admin' ? 'admin' : 'member',
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      data: parsed.data,
      theme: parsed.theme,
      fontSlots: parsed.fontSlots,
    }
  } catch (err) {
    console.error('协同画布拉取失败', err)
    return null
  }
}

/** 推送本地修改到协同文档；body 中的 data 会先剥离图片二进制 */
export async function pushShareUpdate(
  id: string,
  payload: { name: string; data: MapData; theme: unknown; fontSlots: unknown },
): Promise<SharePushResult> {
  try {
    const stripped: string[] = []
    const data = stripBinary(payload.data, null, stripped)
    const res = await fetch('/api/share', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: payload.name, data, theme: payload.theme, fontSlots: payload.fontSlots }),
    })
    if (res.status === 404) return { ok: false, gone: true }
    if (res.status === 403) return { ok: false, forbidden: true }
    if (!res.ok) return { ok: false }
    const parsed = (await res.json()) as { rev?: number; expiresAt?: number }
    return { ok: true, rev: parsed.rev, expiresAt: parsed.expiresAt }
  } catch (err) {
    console.error('协同画布推送失败', err)
    return { ok: false }
  }
}
