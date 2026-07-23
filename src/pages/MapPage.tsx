import { useEffect, useMemo, useRef, useState, memo } from 'react'
import { Download, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMapData } from '@/store/MapDataContext'
import { resolveProvince, diagnoseUnlocated, inferCityFromUniversity } from '@/utils/geo'
import { slotFontFamily } from '@/utils/fonts'
import { getBadgeDataUrlSync, getUniInfoSync, prefetchBadgeDataUrls, prefetchUniversities, type UniInfo } from '@/utils/universities'
import { exportNodeToPng, renderNodeToPngDataUrl, ExportCancelledError, type ExportQuality } from '@/utils/exportImage'
import { consumeMapExportRequest, onGotoMapExport } from '@/utils/exportBus'
import { isWeChatBrowser } from '@/utils/wechat'
import { ChinaMap } from '@/components/map/ChinaMap'
import { APP_VERSION } from '@/version'
import { TeachersBlock } from '@/components/map/TeachersBlock'
import { OverseasBlock } from '@/components/map/OverseasBlock'
import { UnlocatedBlock } from '@/components/map/UnlocatedBlock'
import type { UniEnrichment } from '@/components/map/labels'
import '@/components/map/fonts.css'
import type { StudentEntry } from '@/types'

/**
 * 地图页面：顶部工具栏（导出 PNG）+ 整幅"蹭饭图"画布。
 * 画布为导出目标：标题区 / 地图 SVG / 老师名单 / 未定位提示 / 底部来源条 全部包含在内。
 * 标题按字符类型分段渲染：连续数字用「数字」字体、拉丁字母用「英文」字体、其余用「中文」字体。
 */

type RunKind = 'digit' | 'latin' | 'han'

/** 把标题按「数字 / 拉丁字母 / 其他（中文）」切段；空格与 ASCII 标点并入当前段，避免单词间掉字体。
    注意：全角括号（）等中文标点必须归入 han 段——若作为中性字符并入相邻数字段，
    会出现左括号在数字字体、右括号在中文字体的不一致 */
