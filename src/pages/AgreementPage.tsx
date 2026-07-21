import { Link } from 'react-router'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'

export default function AgreementPage() {
  return (
    <StaticPageLayout title="用户协议">
      <p className="text-xs text-stone-400">最后更新：2026 年 · 版本 v1.0.0</p>

      <section className="space-y-2">
        <SectionTitle>一、服务说明</SectionTitle>
        <p>
          「蹭饭图生成器」（网址：map.linkbrain.top）是由 赤峰二中2026届zxy
          开发并维护的一款免费在线工具，用于将毕业班同学、老师的去向信息录入后，
          在中国地图上生成可视化的「蹭饭图」，并支持导出图片分享。
        </p>
        <p>
          本工具为纯前端网页应用：所有数据的录入、编辑、解析与渲染均在您的浏览器中完成，
          无需注册账号，不设服务器端存储。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>二、用户数据的存储与处理</SectionTitle>
        <p>
          您录入的标题、学生与老师名单等全部内容，仅保存在您本机浏览器的 localStorage 中，
          不会上传到任何服务器。清除浏览器数据可能导致这些内容丢失，请及时导出 Excel
          或图片进行备份。
        </p>
        <p>
          通过 Excel 模板导入的名单文件仅在本地解析，文件本身与解析结果均不会离开您的设备。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>三、内容责任</SectionTitle>
        <p>
          您应对录入内容的真实性、合法性负责，不得利用本工具制作、传播含有以下内容的蹭饭图：
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>违反国家法律法规、危害国家安全与社会公共利益的内容；</li>
          <li>侵犯他人姓名权、肖像权、名誉权、隐私权等合法权益的内容；</li>
          <li>含有侮辱、诽谤、歧视、骚扰他人的信息；</li>
          <li>其他违法或违背公序良俗的内容。</li>
        </ul>
        <p>
          录入他人姓名、去向等信息前，建议您征得相关人员同意。因您录入或传播的内容引发的任何纠纷与法律责任，由您自行承担。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>四、知识产权</SectionTitle>
        <p>
          本工具的界面设计、代码与品牌标识的知识产权归开发者所有。您使用本工具生成的蹭饭图，
          其使用权归您所有，可用于班级纪念、个人分享等非商业用途；如需商业使用，请事先联系开发者取得许可。
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>五、免责声明</SectionTitle>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            本工具按「现状」提供，不保证在所有设备、浏览器上完全无故障运行；
          </li>
          <li>
            因浏览器数据被清除、设备故障等原因造成的本地数据丢失，开发者不承担责任；
          </li>
          <li>
            地图底图与边界数据来源于公开资料，仅供示意图用途，不作为正式行政区划依据；
          </li>
          <li>
            因不可抗力或第三方服务异常导致的服务中断，开发者不承担责任，但会尽力恢复。
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <SectionTitle>六、协议的变更</SectionTitle>
        <p>
          开发者可能根据功能调整或法律法规要求修订本协议，修订后的协议将在本页面公布并即时生效。
          您继续使用本工具即视为接受修订后的协议。
        </p>
      </section>

      <p className="rounded-xl border border-amber-200/70 bg-white/70 p-4 text-xs leading-6 text-stone-500">
        相关页面：
        <Link to="/privacy" className="text-amber-700 underline-offset-2 hover:underline">隐私政策</Link>
        {' · '}
        <Link to="/about" className="text-amber-700 underline-offset-2 hover:underline">关于</Link>
      </p>
    </StaticPageLayout>
  )
}
