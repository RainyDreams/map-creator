import './polyfills.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import Clarity from '@microsoft/clarity'
import { getUserId } from '@/utils/userId'
import './index.css'
import App from './App.tsx'
import { useWechatShare } from './hooks/useWechatShare.ts'
import { initErrorReporter } from './utils/errorReporter.ts'
import { initSessionLog } from './utils/sessionLog.ts'
import { checkEnvironment } from './utils/guard.ts'

// 启动标记：index.html 的镜像兜底加载器据此判断入口是否成功执行；
// 主站与镜像入口并发成功时，后到的实例直接放弃，避免双挂载
const _boot = window as unknown as { __CF_APP_BOOTED__?: boolean }
if (_boot.__CF_APP_BOOTED__) {
  throw new Error('[boot] duplicate entry ignored')
}
_boot.__CF_APP_BOOTED__ = true

/** 控制台彩蛋：首次打开控制台的用户能看到（本机记忆，只出现一次） */
try {
  if (localStorage.getItem('cenfan-console-hi') !== '1') {
    localStorage.setItem('cenfan-console-hi', '1')
    console.log(
      '%c恭喜你发现了宝藏网站',
      'font-size:18px;font-weight:700;color:#d97706;line-height:2',
    )
    console.log(
      '%c蹭饭图生成器 · 毕业班蹭饭图在线制作，数据只保存在你自己的浏览器里',
      'font-size:12px;color:#78716c',
    )
  }
} catch {
  // 存储不可用时静默
}

/**
 * Clarity 脚本自身偶发内部异常（如 unhandledrejection: reading 'sequence'，
 * 最新版 1.0.2 仍存在，无法靠升级修）。它不是应用错误：
 * - 就地 preventDefault，不在用户控制台刷「Uncaught (in promise)」；
 * - errorReporter / sessionLog 里也按 clarity 来源过滤，不占上报额度、不污染使用日志。
 * 必须在 Clarity.init 之前注册。
 */
window.addEventListener('unhandledrejection', (ev) => {
  const reason = (ev as PromiseRejectionEvent).reason
  const stack = reason instanceof Error ? (reason.stack ?? '') : ''
  if (stack.includes('clarity')) ev.preventDefault()
})

/** Microsoft Clarity 站点分析（仅初始化，不阻塞渲染） */
try {
  Clarity.init('xprbe5s420')
  // 启动即上报我们自己的持久用户 ID：反馈昵称（用户XXXXXXX）= Clarity Custom user ID，
  // 管理员看到任何反馈/日志后，可直接按该 ID 在 Clarity 检索全部会话录屏
  Clarity.identify(getUserId())
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

const _allow = checkEnvironment()

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
