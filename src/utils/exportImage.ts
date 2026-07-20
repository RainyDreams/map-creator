/**
 * 画布导出：用 html-to-image 把蹭饭图画布 DOM 序列化为高清 PNG 并触发浏览器下载。
 * pixelRatio 2.5 兼顾清晰度与文件体积；无外部图片，无跨域污染风险。
 */
import { toPng } from 'html-to-image'

function sanitize(s: string): string {
  return s.trim().replace(/[\\/:*?"<>|\s]+/g, '-')
}

/**
 * @param node 画布根元素
 * @param title 班级标题（用于文件名，可空）
 * @param year 届数/年份（用于文件名，可空）
 */
export async function exportNodeToPng(
  node: HTMLElement,
  title: string,
  year: string,
): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2.5,
    cacheBust: true,
    backgroundColor: '#faf0d7',
  })
  const parts = [sanitize(title), sanitize(year)].filter((p) => p !== '')
  const filename = `${parts.length > 0 ? parts.join('-') : '蹭饭图'}.png`
  const a = document.createElement('a')
  a.download = filename
  a.href = dataUrl
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
