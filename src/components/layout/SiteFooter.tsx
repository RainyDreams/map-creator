import { useState } from 'react'
import { AppLink } from '@/components/layout/RouteLoadingOverlay'
import { APP_VERSION } from '@/version'
import { openFeedbackJump } from '@/utils/feedbackJump'

/** 统一反馈平台入口由 openFeedbackJump() 弹窗接管（v2.0.3 起恢复「附带使用日志」选项） */

/**
 * 全站页脚：版权 + 开发者 + 版本 + 备案信息 + 站点页面链接。
 * 小字居中，中性灰色系，不抢占地图画布空间。
 * 备案信息仅在桌面端页脚展示；移动端（录入 Tab）不显示，统一在「关于」页面呈现。
 * 「微信公众号 · 零本」：悬浮（桌面）或点击（移动端）弹出搜一搜二维码卡片。
 */
export default function SiteFooter() {
  const year = new Date().getFullYear()
  const [qrOpen, setQrOpen] = useState(false)

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
        {/* 统一反馈平台：先弹跳转对话框（可选附带使用日志），再带参跳转；移动端暗红突出 */}
        <button
          type="button"
          onClick={openFeedbackJump}
          className="cursor-pointer text-red-800 transition-colors hover:text-red-900 md:text-stone-400 md:hover:text-stone-700"
        >
          问题反馈
        </button>
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
