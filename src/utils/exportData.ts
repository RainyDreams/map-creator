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
