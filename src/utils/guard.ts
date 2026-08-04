/**
 * 运行环境自检（启动时执行；同源校验逻辑在多处独立实现，此处为入口自检）。
 * 关键字符串全部编码存储，不在源码与产物中暴露可读意图。
 */

const _s = (a: number[]): string => String.fromCharCode(...a.map((v) => v ^ 29))

const _A = _s([112, 124, 109, 51, 113, 116, 115, 118, 127, 111, 124, 116, 115, 51, 105, 114, 109])
const _B = _s([113, 114, 126, 124, 113, 117, 114, 110, 105])
const _C = _s([44, 47, 42, 51, 45, 51, 45, 51, 44])
const _D = _s([51, 126, 120, 115, 122, 123, 124, 115, 48, 112, 124, 109, 51, 109, 124, 122, 120, 110, 51, 121, 120, 107])
const _E2 = _s([51, 113, 116, 115, 118, 127, 111, 124, 116, 115, 51, 105, 114, 109])
const _E = _s([117, 105, 105, 109, 110, 39, 50, 50])
const _F = _s([24757, 24398, 21072, 35746, 38387, 30361, 24171, 38723, 27518, 29269, 36464, 39280, 22243, 29954, 25101, 22133])
const _G = _s([27518, 29269, 32588, 22365, 65287])
const _H = _s([27518, 22325, 20007, 24757, 33271, 21173, 36334, 36721, 8251])

export function checkEnvironment(): boolean {
  try {
    const h = window.location.hostname
    const ok =
      (h === _A || h === _B || h === _C || h.slice(-22) === _D || h.slice(-14) === _E2) &&
      window.top === window.self
    if (ok) return true
    const url = _E + _A
    const show = () => {
      const m = document.createElement('div')
      m.style.cssText =
        'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f5f5f4;font-family:system-ui,sans-serif'
      m.innerHTML =
        '<div style="text-align:center;padding:24px"><p style="color:#78716c;font-size:13px;margin:0 0 8px">' +
        _F +
        '</p><p style="color:#44403c;font-size:17px;font-weight:600;margin:0 0 6px">' +
        _G +
        '<a style="color:#b45309" target="_top" href="' +
        url +
        '">' +
        _A +
        '</a></p><p style="color:#a8a29e;font-size:12px;margin:0">' +
        _H +
        '</p></div>'
      document.body.appendChild(m)
    }
    if (document.body) show()
    else document.addEventListener('DOMContentLoaded', show)
    window.setTimeout(() => {
      try {
        window.top!.location.replace(url)
      } catch {
        window.location.replace(url)
      }
    }, 1500)
    return false
  } catch {
    return true
  }
}
