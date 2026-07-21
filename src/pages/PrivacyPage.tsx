import { Link } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'

export default function PrivacyPage() {
  return (
    <StaticPageLayout title="隐私政策">
      <p className="text-xs text-stone-400">最后更新：2026 年 · 版本 v1.0.0</p>

      <p className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-white/70 p-4 text-stone-600">
        <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
        <span>
          一句话总结：蹭饭图生成器是纯前端应用，您的所有数据只存在自己的浏览器里，
          我们不收集、不上传、不追踪任何个人信息。
        </span>
      </p>

      <section className="space-y-2">
        <SectionTitle>一、数据存储在哪里</SectionTitle>
        <p>
          您录入的标题、学生与老师名单等全部内容，仅保存在您当前浏览器的
          localStorage（本地存储）中。这些数据从产生到保存，全程不离开您的设备。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>二、我们不收集什么</SectionTitle>
        <ul className="list-disc space-y-1 pl-5">
          <li>不收集姓名、学校、联系方式等任何个人信息；</li>
          <li>不设置账号体系，不要求注册或登录；</li>
          <li>不使用任何第三方统计、广告或行为追踪脚本；</li>
          <li>不将您录入的任何内容上传到服务器或第三方平台。</li>
        </ul>
      </section>

      <section className="space-y-2">
        <SectionTitle>三、Excel 文件的处理方式</SectionTitle>
        <p>
          当您使用 Excel 模板批量导入名单时，文件由浏览器在本地直接解析，
          文件本身与解析结果均不会发送到网络。导入失败或格式错误也只会在本地提示，
          不产生任何网络请求。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>四、第三方资源</SectionTitle>
        <p>
          页面可能加载公开托管的字体、地图边界数据等静态资源，这些请求仅用于渲染页面，
          不附带您的任何录入内容。页脚中的备案查询链接（beian.miit.gov.cn、beian.mps.gov.cn）
          为监管部门官方网站，其隐私政策以各网站公示为准。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>五、如何删除您的数据</SectionTitle>
        <p>
          您可以随时在应用内使用「清空重置」功能清除名单，或在浏览器设置中清除本站点
          （map.linkbrain.top）的站点数据。删除后数据无法恢复，因为除您的浏览器外，
          任何其他地方都不存在副本。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>六、政策变更</SectionTitle>
        <p>
          如本政策有变更，将在本页面公布并即时生效。由于我们不掌握您的任何联系方式，
          无法单独通知，请在使用时留意本页面的更新日期。
        </p>
      </section>

      <p className="rounded-xl border border-amber-200/70 bg-white/70 p-4 text-xs leading-6 text-stone-500">
        相关页面：
        <Link to="/agreement" className="text-amber-700 underline-offset-2 hover:underline">用户协议</Link>
        {' · '}
        <Link to="/about" className="text-amber-700 underline-offset-2 hover:underline">关于</Link>
      </p>
    </StaticPageLayout>
  )
}
