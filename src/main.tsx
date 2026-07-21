import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { useWechatShare } from './hooks/useWechatShare.ts'

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
