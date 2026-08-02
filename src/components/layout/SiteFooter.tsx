import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { AppLink } from '@/components/layout/RouteLoadingOverlay'
import { APP_VERSION } from '@/version'
import { checkNewReplies, REPLY_EVENT } from '@/utils/replyNotify'

/** 「问题反馈」红点引导标记：未点击过时显示，点击或进入反馈页后消失；此后若我的反馈被回复会再次出现（本机记忆） */
const FEEDBACK_SEEN_KEY = 'cenfan-feedback-seen'

function loadFeedbackSeen(): boolean {
  try {
    return localStorage.getItem(FEEDBACK_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 全站页脚：版权 + 开发者 + 版本 + 备案信息 + 站点页面链接。
 * 小字居中，中性灰色系，不抢占地图画布空间。
 * 备案信息仅在桌面端页脚展示；移动端（录入 Tab）不显示，统一在「关于」页面呈现。
 * 「微信公众号 · 零本」：悬浮（桌面）或点击（移动端）弹出搜一搜二维码卡片。
 */
export default function SiteFooter() {
  const year = new Date().getFullYear()
  const [qrOpen, setQrOpen] = useState(false)
  const [feedbackSeen, setFeedbackSeen] = useState<boolean>(loadFeedbackSeen)
  /** 我的反馈被管理员回复（未读）时也显示红点 */
  const [replyNotify, setReplyNotify] = useState(false)
  const { pathname } = useLocation()

  // 通过任何路径到达反馈页都视为已读，红点不再出现
  useEffect(() => {
    if (pathname === '/feedback' && !feedbackSeen) {
      setFeedbackSeen(true)
      try {
        localStorage.setItem(FEEDBACK_SEEN_KEY, '1')
      } catch {
        // 忽略
      }
    }
  }, [pathname, feedbackSeen])

  // 启动时 + 收到已读广播时，检查「我的反馈」是否有新回复
  useEffect(() => {
    let cancelled = false
    const run = (force: boolean) => {
      void checkNewReplies(force).then((v) => {
        if (!cancelled) setReplyNotify(v)
      })
    }
    run(false)
    const onEvent = () => run(false)
    window.addEventListener(REPLY_EVENT, onEvent)
    return () => {
      cancelled = true
      window.removeEventListener(REPLY_EVENT, onEvent)
    }
  }, [])

  const markFeedbackSeen = () => {
    setFeedbackSeen(true)
    try {
      localStorage.setItem(FEEDBACK_SEEN_KEY, '1')
    } catch {
      // 忽略
    }
  }

  return (
    <footer className="shrink-0 border-t border-stone-200 bg-stone-50 px-3 py-2.5 text-center text-[11px] leading-5 text-stone-400">
      <p>
        {/* 移动端窄屏：署名仅保留海南大学，不显示赤峰二中，避免一行挤不下 */}
        <span className="md:hidden">© {year} 海南大学人工智能2026级张同学</span>
        <span className="hidden md:inline">© {year} 赤峰二中2026届&amp;海南大学人工智能2026级张同学</span>
        {' '}· 蹭饭图生成器 v{APP_VERSION}
      </p>
      <p className="hidden flex-wrap items-center justify-center gap-x-2 gap-y-0.5 md:flex">
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-stone-700"
        >
          京ICP备2026037786号-1
        </a>
        <span aria-hidden className="text-stone-300">|</span>
        <a
          href="https://beian.mps.gov.cn/#/query/webSearch?code=15040202200109"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-stone-700"
        >
          <img src="/images/beian-icon.png" alt="" className="h-3 w-3" />
          蒙公网安备15040202200109号
        </a>
      </p>
      <p className="flex items-center justify-center gap-x-2">
        {/* 移动端已有「关于」Tab，用户协议/隐私政策/关于三个链接仅桌面端显示 */}
        <AppLink to="/agreement" className="hidden transition-colors hover:text-stone-700 md:inline">
          用户协议
        </AppLink>
        <span aria-hidden className="hidden text-stone-300 md:inline">·</span>
        <AppLink to="/privacy" className="hidden transition-colors hover:text-stone-700 md:inline">
          隐私政策
        </AppLink>
        <span aria-hidden className="hidden text-stone-300 md:inline">·</span>
        <AppLink to="/about" className="hidden transition-colors hover:text-stone-700 md:inline">
          关于
        </AppLink>
        <span aria-hidden className="hidden text-stone-300 md:inline">·</span>
        <AppLink
          to="/feedback"
          onClick={markFeedbackSeen}
          className="relative text-red-800 transition-colors hover:text-red-900 md:text-stone-400 md:hover:text-stone-700"
        >
          问题反馈
          {(!feedbackSeen || replyNotify) && (
            <span
              aria-hidden
              className="absolute -right-1 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500"
            />
          )}
        </AppLink>
        <span aria-hidden className="text-stone-300">·</span>
        {/* 公众号二维码：桌面悬浮展开、移动端点按展开；再次点击或移出即收起。
            桌面显示「微信公众号 · [零本图]」，移动端窄屏只显示零本图片 */}
        <span
          className="group relative"
          onMouseEnter={() => setQrOpen(true)}
          onMouseLeave={() => setQrOpen(false)}
        >
          <button
            type="button"
            onClick={() => setQrOpen((v) => !v)}
            aria-expanded={qrOpen}
            aria-label="查看微信公众号零本的二维码"
            className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-stone-700"
          >
            <span className="hidden md:inline">微信公众号 ·</span>
            <img src="/images/lingben-text.png" alt="零本" className="h-3 w-auto" draggable={false} />
          </button>
          {qrOpen && (
            <span
              className="absolute bottom-full left-1/2 z-50 mb-2 block w-64 -translate-x-1/2 rounded-xl border border-stone-200 bg-white p-3 shadow-lg"
              role="tooltip"
            >
              <img
                src="/images/qr-lingben-search.jpg"
                alt="微信搜一搜「零本」关注公众号"
                className="w-full rounded-lg"
              />
              <span className="mt-1.5 block text-center text-[10px] text-stone-400">
                微信扫码或搜一搜「零本」，关注公众号
              </span>
              {/* 小三角指向触发文字 */}
              <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-stone-200 bg-white" />
            </span>
          )}
        </span>
      </p>
    </footer>
  )
}
