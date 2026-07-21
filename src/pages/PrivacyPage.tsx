import { Link } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'

export default function PrivacyPage() {
  return (
    <StaticPageLayout title="隐私政策">
      <p className="text-xs text-stone-400">版本 v2.0.0 · 生效日期：2026 年 7 月 21 日 · 最后更新：2026 年 7 月 21 日</p>

      <p className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-white/70 p-4 text-stone-600">
        <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
        <span>
          一句话总结：蹭饭图生成器是纯前端应用，您录入的所有数据只保存在自己的浏览器里，
          我们<strong className="text-stone-700">不收集、不传输、不共享</strong>您的任何名单数据。
        </span>
      </p>

      <section className="space-y-2">
        <SectionTitle>一、信息处理者身份与联系方式</SectionTitle>
        <p>
          本政策的个人信息处理者为「蹭饭图生成器」的开发者：<strong className="text-stone-700">赤峰二中2026届zxy</strong>
          （个人开发者，下同「我们」）。
        </p>
        <p>
          联系方式：<span className="text-stone-500">【占位】map@linkbrain.top（联系邮箱，待启用；亦可先通过「关于」页面公示的方式留言）</span>。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>二、我们处理的信息清单</SectionTitle>
        <p>
          您在使用本服务过程中主动录入的下列信息，<strong className="text-stone-700">全部仅保存于您当前浏览器的
          localStorage（本地存储）中</strong>，自产生之时起不离开您的设备：
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>蹭饭图标题文字（如班级名称、毕业年份）；</li>
          <li>学生姓名及其去向城市、录取高校（大学）名称；</li>
          <li>老师姓名及其所在城市、备注信息；</li>
          <li>画布主题配置（配色与样式选择）及界面偏好（如录入栏折叠状态）。</li>
        </ul>
        <p>
          上述信息由您在自己的浏览器中录入、查看、修改和删除，我们无法访问、读取或恢复该等信息。
          通过 Excel 模板导入的名单文件由浏览器在本地解析，文件本身与解析结果均不会发送到网络。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>三、「不收集、不传输、不共享」声明</SectionTitle>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-stone-700">不收集</strong>：不收集您的姓名、学校、联系方式等任何个人信息；不设账号体系，不要求注册或登录；</li>
          <li><strong className="text-stone-700">不传输</strong>：不将您录入的名单数据、导出图片或 Excel 文件上传至任何服务器或第三方平台；</li>
          <li><strong className="text-stone-700">不共享</strong>：不向任何第三方提供、出售或共享您的信息；不使用任何第三方统计、广告或行为追踪脚本。</li>
        </ul>
      </section>

      <section className="space-y-2">
        <SectionTitle>四、Cookie 与同类技术</SectionTitle>
        <p>
          本服务<strong className="text-stone-700">不使用 Cookie</strong> 进行追踪或识别。本服务仅使用浏览器
          localStorage 实现功能所必需的本地保存（名单数据、主题与界面偏好），该等技术所保存的内容
          仅驻留于您的设备，您可以随时按照本政策第八条所述方式清除。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>五、服务器日志</SectionTitle>
        <p>
          本服务托管于 Cloudflare Pages。当您访问本服务时，Cloudflare 的边缘节点会按照其基础设施的
          通行做法生成标准访问日志（可能包含 IP 地址、访问时间、请求的 URL、浏览器 User-Agent 等），
          用于安全防护与运行维护。该等日志由 Cloudflare 依其隐私政策（cloudflare.com/privacypolicy）
          处理；我们不会将该等日志用于识别您的个人身份，亦不会将其与您录入的任何内容关联。
          此外，本服务 /api/ 路径下的辅助接口（地图数据、微信分享签名）仅处理其功能所必需的
          请求参数（如省份名称、当前页面 URL），不涉及您的名单数据。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>六、第三方资源</SectionTitle>
        <p>
          页面渲染所需的字体、地图边界数据等静态资源均已随页面一同打包或托管于本站点，加载时
          不附带您的任何录入内容。当您在微信内置浏览器中打开本服务时，页面会按需加载腾讯提供的
          微信 JS-SDK 脚本（res.wx.qq.com）以实现分享卡片配置，该请求由您的浏览器直接向腾讯发起，
          其信息处理以腾讯的相关隐私政策为准。页脚中的备案查询链接（beian.miit.gov.cn、
          beian.mps.gov.cn）为监管部门官方网站，其隐私政策以各网站公示为准。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>七、未成年人保护</SectionTitle>
        <p>
          本服务主要面向毕业季学生群体。若您未满十八周岁，请在监护人的陪同下阅读本政策，并在取得
          监护人同意后使用本服务。由于本服务不收集任何个人信息，我们事实上无法亦无需获取未成年人
          的个人信息；监护人如对未成年人使用本服务有任何疑问，可通过本政策第一条所述方式与我们联系。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>八、您的权利与实现方式</SectionTitle>
        <p>
          因您的全部数据均保存在您自己的浏览器中，您对个人信息享有的查阅、复制、更正、删除等权利，
          均可由您自行直接实现，无需向我们提出申请：
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-stone-700">查阅与更正</strong>：在应用内随时查看、编辑名单数据与主题配置；</li>
          <li><strong className="text-stone-700">复制（可携带）</strong>：通过「导出 Excel」或「导出图片」功能获取您的数据副本；</li>
          <li><strong className="text-stone-700">删除</strong>：使用应用内「清空重置」功能，或在浏览器设置中清除本站点（map.linkbrain.top）的站点数据；</li>
          <li><strong className="text-stone-700">注销</strong>：本服务无账户体系，不涉及账户注销；清除本地数据即等同于停止使用。</li>
        </ul>
        <p>
          请注意：删除后的数据无法恢复，因为除您的浏览器外，任何其他地方都不存在副本。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>九、政策变更与生效日期</SectionTitle>
        <p>
          如本政策发生变更，我们将在本页面公布修订后的政策并即时生效。由于我们不掌握您的任何
          联系方式，无法单独通知，请您在使用时留意本页面公示的更新日期。本政策自
          <strong className="text-stone-700"> 2026 年 7 月 21 日</strong>起生效。
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
