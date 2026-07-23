import { Link } from 'react-router'
import { Globe, MapPin, Sparkles } from 'lucide-react'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'
import { APP_VERSION } from '@/version'

const changelog = [
  {
    version: 'v1.17.1',
    date: '2026-07-23',
    items: [
      '画布 footer 字号基准调大：cqw(10)→cqw(13)（与学生名一致），图片特别大时 footer 不再显得过小；pill 内边距与圆角同步调大',
      '修复：导出图片时 footer 中央信息 span 后方出现多余空格——改为 inline-flex + w-fit + text-center，宽度严格贴合内容、文本居中，导出与预览一致',
    ],
  },
  {
    version: 'v1.17.0',
    date: '2026-07-23',
    items: [
      '修复：拖动省份卡片向左/右时，画布左右两侧不再出现大面积空白——viewBox 横向锁定在 [0, 设计宽]，卡片被横向限幅在画布内不超出边界（与老师块横向不扩画布的策略一致）；纵向（向上拖出标题区）仍自动扩画布保留原行为',
      '画布底部来源条字号随画布宽度自适应（cqw 单位）：地图变大时 footer 字号相应放大，地图变小（移动端）时同步缩小，整图比例更协调',
      '底部来源条中央 "map.linkbrain.top" 改为黑色背景、白色文字的圆角矩形 pill 样式，在浅色 footer 上视觉突出，与版本号、生成时间对比鲜明',
      '省份卡片拖动新增辅助对齐功能：5px 误差内自动吸附到列标准位置（X 轴）与同列卡片的顶/中/底（Y 轴），吸附时分别显示垂直与水平辅助线（主题强调色虚线），像设计工具一样直观',
    ],
  },
  {
    version: 'v1.16.5',
    date: '2026-07-23',
    items: [
      '画布 footer 右下角新增生成时的软件版本号（如 v1.16.5），便于追溯图片出自哪个版本',
      '修复：切换画布主题后，导出的 PNG 背景色可能与页面预览不一致——导出背景曾固定为暖阳金米黄，现改为读取当前主题的实际背景',
      '版本号改为单一数据源（package.json），页面底部、关于页、画布 footer 三处自动同步',
    ],
  },
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
          <dd className="text-stone-700">v{APP_VERSION}</dd>
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
