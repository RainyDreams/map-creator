import { Link } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'

export default function PrivacyPage() {
  return (
    <StaticPageLayout title="隐私政策">
      <p className="text-xs text-stone-400">版本 v2.3.0 · 生效日期：2026 年 7 月 21 日 · 最后更新：2026 年 7 月 25 日</p>

      <p className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-white/70 p-4 text-stone-600">
        <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
        <span>
          一句话总结：蹭饭图生成器是纯前端应用，您录入的所有名单数据只保存在自己的浏览器里，
          我们<strong className="text-stone-700">不收集、不传输、不共享</strong>您的任何名单数据。
          此外，我们使用 Microsoft Clarity 进行<strong className="text-stone-700">匿名化</strong>的
          页面使用行为分析（不涉及您的名单内容），详见本政策第四条。
        </span>
      </p>

      <section className="space-y-2">
        <SectionTitle>一、信息处理者身份与联系方式</SectionTitle>
        <p>
          本政策的个人信息处理者为「蹭饭图生成器」的开发者：<strong className="text-stone-700">赤峰二中2026届&海南大学人工智能2026级张同学</strong>
          （个人开发者，下同「我们」）。
        </p>
        <p>
          联系方式：<a href="mailto:linkbrain@lingben.top" className="text-amber-700 underline-offset-2 hover:underline">linkbrain@lingben.top</a>。
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
        <p>
          <strong className="text-stone-700">唯一的例外是您主动使用的「分享为链接」功能</strong>：
          当您点击生成分享链接时，当前画布的名单与配置数据会被上传至本站服务器临时保存 7 天
          （用于让收到链接的人打开该画布），到期后由系统自动删除。该上传仅在您主动点击时发生，
          详见本政策第五条。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>三、「名单数据不收集、不传输、不共享」声明</SectionTitle>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-stone-700">不收集</strong>：不收集您的姓名、学校、联系方式等任何个人信息；不设账号体系，不要求注册或登录；</li>
          <li><strong className="text-stone-700">不传输</strong>：不将您录入的名单数据、导出图片或 Excel 文件上传至任何服务器或第三方平台（您主动使用「分享为链接」功能的情形除外，见第五条）；</li>
          <li><strong className="text-stone-700">不共享</strong>：不向任何第三方提供、出售或共享您的名单数据。分享链接的接收方仅能经由您主动发出的链接访问对应画布，该访问由您的分享行为直接引起。</li>
        </ul>
        <p>
          需要说明的是：本服务使用 Microsoft Clarity 进行匿名化的页面使用行为分析（见第四条），
          该分析针对页面交互行为（如点击位置、滚动深度），<strong className="text-stone-700">不涉及亦不包含
          您录入的名单内容</strong>；除此之外，本服务不使用任何第三方广告或追踪脚本。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>四、Cookie 与同类技术</SectionTitle>
        <p>本服务使用的 Cookie 与同类技术如下，按用途分为两类：</p>
        <p><strong className="text-stone-700">（一）功能所必需的本地存储（localStorage，非 Cookie）</strong></p>
        <ul className="list-disc space-y-1 pl-5">
          <li>保存您的名单数据、主题与字体配置、界面偏好（如录入栏折叠状态与宽度）、首次访问的协议同意状态；</li>
          <li>该等内容仅驻留于您的设备，您可以随时按照本政策第八条所述方式清除。</li>
        </ul>
        <p><strong className="text-stone-700">（二）Microsoft Clarity 行为分析 Cookie</strong></p>
        <p>
          为改进产品体验，本服务接入了微软提供的 Microsoft Clarity 网站行为分析工具
          （隐私政策：privacy.microsoft.com/privacystatement）。Clarity 可能写入下列 Cookie：
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><code className="rounded bg-stone-100 px-1">_clck</code>：持久化本站点内的匿名用户标识（保存期约 1 年）；</li>
          <li><code className="rounded bg-stone-100 px-1">_clsk</code>：标识同一次访问会话内的页面浏览（保存期约 1 天）；</li>
          <li><code className="rounded bg-stone-100 px-1">CLID</code>、<code className="rounded bg-stone-100 px-1">MR</code>、<code className="rounded bg-stone-100 px-1">SM</code>、<code className="rounded bg-stone-100 px-1">MUID</code>：微软用于识别匿名用户与负载均衡的第一方/第三方 Cookie。</li>
        </ul>
        <p>
          Clarity 收集的内容为页面交互行为（如点击、滚动、页面停留）与设备/浏览器的一般性技术信息，
          微软默认对页面中的敏感文本进行遮蔽处理；本服务页面中您录入名单的表单区域不会被用于任何分析目的。
          我们依据您首次访问时弹窗中的同意启用该工具；如您不同意，可在浏览器设置中清除并禁用本站
          Cookie（核心功能不受影响）。
        </p>
        <p>
          例外场景：当您访问「问题反馈」页面时，本服务会把您在本页的<strong className="text-stone-700">随机昵称</strong>
          （形如「用户7865432」，非真实姓名）设置为 Clarity 的自定义用户标识；当您主动勾选并上传使用日志时，
          日志会附带上述 <code className="rounded bg-stone-100 px-1">_clck</code> /
          <code className="rounded bg-stone-100 px-1">_clsk</code> 匿名标识。
          这仅用于管理员把您反馈的问题与对应的匿名会话录屏对照起来定位问题，不涉及您的名单数据与真实身份。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>五、服务器日志与「分享为链接」功能</SectionTitle>
        <p>
          本服务托管于 Cloudflare Pages。当您访问本服务时，Cloudflare 的边缘节点会按照其基础设施的
          通行做法生成标准访问日志（可能包含 IP 地址、访问时间、请求的 URL、浏览器 User-Agent 等），
          用于安全防护与运行维护。该等日志由 Cloudflare 依其隐私政策（cloudflare.com/privacypolicy）
          处理；我们不会将该等日志用于识别您的个人身份，亦不会将其与您录入的任何内容关联。
          此外，本服务 /api/ 路径下的辅助接口（地图数据、微信分享签名）仅处理其功能所必需的
          请求参数（如省份名称、当前页面 URL），不涉及您的名单数据。
        </p>
        <p><strong className="text-stone-700">关于错误日志的自动收集：</strong></p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            为及时发现并修复故障，当页面发生 JavaScript 运行错误（含资源加载失败、未处理的
            Promise 异常）时，本服务会自动上报一份<strong className="text-stone-700">匿名</strong>错误日志，
            内容仅限：错误类型与信息、错误堆栈、发生页面的路径（不含网址参数与锚点）、软件版本号、
            浏览器 User-Agent；
          </li>
          <li>
            错误日志<strong className="text-stone-700">不包含</strong>您录入的名单、画布内容、
            分享链接数据或任何可识别个人身份的信息；IP 地址仅用于服务端限流计数（约 2 分钟后自动消失），
            不写入错误记录；
          </li>
          <li>
            错误日志保存于 Cloudflare KV 存储中，<strong className="text-stone-700">30 天</strong>后自动删除；
            相同错误只聚合计数，我们不将其用于错误排查以外的任何目的。
          </li>
        </ul>
        <p><strong className="text-stone-700">关于匿名使用统计：</strong></p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            为改进产品，本服务会在您同意本政策后统计<strong className="text-stone-700">匿名的使用次数</strong>，
            内容仅限事件类型与当日合计次数（如页面访问次数、导出图片次数、提交反馈次数），
            <strong className="text-stone-700">不包含</strong>您的名单内容、页面网址参数或任何可识别个人身份的信息；
          </li>
          <li>
            统计数据按天聚合保存于 Cloudflare KV 存储中，<strong className="text-stone-700">180 天</strong>后自动删除；
            IP 地址仅用于服务端限流计数（约 2 分钟后自动消失），不写入统计记录。
          </li>
        </ul>
        <p><strong className="text-stone-700">关于「问题反馈」页面的数据处理：</strong></p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            「问题反馈」是一块<strong className="text-stone-700">公开</strong>反馈板：您提交的反馈类别、
            随机昵称与正文内容（含您后续的追加回复）将向所有访问者展示，请勿在正文中填写姓名、联系方式等任何个人信息；
          </li>
          <li>
            反馈昵称由您的浏览器在本地随机生成（形如「用户7865432」），仅保存于您设备的
            localStorage 中，不代表任何真实身份；
          </li>
          <li>
            反馈内容保存于 Cloudflare KV 存储中，<strong className="text-stone-700">90 天</strong>后自动删除；
            IP 地址仅用于服务端限流计数（约 2 分钟后自动消失），不写入反馈记录；
          </li>
          <li>
            反馈提交完全由您主动触发；除您主动提交的内容外，该功能不读取、不上传您的名单数据。
          </li>
          <li>
            使用日志：为便于问题定位，您的浏览器会在本机（localStorage）持续累积一份
            <strong className="text-stone-700">使用日志</strong>，内容包括控制台记录、
            页面 JavaScript 报错与导出图片等关键操作的技术细节；日志自上次上传之后开始累积
            （从未上传过则自首次访问本页面开始累积），仅保存在您自己的设备上，
            容量有界，超限后自动丢弃最早的记录；
          </li>
          <li>
            当您在反馈表单中<strong className="text-stone-700">主动勾选「附带我的使用日志」</strong>并提交时，
            上述本机使用日志会随反馈一同上传（连同 Clarity 匿名用户/会话标识，用于对照会话录屏，见第四条），
            上传成功后本机记录即清空、重新开始累积。日志保存 <strong className="text-stone-700">48 小时</strong>后自动删除。
            该上传仅在您主动勾选时发生，日志内容仅管理员在排查问题时可见，且日志不包含您的名单数据。
          </li>
        </ul>
        <p><strong className="text-stone-700">关于「分享为链接」功能的数据处理：</strong></p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            当您主动点击「分享为链接」并生成链接时，当前画布的名单与主题、字体等配置数据
            会被上传并保存于 Cloudflare KV 存储中，同时生成一条含随机短标识的链接；
          </li>
          <li>
            该等数据自生成之时起保存 <strong className="text-stone-700">7 天</strong>，
            到期后由存储系统自动删除，不可恢复；除向您与链接接收方提供打开画布所必需的读取外，
            我们不阅读、不分析、不用于任何其他目的；
          </li>
          <li>
            任何持有该链接的人均可在有效期内打开画布副本并继续编辑（编辑结果保存在各自设备，
            互不影响）。链接由您自行决定发送对象，请您谨慎分享，勿将其发给不信任的人；
          </li>
          <li>
            您上传的大学毛笔字图片、自定义校徽图片与班徽图片不随链接上传或分享。
          </li>
          <li>
            该功能可能因运营成本、系统维护等原因暂停开放；暂停期间不会生成新的分享链接，
            已生成的链接到期后仍按上述规则自动删除。
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <SectionTitle>六、第三方资源</SectionTitle>
        <p>
          页面渲染所需的字体、地图边界数据等静态资源均已随页面一同打包或托管于本站点，加载时
          不附带您的任何录入内容。本服务接入 Microsoft Clarity（clarity.ms）用于匿名化使用行为
          分析，详见本政策第四条。当您在微信内置浏览器中打开本服务时，页面会按需加载腾讯提供的
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
