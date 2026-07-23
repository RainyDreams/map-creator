/**
 * 全量导出：将蹭饭图所有数据打包成 zip 文件，包括：
 * 1. 配置数据（JSON）
 * 2. 毛笔字图片（calligraphy）
 * 3. 自定义校徽图片（badges）
 * 4. 导出的高清地图图片（PNG）
 */

import { zip } from 'fflate'
import type { MapData, CalligraphyAsset, StudentBadge } from '@/types'
import { renderNodeToPngDataUrl, type ExportProgressFn, type ExportQuality } from './exportImage'

/** 导出进度阶段定义 */
const ZIP_STAGES = {
  PREPARE: '正在准备导出数据…',
  RENDER_MAP: '正在渲染地图图片…',
  COLLECT_IMAGES: '正在收集图片资源…',
  CREATE_ZIP: '正在打包 zip 文件…',
  DOWNLOAD: '正在下载文件…',
  DONE: '导出完成',
} as const

/** 清理文件名中的非法字符 */
function sanitizeFilename(s: string): string {
  return s.trim().replace(/[\\/:*?"<>|\s]+/g, '-')
}

/** 将 dataURL 转换为 Uint8Array */
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

/** 将 MapData 中的图片部分提取出来，返回纯数据和图片映射 */
function extractImageData(data: MapData) {
  // 1. 毛笔字图片
  const calligraphyImages: Record<string, Uint8Array> = {}
  for (const [university, asset] of Object.entries(data.calligraphy)) {
    if (asset.dataUrl) {
      const safeName = sanitizeFilename(university)
      calligraphyImages[`${safeName}.png`] = dataUrlToUint8Array(asset.dataUrl)
    }
  }

  // 2. 自定义校徽图片
  const badgeImages: Record<string, Uint8Array> = {}
  for (const [studentId, badge] of Object.entries(data.badgeOverrides)) {
    if (badge.dataUrl) {
      badgeImages[`${studentId}.png`] = dataUrlToUint8Array(badge.dataUrl)
    }
  }

  // 3. 创建不含图片数据的配置副本
  const configData: Omit<MapData, 'calligraphy' | 'badgeOverrides'> & {
    calligraphy: Record<string, Omit<CalligraphyAsset, 'dataUrl'>>
    badgeOverrides: Record<string, Omit<StudentBadge, 'dataUrl'>>
  } = {
    ...data,
    calligraphy: Object.fromEntries(
      Object.entries(data.calligraphy).map(([key, asset]) => [
        key,
        { w: asset.w, h: asset.h, scale: asset.scale },
      ])
    ),
    badgeOverrides: Object.fromEntries(
      Object.entries(data.badgeOverrides).map(([key, badge]) => [
        key,
        { hidden: badge.hidden },
      ])
    ),
  }

  return {
    configData,
    calligraphyImages,
    badgeImages,
  }
}

/**
 * 全量导出为 zip 文件
 * @param node 画布 DOM 节点（用于渲染 PNG）
 * @param data 完整的 MapData
 * @param title 文件名标题
 * @param quality PNG 清晰度
 * @param onProgress 进度回调
 * @param signal 取消信号
 */
export async function exportToZip(
  node: HTMLElement,
  data: MapData,
  title: string,
  quality: ExportQuality = 'ultra',
  onProgress?: ExportProgressFn,
  signal?: AbortSignal,
): Promise<void> {
  const t0 = performance.now()
  console.info('[全量导出] 开始全量导出')

  // 阶段 1: 准备数据
  onProgress?.(5, ZIP_STAGES.PREPARE)
  const { configData, calligraphyImages, badgeImages } = extractImageData(data)
  console.info(`[全量导出] 数据准备完成，毛笔字 ${Object.keys(calligraphyImages).length} 张，校徽 ${Object.keys(badgeImages).length} 张`)

  // 检查取消
  if (signal?.aborted) throw new Error('导出已取消')

  // 阶段 2: 渲染地图图片
  onProgress?.(15, ZIP_STAGES.RENDER_MAP)
  const mapResult = await renderNodeToPngDataUrl(
    node,
    quality,
    (pct, stage) => {
      // 将渲染进度映射到 15-65 区间
      const mappedPct = 15 + (pct / 100) * 50
      onProgress?.(mappedPct, stage)
    },
    signal,
  )
  console.info(`[全量导出] 地图渲染完成，${mapResult.width}×${mapResult.height}`)

  // 检查取消
  if (signal?.aborted) throw new Error('导出已取消')

  // 阶段 3: 收集图片资源
  onProgress?.(70, ZIP_STAGES.COLLECT_IMAGES)
  const mapImageData = dataUrlToUint8Array(mapResult.dataUrl)
  console.info(`[全量导出] 地图图片 ${Math.round(mapImageData.length / 1024)}KB`)

  // 阶段 4: 创建 zip 文件
  onProgress?.(80, ZIP_STAGES.CREATE_ZIP)

  // 构建 zip 文件结构
  const zipFiles: Record<string, Uint8Array> = {}

  // 1. 配置文件
  const configJson = JSON.stringify(configData, null, 2)
  zipFiles['data.json'] = new TextEncoder().encode(configJson)

  // 2. 地图图片
  zipFiles['map.png'] = mapImageData

  // 3. 毛笔字图片
  for (const [filename, imageData] of Object.entries(calligraphyImages)) {
    zipFiles[`images/calligraphy/${filename}`] = imageData
  }

  // 4. 校徽图片
  for (const [filename, imageData] of Object.entries(badgeImages)) {
    zipFiles[`images/badges/${filename}`] = imageData
  }

  // 使用 fflate 创建 zip
  const zipData = await new Promise<Uint8Array>((resolve, reject) => {
    zip(zipFiles, { level: 6 }, (err, data) => {
      if (err) {
        reject(new Error(`创建 zip 失败: ${err.message}`))
      } else {
        resolve(data)
      }
    })
  })

  console.info(`[全量导出] zip 创建完成，${Math.round(zipData.length / 1024)}KB`)

  // 检查取消
  if (signal?.aborted) throw new Error('导出已取消')

  // 阶段 5: 下载文件
  onProgress?.(95, ZIP_STAGES.DOWNLOAD)
  // 使用 Blob 构造函数，它应该能接受 Uint8Array
  const blob = new Blob([zipData as BlobPart], { type: 'application/zip' })
  const blobUrl = URL.createObjectURL(blob)

  const baseName = sanitizeFilename(title) || '蹭饭图'
  const filename = `${baseName}-全量导出.zip`

  try {
    const a = document.createElement('a')
    a.download = filename
    a.href = blobUrl
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    // 延迟回收 blob URL
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }

  console.info(`[全量导出] 已触发下载: ${filename}`)
  console.info(`[全量导出] 总耗时: ${Math.round(performance.now() - t0)}ms`)
  onProgress?.(100, ZIP_STAGES.DONE)
}
