import { Link } from 'react-router'

/**
 * 全站页脚：版权 + 开发者 + 版本 + 备案信息 + 站点页面链接。
 * 小字居中，中性灰色系，不抢占地图画布空间。
 */
export default function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="shrink-0 border-t border-stone-200 bg-stone-50 px-3 py-2.5 text-center text-[11px] leading-5 text-stone-400">
      <p>
        © {year} 赤峰二中2026届zxy · 蹭饭图生成器 v1.8.0
      </p>
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
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
        <Link to="/agreement" className="transition-colors hover:text-stone-700">
          用户协议
        </Link>
        <span aria-hidden className="text-stone-300">·</span>
        <Link to="/privacy" className="transition-colors hover:text-stone-700">
          隐私政策
        </Link>
        <span aria-hidden className="text-stone-300">·</span>
        <Link to="/about" className="transition-colors hover:text-stone-700">
          关于
        </Link>
      </p>
    </footer>
  )
}
