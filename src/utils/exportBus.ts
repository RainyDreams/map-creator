/**
 * 「预览并导出为图片」跨组件信号总线：
 * 录入页（DataToolbar）点击导出图片 → 外层 Creator 切到地图 Tab →
 * 地图页挂载后消费这个请求并自动开始导出。
 *
 * 移动端 Tab 切换会卸载/重挂 MapPage，所以用「一次性标记 + 事件」：
 * requestMapExport() 先落标记再发事件；MapPage 挂载时消费标记。
 */

const EVENT = 'cenfan:goto-map-export'
let pending = false

/** 请求切到地图 Tab 并自动导出（录入页导出面板调用） */
export function requestMapExport(): void {
  pending = true
  window.dispatchEvent(new CustomEvent(EVENT))
}

/** 监听切 Tab 请求（Creator 外壳调用） */
export function onGotoMapExport(listener: () => void): () => void {
  const handler = () => listener()
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}

/** 地图页挂载时消费一次性导出请求；有请求返回 true 并清除 */
export function consumeMapExportRequest(): boolean {
  const had = pending
  pending = false
  return had
}
