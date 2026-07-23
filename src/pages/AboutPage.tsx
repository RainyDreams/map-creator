import { Link } from 'react-router'
import { Globe, MapPin, Sparkles } from 'lucide-react'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'

const changelog = [
  {
    version: 'v1.13.0',
    date: '2026-07-23',
    items: [
      '省份卡片可拖动：电脑端直接按住省份名单块拖动微调位置，移动端先点选中（出现虚线框）再拖动；引线随卡片一起移动，位置自动记忆',
      '省份卡片样式自定义：颜色（预设色板 + 自定义取色）、不透明度、边缘羽化、圆角均可调',
      '字号设置更直觉：设置多大就渲染多大，放不下时画布自动加高，绝不在背后偷偷缩小',
      '推荐设置去弹窗化：字号/列数的推荐值直接标注在对应设置项旁边（如「推荐 15px」「推荐两列」），点击才应用，不再弹窗打扰',
      '西南空白区扩容：左列放不下的省份（不限西藏/云南）自动溢出到主图左下空白区',
      '新增 hash 分享链接：画布数据压缩编码进网址（不经过服务器），打开链接先预览名单，可一键加载为自己的新画布或仅下载 JSON',
      '「下载模板」按钮并入「导入」面板，工具条更精简',
    ],
  },
  {
    version: 'v1.12.0',
    date: '2026-07-23',
    items: [
      '新增省份名单卡片：每个省份的名单衬一个圆角底色卡片（可在字体设置中关闭背景、调节圆角），引线被卡片自然遮住，不再穿过其他同学的名单',
      '新增「同校合并」：同一大学的多名同学姓名一人一行竖排，校徽与校名只在右侧显示一次，同校扎堆时画面更清爽',
      '西南空白区利用：西藏、云南方向的名单块默认放入主图左下空白处，充分利用画布空间',
      '标注区宽度按内容动态界定：人少时地图更大，常见长校名/地名不再换行；两列模式子列加宽',
      '字号智能建议：字体设置新增「推荐设置」按钮，按人数与空间计算最美观的字号；上传毛笔字图片后，建议把字号调整为图片高度的 70% 左右；两列建议仅在内容超过地图高度 1.1 倍时才出现',
      '建议弹窗换新：统一的白底圆角卡片风格，逐条列出具体调整参数，确认后生效',
      '修复地图数据加载偶发失败导致标注不显示的问题：加载增加自动重试与控制台诊断',
    ],
  },
  {
    version: 'v1.11.0',
    date: '2026-07-22',
    items: [
      '新增加载骨架屏：页面打开与地图轮廓加载期间展示与主界面同风格的呼吸占位，不再白屏闪烁',
      '新增「每侧两列」标注布局：同学较多时可在「字体设置」中把每侧标注从一列切换为两列，画面更宽松',
      '新增排版自适应推荐：人数较多、当前字号放不下时，自动计算最美观的列数与字号方案并弹提示，经你同意后一键应用',
      '城市查询接口支持批量合并：多个省份的城市数据合并为一个请求发出，减少网络请求与服务器调用次数',
      '分享弹窗改版：主选项为「导出为图片」（发班级群的最佳方式），「分享为链接」降级为小选项；链接分享功能暂时关闭（实现代码保留，后续视资源情况开放）',
    ],
  },
  {
    version: 'v1.10.3',
    date: '2026-07-22',
    items: [
      '地图轮廓数据（china.json，约 570KB）不再打进 JS 包：改为独立的 /data/ 静态资源按需加载（CDN 缓存 7 天、页面预载），主包体积从 1.72MB 降至 1.14MB，打开更快',
    ],
  },
  {
    version: 'v1.10.2',
    date: '2026-07-22',
    items: [
      '修复「导入 → 导入 Excel」数据预览表无法纵向滚动、内容被截断溢出的问题：预览区改为原生滚动容器，表头滚动时吸附置顶',
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
          <dd className="text-stone-700">赤峰二中2026届zxy</dd>
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
          <dd className="text-stone-700">v1.13.0</dd>
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
