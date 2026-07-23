import { Link } from 'react-router'
import { Globe, MapPin, Sparkles } from 'lucide-react'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'

const changelog = [
  {
    version: 'v1.16.4',
    date: '2026-07-23',
    items: [
      '老师块向上拖后画布自动收缩：块底下方的死空白被自动吃掉，块始终距画布底部 48px；预留区耗尽后块才会进入地图区域',
      '画布收缩与拖动完全同步：向上拖的过程中画布就实时变矮，不等松手',
      '老师块底部预留区按实际内容计算：1 位老师时预留从 174px 收紧到约 125px，底部不再有多余空当',
    ],
  },
  {
    version: 'v1.16.3',
    date: '2026-07-23',
    items: [
      '自定义位置改为「从当前状态开始」：点「自定义」时卡片停在当前布局的位置上，不再跳回之前自定义过的旧位置',
      '切换一列 / 两列会重置自定义状态：省份卡片与老师块的手动位置同时清空，回到纯净的自动布局；再进自定义或重新拖动都从眼前这一刻的排版开始',
    ],
  },
  {
    version: 'v1.16.2',
    date: '2026-07-23',
    items: [
      '老师卡片与画布联动更像省份卡片：向下拖到接近页脚边界时画布才开始扩充，往回拖画布立即跟着缩小，不再在底部留下大段空白',
      '画布高度与拖动完全同步：拖动过程中（不等松手）画布就实时伸缩，老师卡片始终完整可见',
      '学生名单外部只预览前 5 位：名单再长也不会把录入页拉得很长；完整名单点任意一行或「还有 N 人 · 打开录入面板查看全部」在录入面板中查看与编辑',
    ],
  },
  {
    version: 'v1.16.1',
    date: '2026-07-23',
    items: [
      '省份卡片宽度贴合内容：每行一人完整显示「姓名 大学 · 城市」，长校名（如「中国石油大学（北京）」「哈尔滨工业大学（威海）」）与地名不再被折成两行，卡片宽度随内容自动界定',
      '推荐字号不再反复：修复「点完推荐还有推荐」的循环问题，一次应用即收敛；姓名、校名、城市统一为同一推荐字号（省份名标题略大），更整齐好看',
      '老师名单块拖动画布联动：向下拖出画布底部时画布自动加高，拖回则缩回原高；横向拖动限幅在画布内，不会把地图拉变形',
    ],
  },
  {
    version: 'v1.16.0',
    date: '2026-07-23',
    items: [
      '老师名单块可自由拖动：电脑端直接按住拖动，移动端先点选中再拖；限幅不离开画布主体，「重置位置/自动排布」可一并复位',
      '自定义位置新增「自动排布」按钮：一键清除全部手动偏移，回到整齐的自动布局',
      '引线更聪明：连接线接在卡片上离省份最近的那个位置（上/下/左/右缘自适应），不再固定接左/右缘',
      '导出下载修复：改用 Blob 下载，彻底解决大图在浏览器下载管理器卡 0 B/s（需重启浏览器）的问题；SVG 序列化与位图渲染增加超时兜底',
      '「在其他设备上继续此工作」链接有效期 1 天：一天内打开可把画布导入为自己的新画布，过期链接有明确提示',
      '字体按需下载再省流量：每个字体按字符区间分片（拉丁/常用汉字区/次常用区），浏览器只下载页面用到的区间；未选用的备选字体完全不下载',
      '推荐字号更克制：空间富余时推荐值收敛在 16–19px，不再推荐过大字号',
      '版权信息更新为「赤峰二中2026届&海南大学人工智能2026级张同学」',
    ],
  },
]

const features = [
  '手动录入学生、老师名单及去向城市，实时联动中国地图',
  '支持下载 Excel 模板批量填写、一键导入（解析过程在控制台可见）',
  '地图可视化展示蹭饭分布，全国地级市精确定位，城市聚合标注',
  '每行标注为「姓名 大学 · 城市」，校名前自动展示校徽（已收录 870+ 所院校）',
  '支持境外同学：省份选「海外 / 境外」后不指向地图，单独列入海外区块并标注国家/地区',
  '省内默认按软科中国大学排名排序，录入弹窗按省份分组、组内可拖动改为手动顺序',
  '大标题字体/字号/数字字体自由搭配，省份名/姓名/城市大学的字体与字号可分别调整',
  '省份名单块可直接拖动微调位置（移动端先点选中再拖），卡片颜色/透明度/羽化/圆角均可自定义',
  '画布主题一键切换（含卡通、水墨等风格），支持上传校徽/班徽与自定义字体',
  '多画布管理：可新建、复制、重命名多张蹭饭图，随时切换编辑',
  '一键导出超清蹭饭图图片（≥4000px 宽，与页面所见一致），方便班级群分享',
  '数据可导出为 JSON / Excel 备份或迁移，也可生成分享链接（数据编码在网址里、不经过服务器，对方打开可先预览再加载为自己的画布）',
  '数据自动保存在本机浏览器，刷新不丢失',
]

