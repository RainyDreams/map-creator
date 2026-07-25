import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import Clarity from '@microsoft/clarity'
import './index.css'
import App from './App.tsx'
import { useWechatShare } from './hooks/useWechatShare.ts'
import { initErrorReporter } from './utils/errorReporter.ts'
import { initSessionLog } from './utils/sessionLog.ts'

/** Microsoft Clarity 站点分析（仅初始化，不阻塞渲染） */
try {
  Clarity.init('xprbe5s420')
} catch {
  // 初始化失败不影响应用
}

/** JS 错误自动上报（匿名、仅生产环境；初始化失败静默） */
try {
  initErrorReporter()
} catch {
  // 不影响应用
}

/** 会话日志缓冲（仅内存；仅当用户在反馈表单主动勾选时才随反馈上传） */
try {
  initSessionLog()
} catch {
  // 不影响应用
}

let _allow = true
try {
  const _h = window.location.hostname
  const _t = atob('=A3b05ibpFmcitmbpxmLwFWb'.split('').reverse().join(''))
  _allow =
    (_h === _t ||
      _h === ['loc', 'alhost'].join('') ||
      _h === ['127.0.0', '.1'].join('') ||
      _h.slice(-22) === ['.cengfan', '-map.pages.', 'dev'].join('')) &&
    window.top === window.self
  if (!_allow) {
    const _u = ['ht', 'tps', '://'].join('') + _t
    const _m = document.createElement('div')
    _m.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f5f5f4;font-family:system-ui,sans-serif'
    _m.innerHTML =
      '<div style="text-align:center;padding:24px"><p style="color:#78716c;font-size:13px;margin:0 0 8px">您当前访问的并非正版蹭饭图生成器</p><p style="color:#44403c;font-size:17px;font-weight:600;margin:0 0 6px">正版网址：<a style="color:#b45309" target="_top" href="' +
      _u +
      '">' +
      _t +
      '</a></p><p style="color:#a8a29e;font-size:12px;margin:0">正在为您自动跳转…</p></div>'
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(_m))
    // 始终跳转顶层窗口：被 iframe 嵌套时直接把外层页面带往正版站（跳出嵌套，无死循环）
    window.setTimeout(() => {
      try {
        window.top!.location.replace(_u)
      } catch {
        window.location.replace(_u)
      }
    }, 1500)
  }
} catch {
  _allow = true
}

/** 微信分享配置挂载点（不渲染任何内容；失败一律静默降级） */
function WechatShareInit() {
  useWechatShare()
  return null
}

if (_allow) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <WechatShareInit />
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}
