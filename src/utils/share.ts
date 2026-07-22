/**
 * 分享为链接（短链接版）：
 * 用户主动点击「分享为链接」时，把画布数据（剥离图片二进制后）POST 到
 * /api/share 存入 Cloudflare KV，换取 10 位短 id，拼成 https://…/?share=<id>。
 * 短链接有效期 7 天，到期后服务端数据自动删除。
 *
 * 拿到链接的人打开即把画布导入为一张新画布，可继续编辑；
 * 每个人的修改只保存在自己设备的浏览器里，互不影响，
 * 想同步就各自再生成新的分享链接。
 *
 * 说明：毛笔字、自定义校徽、班徽等图片二进制不随链接分享
 * （接收方设备 localStorage 容量有限），分享弹窗中会明确告知。
 */
import type { MapData } from '@/types'

export interface SharePayload {
  format: 'cenfan-map-share'
  version: 1
  name: string
  data: unknown
  theme: unknown
  fontSlots: unknown
}

export interface ShareBuildResult {
  url: string
  /** 因容量原因被剥离、不随链接分享的内容说明 */
  stripped: string[]
  /** 过期时间戳（毫秒） */
  expiresAt: number
}

/** 深拷贝 data 并剥离图片类数据；返回剥离说明 */
function stripBinary(
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

/** 生成分享短链接；接口失败时抛出带中文信息的 Error */
export async function createShareLink(canvas: {
  name: string
  data: MapData
  theme: unknown
  fontSlots: unknown
  badge: string | null
}): Promise<ShareBuildResult> {
  const stripped: string[] = []
  const data = stripBinary(canvas.data, canvas.badge, stripped)
  const payload: SharePayload = {
    format: 'cenfan-map-share',
    version: 1,
    name: canvas.name,
    data,
    theme: canvas.theme,
    fontSlots: canvas.fontSlots,
  }
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null
    if (err?.error === 'payload_too_large') {
      throw new Error('画布数据过大，无法生成链接，请改用导出 JSON 文件分享')
    }
    throw new Error('分享链接生成失败，请稍后重试')
  }
  const { id, expiresAt } = (await res.json()) as { id: string; expiresAt: number }
  return {
    url: `${window.location.origin}/?share=${id}`,
    stripped,
    expiresAt,
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

/** 按短 id 拉取分享的画布；不存在/已过期/网络失败返回 null */
export async function fetchSharedCanvas(id: string): Promise<SharePayload | null> {
  try {
    const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`)
    if (!res.ok) return null
    const parsed = (await res.json()) as Partial<SharePayload>
    if (parsed?.format !== 'cenfan-map-share' || !parsed.data) return null
    return {
      format: 'cenfan-map-share',
      version: 1,
      name: typeof parsed.name === 'string' ? parsed.name : '分享的画布',
      data: parsed.data,
      theme: parsed.theme,
      fontSlots: parsed.fontSlots,
    }
  } catch (err) {
    console.error('分享链接加载失败', err)
    return null
  }
}