function splitTitleRuns(text: string): Array<{ text: string; kind: RunKind }> {
  const runs: Array<{ text: string; kind: RunKind }> = []
  const kindOf = (ch: string): RunKind | null => {
    if (ch >= '0' && ch <= '9') return 'digit'
    if (/[A-Za-z]/.test(ch)) return 'latin'
    if (/[\s&.,'’()\-–—]/.test(ch)) return null // 中性字符：并入当前段
    return 'han'
  }
  for (const ch of text) {
    const k = kindOf(ch) ?? runs[runs.length - 1]?.kind ?? 'han'
    const last = runs[runs.length - 1]
    if (last && last.kind === k) last.text += ch
    else runs.push({ text: ch, kind: k })
  }
  return runs
}

/** 生成时间戳（footer 左侧）：YYYY-MM-DD HH:mm */
function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 画布按 1500px 设计：px 字号 ÷ 15 = cqw，使 footer 字体随画布宽度同比例缩放（与老师/海外块一致） */
const cqw = (px: number): string => `${(px / 15).toFixed(3)}cqw`

/** 老师块拖动时画布高度逐帧变化会触发 MapPage 重渲染；ChinaMap 的 props 在此过程中
    全部稳定（memoized），用 memo 拦住整棵 SVG 子树的无效重渲染 */
const MemoChinaMap = memo(ChinaMap)

interface ExportProgress {
  pct: number
  stage: string
  /** 预计剩余秒数（null = 刚开始，还在估算） */
  etaSeconds: number | null
}

/** 长耗时阶段的轮换提示文案（假进度的心理按摩：文案常换，用户不觉得卡住） */
const PROGRESS_FILLERS = [
  '正在渲染地图轮廓…',
  '正在嵌入字体文件…',
  '正在绘制标注与引线…',
  '正在精修画面细节…',
  '正在进行超清栅格化…',
  '就快完成了，再等一下下…',
] as const

/** 导出进度模态框：居中原点卡片 + 百分比进度条 + 预计剩余时间 + 红色取消按钮，风格与全站一致 */
function ExportProgressDialog({
  progress,
  onCancel,
}: {
  progress: ExportProgress
  onCancel: () => void
}) {
  const pct = Math.min(100, Math.max(0, Math.round(progress.pct)))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-label="导出进度"
        className="w-80 rounded-xl border border-stone-200 bg-white p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-stone-500" />
          <h2 className="text-sm font-semibold text-stone-700">正在导出 PNG</h2>
          <span className="ml-auto text-sm font-medium text-stone-500 tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-stone-800 transition-[width] duration-150 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2.5 text-xs text-stone-400">{progress.stage}</p>
        <p className="mt-1 text-[11px] text-stone-300">
          {progress.etaSeconds === null
            ? '正在估算剩余时间…'
            : progress.etaSeconds <= 1
              ? '即将完成'
              : `预计还需约 ${progress.etaSeconds} 秒`}
        </p>
        {/* 红色取消按钮：导出可中断，避免长导出把用户困在进度框里 */}
        <button
          type="button"
          onClick={onCancel}
          className="mt-3.5 w-full rounded-lg border border-red-200 bg-red-50 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 hover:text-red-700"
        >
          取消导出
        </button>
      </div>
    </div>
  )
}

/** 微信环境导出完成后的保存弹窗：微信不支持 a[download]，图片直接展示，引导长按保存 */
function WeChatSaveDialog({
  dataUrl,
  onClose,
}: {
  dataUrl: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-label="保存图片"
        className="flex max-h-[90dvh] w-full max-w-sm flex-col rounded-xl border border-stone-200 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-700">图片已生成</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <img src={dataUrl} alt="蹭饭图导出结果" className="mx-auto w-full rounded-md" />
        </div>
        <p className="shrink-0 border-t border-stone-100 px-4 py-3 text-center text-xs leading-5 text-stone-500">
          微信中无法直接下载图片
          <br />
          <strong className="text-stone-700">请长按上方图片 → 保存到相册</strong>
        </p>
      </div>
    </div>
  )
}

export default function MapPage() {
  const { data, theme, fontSlots, customFonts, badge } = useMapData()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState<ExportQuality | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  /** 微信环境下导出完成的图片 dataURL（弹窗引导长按保存） */
  const [wechatImage, setWechatImage] = useState<string | null>(null)
  /** 进度锚点（真实阶段 + 到达时刻）与展示值（向锚点平滑爬行）分离，长耗时阶段也有前进感 */
  const anchorRef = useRef<{ pct: number; stage: string; at: number }>({ pct: 0, stage: '', at: 0 })
  /** 导出开始时刻（估算剩余时间用） */
  const exportStartRef = useRef(0)
  /** 已展示的剩余秒数（只减不增，避免假进度外推值越估越大引发焦虑） */
  const etaRef = useRef<number | null>(null)
  /** 本次导出的 AbortController：进度框红色「取消导出」按钮触发中断 */
  const exportAbortRef = useRef<AbortController | null>(null)
  /** 画布 flow 内容（标题+地图）与 footer 的 ref：老师块 top 锚定与画布加高测量用 */
  const flowRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  /** 画布渲染宽度（屏幕 px）：老师块向下拖出时换算画布加高量 */
  const [canvasW, setCanvasW] = useState(0)
  /** 老师块拖动中的实时偏移（设计 px）：画布高度与拖动同步伸缩，不等落库 */
  const [liveTeacherDy, setLiveTeacherDy] = useState<number | null>(null)
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCanvasW(el.clientWidth))
    ro.observe(el)
    setCanvasW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  /** 分模块字体栈：标题按字符类型分 数字/英文/中文 三槽位 */
  const digitFont = slotFontFamily('digit', fontSlots, customFonts)
  const latinFont = slotFontFamily('latin', fontSlots, customFonts)
  const hanFont = slotFontFamily('han', fontSlots, customFonts)

  // 进度爬行 + 文案轮换 + 剩余时间估算：
  // 每 120ms 向锚点靠近一点（不越过锚点 -2）；锚点文案展示 2.2s 后轮换"假进度"提示；
  // 按 已耗时/当前百分比 线性外推剩余秒数
  useEffect(() => {
    if (exporting === null) return
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (!prev) return prev
        const now = Date.now()
        const anchor = anchorRef.current
        // 爬行：未到锚点快爬（0.7/120ms）；到锚点后不停死，继续慢爬（0.06/120ms ≈ 0.5%/s），
        // 让用户始终看到数字在动；慢爬上限为锚点 +6 且不超过 99%
        let pct = prev.pct
        if (pct < anchor.pct - 2) {
          pct = Math.min(pct + 0.7, anchor.pct - 2)
        } else {
          pct = Math.min(pct + 0.06, Math.min(anchor.pct + 6, 99))
        }
        // 文案：锚点阶段先展示 2.2s，之后每 2.4s 轮换一条安抚提示
        const sinceAnchor = now - anchor.at
        const stage =
          sinceAnchor < 2200
            ? anchor.stage
            : PROGRESS_FILLERS[Math.floor(sinceAnchor / 2400) % PROGRESS_FILLERS.length]
        // 剩余时间：线性外推；<12% 时样本太少不估算；展示值只减不增
        const elapsed = (now - exportStartRef.current) / 1000
        let etaSeconds: number | null = etaRef.current
        if (pct >= 12 && elapsed > 0.5) {
          const computed = Math.min(90, Math.max(1, Math.round((elapsed * (100 - pct)) / pct)))
          etaSeconds = etaRef.current === null ? computed : Math.min(computed, etaRef.current)
          etaRef.current = etaSeconds
        }
        if (pct >= 100) etaSeconds = 1
        return { pct, stage, etaSeconds }
      })
    }, 120)
    return () => clearInterval(timer)
  }, [exporting])

  /** 院校数据（软科排名/校徽/城市补全）：名单变化时批量预取，失败自动回退本地推断 */
  const studentsKey = useMemo(
    () => data.students.map((s) => `${s.id}:${s.university}`).join('|'),
    [data.students],
  )
  const [uniTick, setUniTick] = useState(0)
  useEffect(() => {
    const names = studentsKey === '' ? [] : studentsKey.split('|').map((k) => k.split(':').slice(1).join(':'))
    if (names.length === 0) return
    let cancelled = false
    // 先取院校数据（排名/校徽 slug），再预取校徽图片并转 dataURL 缓存——
    // 渲染与导出都直接用内联数据，首次导出也不用等逐张图片内联
    prefetchUniversities(names)
      .then(() => {
        if (cancelled) return
        setUniTick((t) => t + 1)
        const withBadge = names.filter((n) => getUniInfoSync(n)?.b != null)
        return prefetchBadgeDataUrls(withBadge)
      })
      .then(() => {
        if (!cancelled) setUniTick((t) => t + 1)
      })
    return () => {
      cancelled = true
    }
  }, [studentsKey])

  /** 原始校名 → 院校补充信息（排序/校徽）；uniTick 仅用于预取完成后触发重算 */
  const uniInfo = useMemo(() => {
    const m = new Map<string, UniEnrichment>()
    for (const s of data.students) {
      const key = s.university.trim()
      if (key === '') continue
      const info: UniInfo | undefined = getUniInfoSync(key)
      const hasBadge = data.showBadges && info?.b != null
      m.set(key, {
        rank: info?.r ?? null,
        badge: hasBadge,
        badgeUrl: hasBadge ? (getBadgeDataUrlSync(key) ?? null) : null,
      })
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.students, data.showBadges, uniTick])

  /** 展示用学生列表：城市为空时用院校数据/本地推断补全（不回写录入数据；境外学生不推断） */
  const displayStudents = useMemo(
    () =>
      data.students.map((s) => {
        if (s.overseas === true) return s
        if (s.city.trim() !== '') return s
        const enriched = getUniInfoSync(s.university.trim())?.c ?? inferCityFromUniversity(s.university) ?? ''
        return enriched === '' ? s : { ...s, city: enriched }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.students, uniTick],
  )

  /** 学生 → 省份分组（保持录入顺序，保证色块与列序稳定）；
      境外学生单独收集（不指向地图），无法定位的单独收集 */
  const { groups, unlocated, overseas } = useMemo(() => {
    const g = new Map<string, StudentEntry[]>()
    const u: StudentEntry[] = []
    const o: StudentEntry[] = []
    for (const s of displayStudents) {
      if (s.overseas === true) {
        o.push(s)
        continue
      }
      const province = resolveProvince(s)
      if (province === null) {
        diagnoseUnlocated(s) // 控制台输出定位失败原因（每条目仅一次）
        u.push(s)
      } else {
        const list = g.get(province)
        if (list) list.push(s)
        else g.set(province, [s])
      }
    }
    return { groups: g, unlocated: u, overseas: o }
  }, [displayStudents])

  const hasHeader = data.title.trim() !== '' || data.subtitle.trim() !== ''
  /** 省内手动排序的省份集合（录入弹窗中拖动过顺序的省份） */
  const manualProvinces = useMemo(
    () => new Set(data.customOrderProvinces),
    [data.customOrderProvinces],
  )

  /** 老师块上拖/下拖的实时纵向偏移（设计 px）：拖动中即生效，画布与拖动同步伸缩 */
  const effTeacherDy = liveTeacherDy ?? data.teachersOffset.dy

  /** 左下角老师块的画布预留高度（设计 px）：
      基准 = 实际块高（标题行 (size+3)×1.4 + 名单 n×size×1.6 + 内边距 28）+ 底部边距 54——
      旧公式 (110+n×24)×1.3 对少人数高估 ~40%（1 个老师 174 vs 实际 ~125），底部白白留空；
      上拖（dy<0）时预留随之上收、画布同步缩小，块底恒距画布底 48px，拖出的空白被自动吃掉；
      预留耗尽（归 0）后块继续上移进入地图区——用户把块拖进地图是明确选择 */
  const teacherSize = data.labelSizes.teacher
  const baseReserveLeft =
    data.showTeachers && data.teachers.length > 0
      ? Math.round((teacherSize + 3) * 1.4 + data.teachers.length * teacherSize * 1.6 + 28 + 54)
      : 0
  const reserveLeftBottom = Math.max(0, baseReserveLeft + Math.min(0, Math.round(effTeacherDy)))
  const reserveRightBottom =
    (overseas.length > 0 ? Math.round(80 + overseas.length * 22) : 0) +
    (unlocated.length > 0 ? 130 : 0)

  /** 老师块下拖（dy>0）时的画布加高量（屏幕 px）：与省份卡片同语义——到达边界才扩充；
      块底原本距画布底 48px、页脚约 28px，向下拖的前 12px 不扩画布，
      继续下拖则画布 1:1 加高（块底始终留 页脚+8px 呼吸），往回拖立即缩回 */
  const teacherSpacerH =
    data.showTeachers && data.teachers.length > 0 && canvasW > 0 && effTeacherDy > 0
      ? Math.max(0, Math.round((effTeacherDy * canvasW) / 1500) - 12)
      : 0

  /* 排版建议已去弹窗化：推荐值以行内标注形式出现在「字体设置 / 列数设置」旁（见 FontPanel）。 */

  const alignClass =
    data.titleAlign === 'center'
      ? 'justify-center text-center'
      : data.titleAlign === 'right'
        ? 'justify-end text-right'
        : ''

  async function handleExport(quality: ExportQuality) {
    const node = canvasRef.current
    if (!node || exporting) return
    // 导出前清除卡片/老师块的选中态（虚线选择框不进导出图）
    node.dispatchEvent(new CustomEvent('cf-clear-selection'))
    setExporting(quality)
    setExportError(null)
    exportStartRef.current = Date.now()
    etaRef.current = null
    anchorRef.current = { pct: 4, stage: '正在启动导出…', at: Date.now() }
    setProgress({ pct: 4, stage: '正在启动导出…', etaSeconds: null })
    /** 本次导出的取消控制器：进度框的红色「取消导出」按钮触发 */
    const abort = new AbortController()
    exportAbortRef.current = abort
    // 等一拍：让 footer 的生成时间在克隆前刷新到当前时刻
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const onProgress = (pct: number, stage: string) => {
      anchorRef.current = { pct, stage, at: Date.now() }
      setProgress((prev) =>
        prev === null
          ? prev
          : { ...prev, pct: Math.max(prev.pct, Math.min(pct, anchorRef.current.pct)), stage },
      )
    }
    try {
      if (isWeChatBrowser()) {
        // 微信不支持 a[download]：渲染出 dataURL，弹窗引导用户长按保存
        const r = await renderNodeToPngDataUrl(node, quality, onProgress, abort.signal)
        setWechatImage(r.dataUrl)
      } else {
        await exportNodeToPng(node, data.title, quality, onProgress, abort.signal)
      }
    } catch (err) {
      if (err instanceof ExportCancelledError) {
        // 用户主动取消：静默收尾，不算失败
        console.info('[导出] 用户取消了导出')
      } else {
        console.error('导出 PNG 失败', err)
        setExportError('导出失败，请重试')
      }
    } finally {
      exportAbortRef.current = null
      setExporting(null)
      setProgress(null)
    }
  }

  /** 取消进行中的导出（进度框红色按钮） */
  function handleCancelExport() {
    exportAbortRef.current?.abort()
  }

  // 录入页「预览并导出为图片」：
  // - 移动端切 Tab 后本页重新挂载 → 挂载时消费一次性请求后自动导出
  // - 桌面端本页常驻不重新挂载 → 监听事件，消费请求后直接导出
  const handleExportRef = useRef(handleExport)
  handleExportRef.current = handleExport
  useEffect(() => {
    const schedule = () => {
      // 略等首屏渲染与校徽预取启动，避免导出到未完成的画面
      setTimeout(() => void handleExportRef.current('ultra'), 900)
    }
    if (consumeMapExportRequest()) schedule() // 挂载前已有请求（移动端切 Tab 场景）
    return onGotoMapExport(() => {
      if (consumeMapExportRequest()) schedule() // 常驻时收到请求（桌面端场景）
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏（不参与导出） */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-stone-700">蹭饭图预览</h1>
          <p className="truncate text-xs text-stone-400">
            {exportError ?? '随录入实时更新 · 超清导出 ≥4000px 宽'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleExport('standard')}
            disabled={exporting !== null}
            className="text-stone-500 hover:text-stone-700"
            title="普通清晰度（约 2 倍图，体积小）"
          >
            {exporting === 'standard' ? <Loader2 className="animate-spin" /> : null}
            普通
          </Button>
          <Button
            size="sm"
            onClick={() => handleExport('ultra')}
            disabled={exporting !== null}
            className="bg-stone-900 text-white hover:bg-stone-700"
            title="超清矢量栅格化导出（≥4000px 宽）"
          >
            {exporting === 'ultra' ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Download />
            )}
            {exporting === 'ultra' ? '导出中…' : '导出超清 PNG'}
          </Button>
        </div>
      </header>

      {/* 移动端常驻提示：可以录入与预览，但建议到电脑端生成导出 */}
      <p className="shrink-0 border-b border-amber-200/60 bg-amber-50 px-4 py-1.5 text-center text-[11px] text-amber-700 md:hidden">
        手机端可录入与预览 · 非常建议到电脑端生成导出高清图片
      </p>

      {/* 画布滚动区：移动端画布保持最小宽度，可横纵滚动查看 */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[680px] p-3 md:p-5">
          <div
            ref={canvasRef}
            data-testid="map-canvas"
            className="cf-map-canvas relative overflow-hidden rounded-xl border shadow-sm select-none"
            onDragStart={(e) => e.preventDefault()}
            onPointerDown={() => {
              // 点击画布空白处清除卡片/老师块选中态（虚线选择框消失）；
              // 点卡片/老师块时它们各自 stopPropagation，不会触发此清除
              canvasRef.current?.dispatchEvent(new CustomEvent('cf-clear-selection'))
            }}
            style={{
              background: theme.canvasBg,
              borderColor: `color-mix(in srgb, ${theme.leaderLine} 45%, transparent)`,
              // 容器查询单位（cqw）：让老师/海外/未定位等 HTML 覆盖层与 SVG 标注同比例缩放，
              // 画布按 1500px 设计 → 1cqw = 15px（见 TeachersBlock 等）
              containerType: 'inline-size',
            }}
          >
            {/* flow 内容（标题区 + 地图主体）：老师块 top 锚定的测量基准 */}
            <div ref={flowRef}>
            {/* 标题区：班徽 + 大标题（数字/英文/中文三种字体分段）+ 英文副标题；titleAlign 控制居左/中/右 */}
            {hasHeader && (
              <div className={`px-8 pt-6 pb-1 ${alignClass}`}>
                <div className={`flex flex-wrap items-end gap-x-4 gap-y-1 ${alignClass}`}>
                  {badge !== null && (
                    <img
                      src={badge}
                      alt="班徽"
                      draggable={false}
                      className="mb-0.5 h-12 w-12 rounded-full object-contain"
                    />
                  )}
                  {data.title.trim() !== '' && (
                    <span
                      className="pb-1"
                      style={{
                        fontFamily: hanFont,
                        fontSize: `${data.titleSize}px`,
                        color: theme.titleColor,
                      }}
                    >
                      {splitTitleRuns(data.title).map((run, i) =>
                        run.kind === 'digit' ? (
                          <span
                            key={i}
                            style={{ fontFamily: digitFont, fontWeight: 700, fontSize: '1.12em' }}
                          >
                            {run.text}
                          </span>
                        ) : run.kind === 'latin' ? (
                          <span key={i} style={{ fontFamily: latinFont }}>
                            {run.text}
                          </span>
                        ) : (
                          <span key={i}>{run.text}</span>
                        ),
                      )}
                    </span>
                  )}
                </div>
                {data.subtitle.trim() !== '' && (
                  <p
                    className="mt-1 text-sm tracking-[0.25em] uppercase opacity-70"
                    style={{ fontFamily: latinFont, color: theme.titleColor }}
                  >
                    {data.subtitle}
                  </p>
                )}
              </div>
            )}

            {/* 地图主体（含标注列与引线）；左右下角覆盖层换算为画布预留高度，避免压字 */}
            <MemoChinaMap
              groups={groups}
              reserveLeftBottom={reserveLeftBottom}
              reserveRightBottom={reserveRightBottom}
              uniInfo={uniInfo}
              labelSizes={data.labelSizes}
              labelColumns={data.labelColumns}
              manualProvinces={manualProvinces}
              calligraphy={data.calligraphy}
              badgeOverrides={data.badgeOverrides}
            />
            </div>

            {/* 老师块向下拖出时撑开画布的占位（flow 之后、footer 之前，footer 仍在画布最底部） */}
            {teacherSpacerH > 0 && <div aria-hidden style={{ height: teacherSpacerH }} />}

            {/* 无数据时的温和提示 */}
            {data.students.length === 0 && (
              <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/70 px-4 py-2 text-sm text-stone-500">
                还没有同学数据，先到录入页添加吧
              </p>
            )}

            <TeachersBlock teachers={data.teachers} flowRef={flowRef} footerRef={footerRef} onLiveDy={setLiveTeacherDy} reserveDesign={baseReserveLeft} />

            {/* 右下角堆叠区：海外/境外名单在上、未定位提示在下 */}
            {(overseas.length > 0 || unlocated.length > 0) && (
              <div className="absolute right-4 bottom-12 z-10 flex max-w-[42%] flex-col items-end gap-2">
                <OverseasBlock students={overseas} />
                <UnlocatedBlock students={unlocated} />
              </div>
            )}

            {/* 底部来源条：画布的一部分，随导出一起进 PNG。
                左侧生成时间，中央生成信息（map.linkbrain.top 以黑色圆角 pill 突出显示），右侧软件版本号；
                字体/内边距用 cqw 随画布宽度缩放，地图变大时 footer 字体相应放大，保持视觉协调。
                基准 13px（与学生名一致）：图片特别大时 footer 不会显得过小 */}
            <div
              ref={footerRef}
              className="relative flex items-center border-t text-stone-400"
              style={{
                backgroundColor: theme.footerBg,
                borderColor: `color-mix(in srgb, ${theme.leaderLine} 40%, transparent)`,
                fontFamily: '"NotoSansSC","PingFang SC","Microsoft YaHei",sans-serif',
                fontSize: cqw(13),
                padding: `${cqw(7)} ${cqw(16)}`,
              }}
            >
              <span className="tabular-nums">生成于 {formatNow()}</span>
              <span className="absolute left-1/2 inline-flex w-fit -translate-x-1/2 items-center justify-center text-center whitespace-nowrap">
                本图片由
                <span
                  style={{
                    backgroundColor: '#000',
                    color: '#fff',
                    borderRadius: cqw(5),
                    padding: `${cqw(2)} ${cqw(8)}`,
                    margin: `0 ${cqw(5)}`,
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                  }}
                >
                  map.linkbrain.top
                </span>
                生成 © {new Date().getFullYear()} 零本
              </span>
              <span className="ml-auto tabular-nums">v{APP_VERSION}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 导出进度模态框 */}
      {exporting !== null && progress !== null && <ExportProgressDialog progress={progress} onCancel={handleCancelExport} />}

      {/* 微信环境：图片生成后引导长按保存 */}
      {wechatImage !== null && (
        <WeChatSaveDialog dataUrl={wechatImage} onClose={() => setWechatImage(null)} />
      )}
    </div>
  )
}
