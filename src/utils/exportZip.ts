/**
 * 全量导出 / 导入 ZIP（完整画布备份）。
 *
 * 导出内容（完完整整的一张画布）：
 * 1. data.json —— 名单与全部画布配置：标题、老师、卡片位置/样式、主题、字体槽位等
 * 2. images/badge.* —— 用户上传的班徽
 * 3. images/calligraphy/*.png —— 用户上传的大学毛笔字图片
 * 4. images/badges/* —— 单个学生的自定义校徽图片
 * 5. fonts/* —— 用户上传的自定义字体文件
 *
 * 图片与字体以独立文件存放在 zip 内，data.json 中以相对路径引用；
 * 导入时按引用重建 dataURL，作为「新画布」导入（不覆盖现有画布）。
 * 兼容读取 v1.19.x 旧格式（data.json 为纯 MapData 配置，无 format 标识）。
 */

import { unzipSync, zipSync } from 'fflate'
import type { MapData } from '@/types'
import type { ThemeConfig } from '@/utils/themes'
import type { CustomFont, FontSlot } from '@/utils/fonts'

const FORMAT = 'cenfan-map-canvas-full'

/** 导出输入：一张画布的完整内容（与 CanvasDoc 对齐 + 全局自定义字体） */
export interface FullCanvasInput {
  name: string
  data: MapData
  theme: ThemeConfig
  fontSlots: Record<FontSlot, string>
  badge: string | null
  customFonts: CustomFont[]
}

/** 导入结果：payload 可直接交给 importCanvas；customFonts 需逐个 addCustomFont */
export interface ImportedCanvasZip {
  payload: {
    name: string
    data: unknown
    theme: unknown
    fontSlots: unknown
    badge: string | null
  }
  customFonts: CustomFont[]
  stats: {
    students: number
    teachers: number
    calligraphy: number
    badges: number
    fonts: number
    hasBadge: boolean
  }
}

/** 清理文件名中的非法字符 */
function sanitizeFilename(s: string): string {
  return s.trim().replace(/[\\/:*?"<>|\s]+/g, '-')
}

/** dataURL → 字节 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  const base64 = dataUrl.slice(comma + 1)
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/** 字节 → dataURL（分块 btoa，避免大字体文件栈溢出） */
function uint8ToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'application/font-woff': 'woff',
  'application/font-woff2': 'woff2',
  'application/x-font-ttf': 'ttf',
  'application/x-font-woff': 'woff',
  'application/octet-stream': 'bin',
}

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

/** 从 dataURL 的 mime 推断文件扩展名（推断不了用 bin） */
function extFromDataUrl(dataUrl: string): string {
  const m = /^data:([^;,]+)[;,]/.exec(dataUrl)
  if (!m) return 'bin'
  return MIME_TO_EXT[m[1].toLowerCase()] ?? 'bin'
}

function mimeFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return EXT_TO_MIME[ext] ?? 'application/octet-stream'
}

