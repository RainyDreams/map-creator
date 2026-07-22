/**
 * 画布数据导出为 JSON 文件（备份/迁移用）。
 * 包含格式版本号，便于后续版本做导入兼容。
 */
export interface CanvasJsonPayload {
  format: 'cenfan-map-canvas'
  version: 1
  exportedAt: string
  name: string
  data: unknown
  theme: unknown
  fontSlots: unknown
  badge: string | null
}

/** 解析 JSON 画布文件；非法时抛出带中文信息的 Error */
export function parseCanvasJson(text: string): CanvasJsonPayload {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('不是有效的 JSON 文件')
  }
  if (!raw || typeof raw !== 'object') throw new Error('JSON 内容不是画布数据')
  const p = raw as Partial<CanvasJsonPayload>
  if (p.format !== 'cenfan-map-canvas') {
    throw new Error('这不是蹭饭图生成器导出的画布文件（format 标识不符）')
  }
  if (!p.data || typeof p.data !== 'object') {
    throw new Error('画布文件缺少名单数据（data 字段）')
  }
  return {
    format: 'cenfan-map-canvas',
    version: 1,
    exportedAt: typeof p.exportedAt === 'string' ? p.exportedAt : '',
    name: typeof p.name === 'string' ? p.name : '',
    data: p.data,
    theme: p.theme,
    fontSlots: p.fontSlots,
    badge: typeof p.badge === 'string' ? p.badge : null,
  }
}

export function exportCanvasJson(canvas: {
  name: string
  data: unknown
  theme: unknown
  fontSlots: unknown
  badge: string | null
}): void {
  const payload: CanvasJsonPayload = {
    format: 'cenfan-map-canvas',
    version: 1,
    exportedAt: new Date().toISOString(),
    name: canvas.name,
    data: canvas.data,
    theme: canvas.theme,
    fontSlots: canvas.fontSlots,
    badge: canvas.badge,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const base = canvas.name.trim().replace(/[\\/:*?"<>|\s]+/g, '-') || '蹭饭图画布'
  const a = document.createElement('a')
  a.download = `${base}.json`
  a.href = url
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
