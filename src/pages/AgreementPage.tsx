import type { ReactNode } from 'react'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'
import { AppLink } from '@/components/layout/RouteLoadingOverlay'

/** 条下款：加粗款号 + 正文 */
function Clause({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p>
      <strong className="font-semibold text-stone-700">{n}</strong>
      {'　'}
      {children}
    </p>
  )
}

export default function AgreementPage() {
  return (
    <StaticPageLayout title="用户协议">
      <p className="text-xs text-stone-400">版本 v2.0.0 · 生效日期：2026 年 7 月 21 日 · 最后更新：2026 年 7 月 21 日</p>

      <p className="rounded-xl border border-amber-200/70 bg-white/70 p-4 text-stone-600">
        欢迎使用「蹭饭图生成器」。请您在使用本服务前仔细阅读并充分理解本协议全部内容，
        尤其是以加粗形式提示的免除或限制责任条款。您访问或使用本服务，即视为您已阅读、
        理解并同意接受本协议的全部约定。
      </p>

      <section className="space-y-2">
        <SectionTitle>第一条　定义与解释</SectionTitle>
        <Clause n="1.1">
          除非上下文另有所指，本协议中下列术语具有如下含义：
        </Clause>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-stone-700">「本软件」或「本服务」</strong>：指由开发者开发并运营的、
            域名为 map.linkbrain.top 的「蹭饭图生成器」网页应用，包括其全部页面、功能、
            应用程序接口（含 /api/ 路径下的服务端接口）及不时的更新版本。
          </li>
          <li>
            <strong className="text-stone-700">「蹭饭图」</strong>：指用户基于自行录入的毕业去向信息生成的、
            以中国地图为底图标注姓名、城市、高校信息的图片作品。
          </li>
          <li>
            <strong className="text-stone-700">「用户」或「您」</strong>：指访问、浏览或以任何方式使用本服务的
            自然人、法人或其他组织。
          </li>
          <li>
            <strong className="text-stone-700">「开发者」或「我们」</strong>：指本软件的开发与维护者
            赤峰二中2026届&海南大学人工智能2026级张同学。
          </li>
          <li>
            <strong className="text-stone-700">「名单数据」</strong>：指用户通过手动录入、Excel 模板导入或其他方式
            输入本软件的蹭饭图标题、学生与老师姓名、去向城市、高校名称等信息及其组合。
          </li>
          <li>
            <strong className="text-stone-700">「导出图片」</strong>：指用户通过本服务的导出功能，将蹭饭图保存为
            PNG 等格式的图片文件所获得的成果。
          </li>
          <li>
            <strong className="text-stone-700">「主题」</strong>：指用户为蹭饭图选择的画布配色与样式预设，
            或用户自行调整的自定义样式配置。
          </li>
          <li>
            <strong className="text-stone-700">「本协议」</strong>：指本《用户协议》正文及其不时的修订版本。
          </li>
        </ul>
        <Clause n="1.2">
          除非上下文另有所指，本协议中：（1）条、款标题仅为方便阅读而设，不影响本协议的解释与效力；
          （2）所称「包括」均指「包括但不限于」；（3）所称「以上」「以内」均包含本数；
          （4）援引某一条款时，视为援引该条项下的全部款项。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第二条　协议的范围与效力</SectionTitle>
        <Clause n="2.1">
          本协议是用户与开发者之间关于访问和使用本服务所订立的协议，自您首次访问或使用本服务之时起
          对您生效。如您不同意本协议的任何内容，请立即停止访问和使用本服务；您继续使用本服务的，
          视为您已接受本协议的全部约定。
        </Clause>
        <Clause n="2.2">
          本协议与本服务公示的《隐私政策》共同构成您与开发者之间就本服务达成的完整协议。
          就名单数据及其他信息的处理事项，本协议与《隐私政策》约定不一致的，以《隐私政策》为准。
        </Clause>
        <Clause n="2.3">
          您确认具备使用本服务所需的完全民事行为能力。未满十八周岁的用户，应当在监护人的陪同下
          阅读本协议，并在取得监护人同意后使用本服务。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第三条　服务的内容与性质</SectionTitle>
        <Clause n="3.1">
          本服务是一款<strong className="text-stone-700">免费</strong>的在线工具：用户录入名单数据并选择主题后，
          本服务以中国地图为底图实时渲染蹭饭图，并支持将蹭饭图导出为图片文件、将名单数据导出为
          Excel 文件，以及通过 Excel 模板批量导入名单数据。
        </Clause>
        <Clause n="3.2">
          本服务为纯前端网页应用：名单数据的录入、编辑、解析、渲染与图片导出均在您的浏览器中完成。
          除获取静态页面资源、地图辅助数据及可选的微信分享配置外，本服务原则上不向服务器传输
          您的名单数据。
        </Clause>
        <Clause n="3.3">
          本服务<strong className="text-stone-700">不设账户体系</strong>，不要求注册或登录，亦不提供跨设备同步功能。
          您在一台设备、一个浏览器中保存的内容，无法自动迁移至其他设备或浏览器。
        </Clause>
        <Clause n="3.4">
          本服务系开发者个人创作并维护的非商业项目。开发者有权根据实际需要随时调整、暂停或终止
          本服务的全部或部分功能，并将在页面显著位置公示；开发者不就本服务的持续可用性作出承诺。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第四条　用户行为规范</SectionTitle>
        <Clause n="4.1">
          您应对录入本服务的全部名单数据的真实性、准确性与合法性独立承担责任。录入他人的姓名、
          去向等信息前，您应当事先取得相关人员的同意；不得录入他人信息冒充他人、虚构他人去向，
          或以其他方式侵害他人的姓名权、名誉权、隐私权及个人信息权益。
        </Clause>
        <Clause n="4.2">
          您不得利用本服务制作、导出或传播含有下列内容的蹭饭图或导出图片：
        </Clause>
        <ul className="list-disc space-y-1 pl-5">
          <li>违反中华人民共和国法律法规、危害国家安全、损害国家荣誉和利益、破坏社会稳定的内容；</li>
          <li>含有侮辱、诽谤、歧视、骚扰、恐吓他人，或侵害他人合法权益的内容；</li>
          <li>含有淫秽、色情、赌博、暴力、恐怖或者教唆犯罪的内容；</li>
          <li>含有虚假、欺诈性信息，或可能误导公众的内容；</li>
          <li>其他违反法律法规、部门规章或违背公序良俗的内容。</li>
        </ul>
        <Clause n="4.3">
          您不得对本服务实施下列行为：反向工程、抓取或批量调用本服务接口；干扰、破坏本服务的
          正常运行；利用本服务从事任何危害网络安全或侵害开发者、第三方合法权益的活动。
        </Clause>
        <Clause n="4.4">
          因您录入、导出或传播的内容引发的任何纠纷、投诉、行政处罚或法律责任，均由您独立承担；
          因此给开发者造成损失的，您应当予以赔偿。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第五条　数据存储与隐私</SectionTitle>
        <Clause n="5.1">
          您的全部名单数据与主题配置仅保存于您当前浏览器的 localStorage（本地存储）中，
          自产生之时起不离开您的设备，本服务不上传、不在服务器留存该等数据；
          您主动使用「分享为链接」功能的情形除外（见第 5.1.1 条）。
        </Clause>
        <Clause n="5.1.1">
          「分享为链接」功能：（一）当您主动点击生成分享链接时，当前画布的名单与配置数据将上传至
          本服务服务器（Cloudflare KV 存储）临时保存，保存期限为 7 天，到期自动删除；
          （二）分享链接包含随机生成的短标识，任何持有该链接的人均可在有效期内打开您的画布副本
          并查看、修改其中的内容（修改结果保存在各自设备，互不影响）；
          （三）分享链接的发送对象由您自行决定，您应当谨慎评估接收方的可信程度；
          因您主动分享链接导致数据被他人获取、修改或扩散的，相应后果由您自行承担；
          （四）您上传的大学毛笔字图片、自定义校徽图片与班徽图片不随链接分享；
          （五）该功能可能因运营成本、系统维护等原因暂停或终止开放，暂停期间您可通过
          导出图片、导出 Excel 或 JSON 文件等方式分享您的画布，本服务不就此承担违约责任。
        </Clause>
        <Clause n="5.2">
          清除浏览器站点数据、卸载浏览器、更换设备或浏览器处于隐私（无痕）模式，均可能导致
          上述本地数据丢失且无法恢复。请您及时导出 Excel 或导出图片进行备份；因本地数据丢失
          造成的损失，由您自行承担。
        </Clause>
        <Clause n="5.3">
          关于本服务如何处理信息的完整说明，请见本服务公示的
          <AppLink to="/privacy" className="text-amber-700 underline-offset-2 hover:underline">《隐私政策》</AppLink>。
          《隐私政策》构成本协议不可分割的组成部分。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第六条　知识产权</SectionTitle>
        <Clause n="6.1">
          本软件的界面设计、源代码、品牌标识「蹭饭图生成器」及相关文档的知识产权，归开发者所有，
          受《中华人民共和国著作权法》等法律法规保护。本软件源代码以
          「知识共享 署名—非商业性使用—相同方式共享 4.0 国际（CC BY-NC-SA 4.0）」许可协议公开：
          任何人可以学习、复制、改编与再分发，但须注明原作者及来源、不得用于商业目的，
          且二次作品须以同一许可协议发布；超出该协议范围的商用使用，须经开发者书面许可。
        </Clause>
        <Clause n="6.2">
          您声明并保证：您对录入本服务的名单数据享有合法权利或已取得合法授权，该等数据不侵犯
          任何第三方的合法权益。
        </Clause>
        <Clause n="6.3">
          您对基于自行录入的名单数据所生成的蹭饭图及导出图片享有使用权，可将其用于班级纪念、
          个人分享等非商业用途；如需用于商业用途，请事先与开发者联系并取得许可。前述使用权
          不及于导出图片中包含的地图底图数据与第三方字体（详见第七条），该等第三方素材的权利
          仍归其各自权利人所有，您应当遵守其各自的许可条款。
        </Clause>
        <Clause n="6.4">
          地图底图边界数据来源于阿里云 DataV.GeoAtlas 公开发布的 GeoJSON 数据
          （datav.aliyun.com）。该等数据仅供示意图展示用途，不作为中华人民共和国行政区划、
          国界或任何地理界线的正式依据；正式的行政区划与地图以国家有关主管部门公布的标准地图为准。
        </Clause>
        <Clause n="6.5">
          如您认为本服务中的任何内容侵犯您的知识产权或其他合法权益，请通过「关于」页面公示的方式
          与开发者联系，开发者将在核实后及时处理。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第七条　第三方素材与字体声明</SectionTitle>
        <Clause n="7.1">
          本服务内嵌使用的字体及其许可：（一）「马善政」毛笔楷书（MaShanZheng）与「思源黑体」
          （Noto Sans SC 子集），均依据 SIL Open Font License 1.1（SIL 开源字体许可证）发布；
          （二）阿里妈妈数黑体，由阿里妈妈出品并授权免费商用；（三）站酷小薇体、站酷高端黑，
          由站酷（ZCOOL）出品并授权免费商用。上述字体均以子集形式内嵌，字体版权归其各自权利人所有；
          您自行上传的字体，其授权与合规性由您自行负责。
        </Clause>
        <Clause n="7.2">
          本服务使用的中国地图省级边界 GeoJSON 数据来源于阿里云 DataV.GeoAtlas 公开数据集
          （数据源于高德开放平台），城市定位点坐标来源于同一数据集的行政区划中心点，
          其权利归相应数据提供方所有。
        </Clause>
        <Clause n="7.3">
          本软件基于下列开源组件构建：React、Vite、TypeScript、Tailwind CSS、shadcn/ui、
          Radix UI、React Router、SheetJS（xlsx）、html-to-image、lucide-react、sonner、
          @microsoft/clarity 等，各组件依据其各自的开源许可证（MIT / Apache-2.0 等）使用，
          相关权利归其各自权利人所有。
        </Clause>
        <Clause n="7.4">
          本条所述第三方素材与组件的许可条款优先适用于该等素材与组件；本协议的其他约定不构成对
          该等第三方许可条款的变更或限制。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第八条　免责声明</SectionTitle>
        <Clause n="8.1">
          本服务按<strong className="text-stone-700">「现状」和「现有可用性」</strong>提供。开发者不保证本服务在所有
          设备、浏览器上完全无差错、无中断地运行，不保证渲染结果与您的预期完全一致，亦不保证
          本服务不受第三方服务异常的影响。
        </Clause>
        <Clause n="8.2">
          因浏览器数据被清除、设备故障、浏览器兼容性问题或其他非因开发者故意或重大过失造成的
          本地数据丢失、导出失败或图片瑕疵，开发者不承担责任。
        </Clause>
        <Clause n="8.3">
          导出图片由您自行制作并传播。您对导出图片的用途独立承担责任；因导出图片的内容或传播行为
          引发的任何纠纷与法律责任，与开发者无涉。
        </Clause>
        <Clause n="8.4">
          因不可抗力（包括但不限于自然灾害、政府行为、网络攻击、基础电信运营商或云服务提供商
          故障）导致的服务中断或数据异常，开发者不承担责任，但将尽力及时恢复服务。
        </Clause>
        <Clause n="8.5">
          本服务为免费服务。在适用法律允许的最大范围内，开发者不对任何间接损失、预期利益损失或
          商誉损失承担责任；开发者依本协议应承担的全部责任，以法律不允许排除或限制的部分为限。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第九条　违约责任</SectionTitle>
        <Clause n="9.1">
          您违反本协议第四条（用户行为规范）、第六条（知识产权）项下任何约定的，应当承担相应的
          违约责任；给开发者或任何第三方造成损失的，应当依法赔偿。
        </Clause>
        <Clause n="9.2">
          对于您违反本协议的行为，开发者有权在技术可行的范围内采取警示、限制功能使用等必要措施，
          并保留依法追究责任的权利。
        </Clause>
        <Clause n="9.3">
          因您的违约行为导致开发者面临第三方索赔、行政处罚或诉讼的，您应当使开发者免受损害，
          并赔偿开发者因此支出的合理费用（包括但不限于诉讼费、律师费、公证费）。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第十条　协议的变更与终止</SectionTitle>
        <Clause n="10.1">
          开发者有权根据法律法规变化或本服务的功能调整修订本协议。修订后的协议将在本页面公布，
          自公布之日起生效。修订生效后您继续使用本服务的，视为您接受修订后的协议；如您不同意
          修订内容，请停止使用本服务。
        </Clause>
        <Clause n="10.2">
          您可以随时通过停止使用本服务并清除浏览器本地数据的方式终止本协议，无需另行通知开发者。
        </Clause>
        <Clause n="10.3">
          开发者依本协议第 3.4 条暂停或终止本服务的，本协议于服务终止时终止；但本协议中依其性质
          应当继续有效的条款（包括但不限于知识产权、免责声明、违约责任、法律适用与争议解决）
          在服务终止后继续有效。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第十一条　法律适用与争议解决</SectionTitle>
        <Clause n="11.1">
          本协议的订立、效力、解释、履行及争议解决，均适用中华人民共和国大陆地区法律
          （不含冲突规范）。
        </Clause>
        <Clause n="11.2">
          因本协议或本服务产生的任何争议，双方应首先友好协商解决；协商不成的，任何一方均有权
          将争议提交开发者所在地有管辖权的人民法院诉讼解决。
        </Clause>
      </section>

      <section className="space-y-2">
        <SectionTitle>第十二条　一般条款</SectionTitle>
        <Clause n="12.1">
          本协议任何条款被有权机关认定为无效或不可执行的，不影响其余条款的效力，其余条款
          继续有效并可执行。
        </Clause>
        <Clause n="12.2">
          开发者未行使或迟延行使本协议项下的任何权利，不构成对该权利的放弃；单次或部分行使
          任何权利，不妨碍其进一步行使该权利或其他权利。
        </Clause>
        <Clause n="12.3">
          本协议各条标题仅为方便阅读而设，不具有法律含义，不影响本协议的解释。
        </Clause>
        <Clause n="12.4">
          开发者联系方式：<a href="mailto:linkbrain@lingben.top" className="text-amber-700 underline-offset-2 hover:underline">linkbrain@lingben.top</a>
          （用于协议、隐私、素材授权等相关事宜的联系与通知）。
        </Clause>
        <Clause n="12.5">
          本协议自 2026 年 7 月 21 日起生效。
        </Clause>
      </section>

      <p className="rounded-xl border border-amber-200/70 bg-white/70 p-4 text-xs leading-6 text-stone-500">
        相关页面：
        <AppLink to="/privacy" className="text-amber-700 underline-offset-2 hover:underline">隐私政策</AppLink>
        {' · '}
        <AppLink to="/about" className="text-amber-700 underline-offset-2 hover:underline">关于</AppLink>
      </p>
    </StaticPageLayout>
  )
}
