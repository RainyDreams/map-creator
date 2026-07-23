import { Link } from 'react-router'
import { Globe, MapPin, Sparkles } from 'lucide-react'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'
import { APP_VERSION } from '@/version'

const changelog = [
  {
    version: 'v1.21.2',
    date: '2026-07-24',
    items: [
      '修复画布底部大片空白：自定义位置模式下，画布下缘不再沿用卡片的自动布局位置（卡片拖上去后原位仍把画布撑高），改为贴合地图与卡片的实际渲染位置——卡片拖上去，底部空白立即收紧',
      '老师名单块横向解除 ±300 固定限幅：现在可以在画布内自由左右移动（纵向已于上一版解除限制），配合画布边界自动伸缩，想放哪里放哪里',
    ],
  },
  {
    version: 'v1.21.1',
    date: '2026-07-24',
    items: [
      '修复老师名单块「向上拖不动、松手弹回原位」：旧版纵向拖动固定限幅 ±300，块已上拖入地图区后再往上拖会被误夹；改为按画布实际高度动态计算边界——向上可一直拖到画布顶，向下保留宽裕空间',
      '省份卡片对齐辅助线支持跨列：此前左列卡片只能对齐左列、右列只能对齐右列，现在拖动任意卡片都能与另一侧卡片的顶/中/底对齐并显示辅助线（横向对齐仍按同侧计算）',
    ],
  },
  {
    version: 'v1.21.0',
    date: '2026-07-24',
    items: [
      '新增「导出 ZIP（全量备份）」：把画布完完整整打包——名单、主题、字体槽位、每一个卡片的位置、班徽、用户上传的毛笔字图片、自定义校徽与自定义字体全部包含，一份文件即可完整备份',
      '新增「导入 ZIP」：上传 ZIP 备份后先预览摘要（名单人数与包含的资源），确认后作为新画布导入并自动切换，不覆盖现有画布；兼容读取 v1.19 旧版备份',
      '地图页「导出」按钮不再弹选项框：点击直接导出超清 PNG（≥4000px 宽），ZIP 备份统一收纳到录入页的导入/导出面板',
    ],
  },
  {
    version: 'v1.20.0',
    date: '2026-07-24',
    items: [
      '画布边界重构：随内容自动扩缩（双向）——卡片向外拖画布自动扩大，向里缩画布边界跟着向里缩，不再出现大片空白；左右边界各自贴合本侧内容，不以地图中心强制对称；边界与最外侧卡片始终保留 18px 呼吸距离',
      '取消卡片横向限幅：卡片可以自由拖到任何位置，画布始终贴着内容走',
      '拖动对齐升级：横轴也能与同列卡片的左缘/中线/右缘对齐吸附（此前只能吸附回初始列位），辅助线引导保留',
      '修复拖动漂移：向外拖动时画布实时扩大导致的坐标系反馈放大问题（拖 60px 落库变成 228px），拖动增量改按按下时的固定缩放比换算',
      '底部来源条：「零本」二字替换为毛笔字图片；字号改为随地图在屏幕上的实际缩放联动（地图显大时版权条也适当变大）',
    ],
  },
  {
    version: 'v1.19.1',
    date: '2026-07-24',
    items: [
      '导出界面优化：合并为统一的"导出"按钮，点击后弹出导出选项模态框，可选择导出 PNG（普通/超清）或全量 ZIP 压缩包',
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
