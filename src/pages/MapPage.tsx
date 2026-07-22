import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMapData } from '@/store/MapDataContext'
import { resolveProvince, diagnoseUnlocated, inferCityFromUniversity } from '@/utils/geo'
import { slotFontFamily } from '@/utils/fonts'
import { getBadgeDataUrlSync, getUniInfoSync, prefetchBadgeDataUrls, prefetchUniversities, type UniInfo } from '@/utils/universities'
import { exportNodeToPng, type ExportQuality } from '@/utils/exportImage'
import { ChinaMap } from '@/components/map/ChinaMap'
import { TeachersBlock } from '@/components/map/TeachersBlock'
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

/** 把标题按「数字 / 拉丁字母 / 其他（中文）」切段；空格与常见标点并入当前段，避免单词间掉字体 */
function splitTitleRuns(text: string): Array<{ text: string; kind: RunKind }> {
  const runs: Array<{ text: string; kind: RunKind }> = []
  const kindOf = (ch: string): RunKind | null => {
    if (ch >= '0' && ch <= '9') return 'digit'
    if (/[A-Za-z]/.test(ch)) return 'latin'
    if (/[\s&.,'’()（）\-–—]/.test(ch)) return null // 中性字符：并入当前段
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

/** 导出进度模态框：居中原点卡片 + 百分比进度条 + 预计剩余时间，风格与全站一致 */
function ExportProgressDialog({ progress }: { progress: ExportProgress }) {
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
  /** 进度锚点（真实阶段 + 到达时刻）与展示值（向锚点平滑爬行）分离，长耗时阶段也有前进感 */
  const anchorRef = useRef<{ pct: number; stage: string; at: number }>({ pct: 0, stage: '', at: 0 })
  /** 导出开始时刻（估算剩余时间用） */
  const exportStartRef = useRef(0)
  /** 已展示的剩余秒数（只减不增，避免假进度外推值越估越大引发焦虑） */
  const etaRef = useRef<number | null>(null)

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

  /** 展示用学生列表：城市为空时用院校数据/本地推断补全（不回写录入数据） */
  const displayStudents = useMemo(
    () =>
      data.students.map((s) => {
        if (s.city.trim() !== '') return s
        const enriched = getUniInfoSync(s.university.trim())?.c ?? inferCityFromUniversity(s.university) ?? ''
        return enriched === '' ? s : { ...s, city: enriched }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.students, uniTick],
  )

  /** 学生 → 省份分组（保持录入顺序，保证色块与列序稳定）；无法定位的单独收集 */
  const { groups, unlocated } = useMemo(() => {
    const g = new Map<string, StudentEntry[]>()
    const u: StudentEntry[] = []
    for (const s of displayStudents) {
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
    return { groups: g, unlocated: u }
  }, [displayStudents])

  const hasHeader = data.title.trim() !== '' || data.subtitle.trim() !== ''
  /** 省内手动排序的省份集合（录入弹窗中拖动过顺序的省份） */
  const manualProvinces = useMemo(
    () => new Set(data.customOrderProvinces),
    [data.customOrderProvinces],
  )
  const alignClass =
    data.titleAlign === 'center'
      ? 'justify-center text-center'
      : data.titleAlign === 'right'
        ? 'justify-end text-right'
        : ''

  async function handleExport(quality: ExportQuality) {
    const node = canvasRef.current
    if (!node || exporting) return
    setExporting(quality)
    setExportError(null)
    exportStartRef.current = Date.now()
    etaRef.current = null
    anchorRef.current = { pct: 4, stage: '正在启动导出…', at: Date.now() }
    setProgress({ pct: 4, stage: '正在启动导出…', etaSeconds: null })
    // 等一拍：让 footer 的生成时间在克隆前刷新到当前时刻
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    try {
      await exportNodeToPng(node, data.title, quality, (pct, stage) => {
        anchorRef.current = { pct, stage, at: Date.now() }
        setProgress((prev) =>
          prev === null
            ? prev
            : { ...prev, pct: Math.max(prev.pct, Math.min(pct, anchorRef.current.pct)), stage },
        )
      })
    } catch (err) {
      console.error('导出 PNG 失败', err)
      setExportError('导出失败，请重试')
    } finally {
      setExporting(null)
      setProgress(null)
    }
  }

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
            className="relative overflow-hidden rounded-xl border shadow-sm"
            style={{
              background: theme.canvasBg,
              borderColor: `color-mix(in srgb, ${theme.leaderLine} 45%, transparent)`,
            }}
          >
            {/* 标题区：班徽 + 大标题（数字/英文/中文三种字体分段）+ 英文副标题；titleAlign 控制居左/中/右 */}
            {hasHeader && (
              <div className={`px-8 pt-6 pb-1 ${alignClass}`}>
                <div className={`flex flex-wrap items-end gap-x-4 gap-y-1 ${alignClass}`}>
                  {badge !== null && (
                    <img
                      src={badge}
                      alt="班徽"
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
            <ChinaMap
              groups={groups}
              reserveLeftBottom={
                data.showTeachers && data.teachers.length > 0
                  ? Math.round((110 + data.teachers.length * 24) * 1.3)
                  : 0
              }
              reserveRightBottom={unlocated.length > 0 ? 200 : 0}
              uniInfo={uniInfo}
              labelSizes={data.labelSizes}
              manualProvinces={manualProvinces}
              calligraphy={data.calligraphy}
            />

            {/* 无数据时的温和提示 */}
            {data.students.length === 0 && (
              <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/70 px-4 py-2 text-sm text-stone-500">
                还没有同学数据，先到录入页添加吧
              </p>
            )}

            <TeachersBlock teachers={data.teachers} />
            <UnlocatedBlock students={unlocated} />

            {/* 底部来源条：画布的一部分，随导出一起进 PNG。
                左侧生成时间，中央生成信息（字距正常、极小字、克制不喧宾夺主）；字体固定思源黑体 */}
            <div
              className="relative flex items-center border-t px-4 py-1.5 text-[10px] text-stone-400"
              style={{
                backgroundColor: theme.footerBg,
                borderColor: `color-mix(in srgb, ${theme.leaderLine} 40%, transparent)`,
                fontFamily: '"NotoSansSC","PingFang SC","Microsoft YaHei",sans-serif',
              }}
            >
              <span className="tabular-nums">生成于 {formatNow()}</span>
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                本图片由 map.linkbrain.top 生成 © {new Date().getFullYear()} 零本
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 导出进度模态框 */}
      {exporting !== null && progress !== null && <ExportProgressDialog progress={progress} />}
    </div>
  )
}
