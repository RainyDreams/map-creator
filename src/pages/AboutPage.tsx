import { Link } from 'react-router'
import { Globe, MapPin, Sparkles } from 'lucide-react'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'

const features = [
  '手动录入学生、老师名单及去向城市，实时联动中国地图',
  '支持下载 Excel 模板批量填写、一键导入',
  '地图可视化展示蹭饭分布，城市聚合标注',
  '一键导出高清蹭饭图图片，方便班级群分享',
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
        <dl className="grid grid-cols-[5.5rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-stone-400">软件名称</dt>
          <dd className="text-stone-700">蹭饭图生成器</dd>
          <dt className="text-stone-400">开发者</dt>
          <dd className="text-stone-700">赤峰二中2026届zxy</dd>
          <dt className="text-stone-400">公众号</dt>
          <dd className="text-stone-700">《零本》</dd>
          <dt className="text-stone-400">当前版本</dt>
          <dd className="text-stone-700">v1.2.0</dd>
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
        <SectionTitle>技术栈</SectionTitle>
        <p>
          本应用为纯前端单页应用，基于 React 19 + TypeScript + Vite 构建，
          界面采用 Tailwind CSS 与 shadcn/ui 组件库，路由使用 React Router 7，
          Excel 导入导出基于 SheetJS（xlsx）在浏览器本地完成，图片导出基于 html-to-image。
          名单数据仅存储于浏览器 localStorage；站点部署于 Cloudflare Pages，
          辅以少量 Pages Functions 接口提供地图辅助数据与可选的微信分享签名。
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
