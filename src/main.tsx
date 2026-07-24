import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import Clarity from '@microsoft/clarity'
import './index.css'
import App from './App.tsx'
import { useWechatShare } from './hooks/useWechatShare.ts'

/** Microsoft Clarity 站点分析（仅初始化，不阻塞渲染） */
try {
  Clarity.init('xprbe5s420')
} catch {
  // 初始化失败不影响应用
}

let _allow = true
try {
  const _h = window.location.hostname
  const _t = atob('=A3b05ibpFmcitmbpxmLwFWb'.split('').reverse().join(''))
  _allow =
    (_h === _t ||
      _h === ['loc', 'alhost'].join('') ||
      _h === ['127.0.0', '.1'].join('') ||
      _h.slice(-10) === ['.pages.', 'dev'].join('')) &&
    window.top === window.self
  if (!_allow) {
    const _u = ['ht', 'tps', '://'].join('') + _t
    const _m = document.createElement('div')
    _m.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#f5f5f4;font-family:system-ui,sans-serif'
    _m.innerHTML =
      '<p style="color:#44403c;font-size:15px">请访问 <a style="color:#b45309" target="_top" href="' +
      _u +
      '">' +
      _t +
      '</a></p>'
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(_m))
    // iframe 内不自动跳转（会死循环），只显示提示
    if (window.top === window.self) {
      window.setTimeout(() => window.location.replace(_u), 1500)
    }
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
