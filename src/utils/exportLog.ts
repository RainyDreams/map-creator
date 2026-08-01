/**
 * 导出进程日志总线：喂给导出模态框里的「CMD 终端窗」实时展示。
 *
 * 双轨日志设计：
 * - 给用户看的行（简略、可读）走本总线 → 终端窗；
 * - 给开发者排查的详细行走 console（sessionLog 捕获，随反馈上传）。
 *
 * 与 exportImage 解耦：exportImage 是动态 chunk（含 html-to-image），
 * 本模块保持微型无依赖，MapPage 静态引入不会把渲染引擎拉进主包。
 */

export interface ExportLogLine {
  /** 相对本次导出开始的秒数 */
  at: number
  text: string
}

/** 环形上限：长导出刷屏时丢弃最旧行，终端只保留最近 120 行 */
const MAX_LINES = 120

let lines: ExportLogLine[] = []
let startTs = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

/** 每次导出开始时清空（在渲染入口调用） */
export function resetExportLog(): void {
  startTs = performance.now()
  lines = []
  emit()
}

/** 追加一行用户可读日志；时间戳自动取相对导出开始的秒数 */
export function pushExportLog(text: string): void {
  if (!startTs) startTs = performance.now()
  const at = (performance.now() - startTs) / 1000
  lines = [...lines.slice(-(MAX_LINES - 1)), { at, text }]
  emit()
}

export function subscribeExportLog(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** useSyncExternalStore 快照：必须返回稳定引用（只在追加时换数组） */
export function getExportLogSnapshot(): ExportLogLine[] {
  return lines
}
