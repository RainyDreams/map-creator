import { Link } from 'react-router'
import { Globe, MapPin, Sparkles } from 'lucide-react'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'
import { APP_VERSION } from '@/version'

const changelog = [
  {
    version: 'v1.29.2',
    date: '2026-07-25 17:45',
    items: [
      '字号推荐更克制：空间富余时姓名/校名/城市推荐到 16px 即止（观感最合适的常规大小），省份名推荐到 19px，不再往更大推荐',
      '页脚「问题反馈」新增红点引导：未读时显示，点击或进入反馈页后不再出现（仅本机记忆）',
      '反馈页新增说明：本站由一个人开发维护、不计成本免费开放，欢迎多提建议',
    ],
  },
  {
    version: 'v1.29.1',
    date: '2026-07-25 16:40',
    items: [
      '排版布局新增「只显示省份」：开启后学生行只标注到省（城市留空也能录入），录入面板城市下拉出现「仅到省」选项，Excel / JSON 导入同步支持城市列直接填省份',
      '会话日志更详细：除控制台记录外，还会记录页面切换、导出开始/成功/失败、网络断连、资源加载失败等关键足迹，问题定位更准（仍只保留 48 小时，不含名单内容）',
      '右下角水印简化为纯网址并缩小字号；新画布默认标题改为「我们班的蹭饭图」',
      '匿名使用统计保留周期收紧为 31 天自动清理，减轻存储占用',
    ],
  },
  {
    version: 'v1.28.0',
    date: '2026-07-25 01:48',
    items: [
      '反馈表单新增「附带本次会话日志」选项（Bug 反馈默认勾选）：仅记录本次打开页面后的控制台记录，48 小时自动删除，帮助我们更快定位你遇到的问题',
      '新增匿名使用统计：只统计事件次数（页面访问、导出、反馈等），不含任何名单内容与身份信息，同意协议后生效（详见隐私政策第五条）',
    ],
  },
  {
    version: 'v1.27.1',
    date: '2026-07-25 01:15',
    items: [
      '新增「名字一键隐私」开关（学生名单分区）：开启后地图与导出图片中的姓名只显示「姓+同学」，省份卡片、同校合并、海外/境外与未定位区块同步生效；原始名单原样保留在本机，录入与编辑界面仍显示全名',
    ],
  },
  {
    version: 'v1.27.0',
    date: '2026-07-25 00:51',
    items: [
      '新增「问题反馈」公开反馈板（页脚可达）：Bug 反馈 / 功能建议 / 使用体验三类可选，随机昵称本机生成，最新 50 条公开展示；服务端带同源校验、体积闸门、全局/单 IP 限流与列表缓存，记录 90 天自动删除（详见隐私政策第五条）',
      '导入面板「下载模板」按钮改为黑底强调样式，与导出按钮视觉层级一致',
      '页脚新增「问题反馈」入口（用户协议 · 隐私政策 · 关于 · 问题反馈 · 微信公众号 · 零本）',
    ],
  },
  {
    version: 'v1.26.1',
    date: '2026-07-25 00:35',
    items: [
      '海外/境外名单块可自由拖动：与老师块一致——电脑端直接拖、移动端先点选中再拖，画布随拖动自动伸缩，「重置位置」可一并复位',
      '录入页控制区重组：五个分区统一为可折叠卡片，按「内容 / 外观」分组，分区标题旁常驻摘要（已填人数、当前主题、字号等）',
      '人数小块新增「自动」位置（默认）：左对齐卡片小块在右上、右对齐卡片在左上，始终避开标题文字一侧',
    ],
  },
  {
    version: 'v1.26.0',
    date: '2026-07-24 22:50',
    items: [
      '人数统计改为「卡片内人数小块」：默认关闭，开启后以主题色浅底小块显示在卡片内部角落，位置可选右上/左上（不再骑缝显示）',
      '卡片调大小升级为八向手柄：四边中点与四角共 8 个手柄，上下左右与任意角都可拖拽；从左侧/上侧拖时对侧边缘保持不动',
      '英文副标题字号可调（10–28px 下拉，与标题字号同一控件）',
      '页脚网址块底色不再写死纯黑，随主题取相应深色，各主题下更协调',
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
        <SectionTitle>关注《零本》</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <figure className="flex flex-col items-center gap-2 rounded-xl border border-stone-200/80 bg-white/70 p-4">
            <img
              src="/images/qr-lingben-mp.jpg"
              alt="公众号《零本》二维码"
              className="h-32 w-32 rounded-lg"
            />
            <figcaption className="text-center text-xs leading-relaxed text-stone-500">
              微信扫码
              <br />
              关注公众号《零本》
            </figcaption>
          </figure>
          <figure className="flex flex-col items-center justify-center gap-2 rounded-xl border border-stone-200/80 bg-white/70 p-4">
            <img
              src="/images/qr-lingben-search.jpg"
              alt="微信搜一搜「零本」"
              className="w-full max-w-sm rounded-lg"
            />
            <figcaption className="text-center text-xs leading-relaxed text-stone-500">
              或在微信「搜一搜」直接搜索「零本」
            </figcaption>
          </figure>
        </div>
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
          <Link to="/feedback" className="text-amber-700 underline-offset-2 hover:underline">
            问题反馈
          </Link>
        </p>
      </section>
    </StaticPageLayout>
  )
}
