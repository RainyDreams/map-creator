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

/** 微信分享配置挂载点（不渲染任何内容；失败一律静默降级） */
function WechatShareInit() {
  useWechatShare()
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <WechatShareInit />
      <App />
    </BrowserRouter>
  </StrictMode>,
)