export default function AboutPage() {
  return (
    <StaticPageLayout title="关于蹭饭图生成器">
      <p className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-white/70 p-4 text-stone-600">
        <Sparkles className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
        <span>
          毕业季的仪式感：把全班同学、老师的去向画在一张中国地图上，
          以后走到哪座城市，都有人可以「蹭饭」。
        </span>
      </p>

      <section className="space-y-2">
        <SectionTitle>基本信息</SectionTitle>
        <div className="flex items-center gap-3 rounded-xl border border-stone-200/80 bg-white/70 p-3">
          <img
            src="/images/lingben-logo.png"
            alt="零本"
            className="h-12 w-12 shrink-0 rounded-lg"
          />
          <div className="text-sm">
            <p className="font-medium text-stone-700">《零本》出品</p>
            <p className="text-stone-400">一个高中生的小工具箱，慢慢打磨，持续更新。</p>
          </div>
        </div>
        <dl className="grid grid-cols-[5.5rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-stone-400">软件名称</dt>
          <dd className="text-stone-700">蹭饭图生成器</dd>
          <dt className="text-stone-400">开发者</dt>
          <dd className="text-stone-700">赤峰二中2026届&海南大学人工智能2026级张同学</dd>
          <dt className="text-stone-400">公众号</dt>
          <dd className="text-stone-700">《零本》</dd>
          <dt className="text-stone-400">联系方式</dt>
          <dd>
            <a
              href="mailto:linkbrain@lingben.top"
              className="text-amber-700 underline-offset-2 hover:underline"
            >
              linkbrain@lingben.top
            </a>
          </dd>
          <dt className="text-stone-400">当前版本</dt>
          <dd className="text-stone-700">v1.16.4</dd>
          <dt className="text-stone-400">访问网址</dt>
          <dd>
            <a
              href="https://map.linkbrain.top"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-amber-700 underline-offset-2 hover:underline"
            >
              <Globe className="h-3.5 w-3.5" />
              map.linkbrain.top
            </a>
          </dd>
        </dl>
      </section>

      <section className="space-y-2">
        <SectionTitle>功能列表</SectionTitle>
        <ul className="space-y-1.5">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <MapPin className="mt-1.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <SectionTitle>地图数据来源与合规声明</SectionTitle>
        <p>
          本应用使用的中国地图轮廓数据来源于<strong>阿里云 DataV.GeoAtlas</strong>
          （公开 GeoJSON 数据，区域 adcode 以中华人民共和国民政部行政区划代码为准），
          城市定位点坐标来源于同一数据集的行政区划中心点。
        </p>
        <p>
          本地图为<strong>示意地图</strong>，仅用于毕业去向信息展示，
          <strong>不作为行政区划界线勘定依据</strong>；城市定位点为行政区几何中心近似值，
          仅用于标注示意，不代表高校实际校址。国家版图示意图已包含南海诸岛及断续线，
          使用时请保持地图完整。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>院校数据来源声明</SectionTitle>
        <p>
          院校排序参考<strong>软科中国大学排名（2025 主榜）</strong>公开榜单，
          仅用于名单展示顺序，不构成对任何院校的评价；未上榜院校按录入顺序排在其后，
          用户可在录入弹窗中随时拖动改为手动顺序。
        </p>
        <p>
          校徽图片来源于<strong>优融达（urongda.com）</strong>公开校徽资源平台，
          经本站服务器代理加载，仅用于标识院校；校徽著作权归各院校所有，
          如院校或权利方认为使用不当，请联系我们移除。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>技术栈</SectionTitle>
        <p>
          本应用为纯前端单页应用，基于 React 19 + TypeScript + Vite 构建，
          界面采用 Tailwind CSS 与 shadcn/ui 组件库，路由使用 React Router 7，
          Excel 导入导出基于 SheetJS（xlsx）在浏览器本地完成，图片导出基于 html-to-image。
          名单数据仅存储于浏览器 localStorage；站点部署于 Cloudflare Pages，
          辅以少量 Pages Functions 接口提供地图辅助数据、可选的微信分享签名，
          以及「分享为链接」的短链接存取（Cloudflare KV，7 天到期自动删除）。
        </p>
      </section>

      <section className="space-y-3">
        <SectionTitle>更新日志</SectionTitle>
        <ol className="space-y-4">
          {/* 只保留最近 5 个版本，更早的更新记录引导至 GitHub 提交历史 */}
          {changelog.slice(0, 5).map((release) => (
            <li key={release.version}>
              <p className="flex items-baseline gap-2 text-sm">
                <span className="font-semibold text-stone-700">{release.version}</span>
                <span className="text-xs text-stone-400">{release.date}</span>
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-stone-600">
                {release.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="text-xs text-stone-400">
          更早的更新记录请移步{' '}
          <a
            href="https://github.com/RainyDreams/map-creator/commits"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 transition-colors hover:text-amber-700 hover:underline"
          >
            GitHub 提交历史
          </a>{' '}
          查看。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>备案信息</SectionTitle>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone-500 underline-offset-2 transition-colors hover:text-amber-700 hover:underline"
          >
            京ICP备2026037786号-1
          </a>
          <a
            href="https://beian.mps.gov.cn/#/query/webSearch?code=15040202200109"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-stone-500 underline-offset-2 transition-colors hover:text-amber-700 hover:underline"
          >
            <img src="/images/beian-icon.png" alt="" className="h-3.5 w-3.5" />
            蒙公网安备15040202200109号
          </a>
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>相关链接</SectionTitle>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/agreement" className="text-amber-700 underline-offset-2 hover:underline">
            用户协议
          </Link>
          <Link to="/privacy" className="text-amber-700 underline-offset-2 hover:underline">
            隐私政策
          </Link>
        </p>
      </section>
    </StaticPageLayout>
  )
}
