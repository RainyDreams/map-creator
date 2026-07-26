/**
 * 设备形态检测：判断当前是否移动设备（手机 / 平板）。
 * 用于导出完成后的「图片预览 + 保存」弹窗——移动端文件下载体验差，
 * 统一改为弹窗内预览 + 显式下载按钮（微信则引导长按保存）。
 */

/** 当前是否移动设备（手机或 iPad 等平板） */
export function isMobileOrPad(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  // 触优先：手机与平板的指针都是 coarse
  if (window.matchMedia('(pointer: coarse)').matches) return true
  // iPadOS 桌面模式：UA 伪装成 Macintosh，用触点数识别
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  // UA 兜底（部分安卓平板桌面模式）
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}