/** 在 zip 内生成不重复的文件路径 */
function uniquePath(used: Set<string>, path: string): string {
  if (!used.has(path)) {
    used.add(path)
    return path
  }
  const dot = path.lastIndexOf('.')
  const stem = dot > 0 ? path.slice(0, dot) : path
  const ext = dot > 0 ? path.slice(dot) : ''
  for (let i = 2; ; i++) {
    const candidate = `${stem}-${i}${ext}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
}

/* ==================== 导出 ==================== */

/** 把当前画布完完整整打包为 zip 并触发下载（同步构建，通常 <1s） */
export function exportFullCanvasZip(canvas: FullCanvasInput): void {
  const t0 = performance.now()
  console.info('[全量导出] 开始打包画布备份')
  const used = new Set<string>()
  const files: Record<string, Uint8Array> = {}

  // 1. 毛笔字图片：抽离为独立文件，data.json 中只留元信息 + 相对路径
  const calligraphyMeta: Record<
    string,
    { w: number; h: number; scale: number; image?: string }
  > = {}
  for (const [university, asset] of Object.entries(canvas.data.calligraphy)) {
    if (!asset.dataUrl) {
      calligraphyMeta[university] = { w: asset.w, h: asset.h, scale: asset.scale }
      continue
    }
    const path = uniquePath(
      used,
      `images/calligraphy/${sanitizeFilename(university) || 'asset'}.${extFromDataUrl(asset.dataUrl)}`,
    )
    files[path] = dataUrlToUint8Array(asset.dataUrl)
    calligraphyMeta[university] = { w: asset.w, h: asset.h, scale: asset.scale, image: path }
  }

  // 2. 学生自定义校徽
  const badgeOverrideMeta: Record<string, { hidden?: boolean; image?: string }> = {}
  for (const [studentId, badge] of Object.entries(canvas.data.badgeOverrides)) {
    if (!badge.dataUrl) {
      badgeOverrideMeta[studentId] = { hidden: badge.hidden }
      continue
    }
    const path = uniquePath(
      used,
      `images/badges/${sanitizeFilename(studentId) || 'badge'}.${extFromDataUrl(badge.dataUrl)}`,
    )
    files[path] = dataUrlToUint8Array(badge.dataUrl)
    badgeOverrideMeta[studentId] = { hidden: badge.hidden, image: path }
  }

  // 3. 班徽
  let badgePath: string | null = null
  if (canvas.badge) {
    badgePath = uniquePath(used, `images/badge.${extFromDataUrl(canvas.badge)}`)
    files[badgePath] = dataUrlToUint8Array(canvas.badge)
  }

  // 4. 自定义字体
  const fontMeta: Array<{ id: string; name: string; file: string }> = []
  for (const font of canvas.customFonts) {
    if (!font.dataUrl) continue
    const path = uniquePath(
      used,
      `fonts/${sanitizeFilename(font.id) || 'font'}.${extFromDataUrl(font.dataUrl)}`,
    )
    files[path] = dataUrlToUint8Array(font.dataUrl)
    fontMeta.push({ id: font.id, name: font.name, file: path })
  }

  // 5. data.json（配置主体，图片/字体以路径引用）
  const payload = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    name: canvas.name,
    data: {
      ...canvas.data,
      calligraphy: calligraphyMeta,
      badgeOverrides: badgeOverrideMeta,
    },
    theme: canvas.theme,
    fontSlots: canvas.fontSlots,
    badge: badgePath,
    customFonts: fontMeta,
  }
  files['data.json'] = new TextEncoder().encode(JSON.stringify(payload, null, 2))

  const zipData = zipSync(files, { level: 6 })
  console.info(
    `[全量导出] 打包完成：${Math.round(zipData.length / 1024)}KB，` +
      `毛笔字 ${Object.values(calligraphyMeta).filter((c) => c.image).length} 张、` +
      `自定义校徽 ${Object.values(badgeOverrideMeta).filter((b) => b.image).length} 张、` +
      `班徽 ${badgePath ? 1 : 0} 张、字体 ${fontMeta.length} 个`,
  )

  const blob = new Blob([zipData as BlobPart], { type: 'application/zip' })
  const blobUrl = URL.createObjectURL(blob)
  const baseName = sanitizeFilename(canvas.name) || '蹭饭图画布'
  try {
    const a = document.createElement('a')
    a.download = `${baseName}-全量备份.zip`
    a.href = blobUrl
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }
  console.info(`[全量导出] 总耗时 ${Math.round(performance.now() - t0)}ms`)
}

/* ==================== 导入 ==================== */

/** 从 zip 条目读取文本 JSON */
function readJson(entries: Record<string, Uint8Array>, path: string): unknown {
  const bytes = entries[path]
  if (!bytes) throw new Error('ZIP 中缺少 data.json，不是本工具导出的备份文件')
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('备份文件中的 data.json 已损坏')
  }
}

/** 按相对路径把 zip 内的图片/字体重建为 dataURL；文件缺失时返回 undefined */
function restoreDataUrl(
  entries: Record<string, Uint8Array>,
  path: unknown,
): string | undefined {
  if (typeof path !== 'string' || path === '') return undefined
  const bytes = entries[path]
  if (!bytes) {
    console.warn(`[全量导入] 引用的文件缺失：${path}`)
    return undefined
  }
  return uint8ToDataUrl(bytes, mimeFromPath(path))
}

interface ZipStats {
  students: number
  teachers: number
  calligraphy: number
  badges: number
  fonts: number
  hasBadge: boolean
}

/** 解析 zip 备份文件；非法时抛出带中文信息的 Error */
export async function importCanvasZip(file: File): Promise<ImportedCanvasZip> {
  const t0 = performance.now()
  console.info(`[全量导入] 开始解析 ${file.name}（${Math.round(file.size / 1024)}KB）`)
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error('不是有效的 ZIP 文件')
  }
  const raw = readJson(entries, 'data.json')
  if (!raw || typeof raw !== 'object') throw new Error('备份文件内容不是画布数据')
  const p = raw as Record<string, unknown>

  if (p.format === FORMAT) {
    const result = importFullFormat(entries, p)
    console.info(
      `[全量导入] 解析完成（新格式）：学生 ${result.stats.students}、老师 ${result.stats.teachers}、` +
        `毛笔字 ${result.stats.calligraphy}、自定义校徽 ${result.stats.badges}、字体 ${result.stats.fonts}，` +
        `耗时 ${Math.round(performance.now() - t0)}ms`,
    )
    return result
  }

  // 兼容 v1.19.x 旧格式：data.json 直接是 MapData 配置（无 format 字段）
  if (Array.isArray(p.students) && Array.isArray(p.teachers)) {
    const result = importLegacyFormat(entries, p)
    console.info(
      `[全量导入] 解析完成（旧格式 v1.19）：学生 ${result.stats.students}、老师 ${result.stats.teachers}，` +
        `耗时 ${Math.round(performance.now() - t0)}ms`,
    )
    return result
  }

  throw new Error('这不是蹭饭图生成器导出的备份文件（format 标识不符）')
}

/** 新格式（cenfan-map-canvas-full v1）：按 data.json 中的路径引用还原资源 */
function importFullFormat(
  entries: Record<string, Uint8Array>,
  p: Record<string, unknown>,
): ImportedCanvasZip {
  const data = p.data as MapData | undefined
  if (!data || typeof data !== 'object') throw new Error('备份文件缺少名单数据（data 字段）')

  // 毛笔字：路径 → dataURL
  const calligraphy: MapData['calligraphy'] = {}
  for (const [university, meta] of Object.entries(data.calligraphy ?? {})) {
    const m = meta as { w: number; h: number; scale: number; image?: string }
    calligraphy[university] = {
      dataUrl: restoreDataUrl(entries, m.image) ?? '',
      w: m.w,
      h: m.h,
      scale: m.scale,
    }
  }

  // 自定义校徽
  const badgeOverrides: MapData['badgeOverrides'] = {}
  for (const [studentId, meta] of Object.entries(data.badgeOverrides ?? {})) {
    const m = meta as { hidden?: boolean; image?: string }
    badgeOverrides[studentId] = {
      hidden: m.hidden,
      dataUrl: restoreDataUrl(entries, m.image),
    }
  }

  // 班徽
  const badge = restoreDataUrl(entries, p.badge) ?? null

  // 自定义字体
  const customFonts: CustomFont[] = []
  if (Array.isArray(p.customFonts)) {
    for (const f of p.customFonts) {
      const meta = f as { id?: unknown; name?: unknown; file?: unknown }
      if (typeof meta?.id !== 'string' || typeof meta?.name !== 'string') continue
      const dataUrl = restoreDataUrl(entries, meta.file)
      if (dataUrl) customFonts.push({ id: meta.id, name: meta.name, dataUrl })
    }
  }

  const stats: ZipStats = {
    students: Array.isArray(data.students) ? data.students.length : 0,
    teachers: Array.isArray(data.teachers) ? data.teachers.length : 0,
    calligraphy: Object.values(calligraphy).filter((c) => c.dataUrl !== '').length,
    badges: Object.values(badgeOverrides).filter((b) => b.dataUrl).length,
    fonts: customFonts.length,
    hasBadge: badge !== null,
  }

  return {
    payload: {
      name: typeof p.name === 'string' ? p.name : '',
      data: { ...data, calligraphy, badgeOverrides },
      theme: p.theme,
      fontSlots: p.fontSlots,
      badge,
    },
    customFonts,
    stats,
  }
}

/** 旧格式（v1.19.x）：data.json 是纯 MapData 配置，文件名按 sanitize 约定推导 */
function importLegacyFormat(
  entries: Record<string, Uint8Array>,
  p: Record<string, unknown>,
): ImportedCanvasZip {
  const data = p as unknown as MapData

  const calligraphy: MapData['calligraphy'] = {}
  for (const [university, meta] of Object.entries(data.calligraphy ?? {})) {
    const m = meta as { w: number; h: number; scale: number }
    // 旧版固定 png 扩展名、文件名为 sanitize 后的大学名
    const dataUrl = restoreDataUrl(
      entries,
      `images/calligraphy/${sanitizeFilename(university)}.png`,
    )
    calligraphy[university] = { dataUrl: dataUrl ?? '', w: m.w, h: m.h, scale: m.scale }
  }

  const badgeOverrides: MapData['badgeOverrides'] = {}
  for (const [studentId, meta] of Object.entries(data.badgeOverrides ?? {})) {
    const m = meta as { hidden?: boolean }
    const dataUrl = restoreDataUrl(entries, `images/badges/${sanitizeFilename(studentId)}.png`)
    badgeOverrides[studentId] = { hidden: m.hidden, dataUrl }
  }

  const stats: ZipStats = {
    students: Array.isArray(data.students) ? data.students.length : 0,
    teachers: Array.isArray(data.teachers) ? data.teachers.length : 0,
    calligraphy: Object.values(calligraphy).filter((c) => c.dataUrl !== '').length,
    badges: Object.values(badgeOverrides).filter((b) => b.dataUrl).length,
    fonts: 0,
    hasBadge: false,
  }

  return {
    payload: {
      name: data.title?.trim() || '',
      data: { ...data, calligraphy, badgeOverrides },
      theme: undefined,
      fontSlots: undefined,
      badge: null,
    },
    customFonts: [],
    stats,
  }
}
