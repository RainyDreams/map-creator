import { useMemo, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMapData } from '@/store/MapDataContext'
import { resolveProvince, diagnoseUnlocated } from '@/utils/geo'
import { slotFontFamily } from '@/utils/fonts'
import { exportNodeToPng, type ExportQuality } from '@/utils/exportImage'
import { ChinaMap } from '@/components/map/ChinaMap'
import { TeachersBlock } from '@/components/map/TeachersBlock'
import { UnlocatedBlock } from '@/components/map/UnlocatedBlock'
import '@/components/map/fonts.css'
import type { StudentEntry } from '@/types'

/**
 * 地图页面：顶部工具栏（导出 PNG）+ 整幅"蹭饭图"画布。
 * 画布为导出目标：标题区 / 地图 SVG / 老师名单 / 未定位提示 / 底部来源条 全部包含在内。
 * 大标题中连续数字段用「数字字体」槽位渲染（如 2026 用数黑体，其余文字用毛笔体）。
 */
/** 把标题按「连续数字 / 非数字」切段 */
function splitTitleSegments(text: string): Array<{ text: string; digit: boolean }> {
  return text
    .split(/(\d+)/g)
    .filter((s) => s !== '')
    .map((s) => ({ text: s, digit: /^\d+$/.test(s) }))
}

export default function MapPage() {
  const { data, theme, fontSlots, customFonts, badge } = useMapData()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState<ExportQuality | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  /** 分模块字体栈 */
  const digitFont = slotFontFamily('year', fontSlots, customFonts)
  const titleFont = slotFontFamily('title', fontSlots, customFonts)

  /** 学生 → 省份分组（保持录入顺序，保证色块与列序稳定）；无法定位的单独收集 */
  const { groups, unlocated } = useMemo(() => {
    const g = new Map<string, StudentEntry[]>()
    const u: StudentEntry[] = []
    for (const s of data.students) {
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
  }, [data.students])

  const hasHeader = data.title.trim() !== '' || data.subtitle.trim() !== ''
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
    try {
      await exportNodeToPng(node, data.title, quality)
    } catch (err) {
      console.error('导出 PNG 失败', err)
      setExportError('导出失败，请重试')
    } finally {
      setExporting(null)
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
            className="relative overflow-hidden rounded-xl border border-amber-200/60 shadow-sm"
            style={{ background: theme.canvasBg }}
          >
            {/* 「蹭饭图」背景大字预设：半透明超大字衬在地图后面（DOM 在地图之前，自然压在底层） */}
            {data.bigTextStyle === 'background' && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center leading-none select-none"
                style={{
                  fontFamily: titleFont,
                  fontSize: 'clamp(120px, 24vw, 260px)',
                  letterSpacing: '0.08em',
                  color: theme.accent,
                  opacity: 0.08,
                }}
              >
                蹭饭图
              </div>
            )}

            {/* 标题区：班徽 + 大标题（数字段专用字体）+ 跟随式「蹭饭图」+ 英文副标题；titleAlign 控制居左/中/右 */}
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
                        fontFamily: titleFont,
                        fontSize: `${data.titleSize}px`,
                        color: theme.titleColor,
                      }}
                    >
                      {splitTitleSegments(data.title).map((seg, i) =>
                        seg.digit ? (
                          <span
                            key={i}
                            style={{
                              fontFamily: digitFont,
                              fontWeight: 700,
                              fontSize: '1.12em',
                            }}
                          >
                            {seg.text}
                          </span>
                        ) : (
                          <span key={i}>{seg.text}</span>
                        ),
                      )}
                    </span>
                  )}
                  {data.bigTextStyle === 'inline' && (
                    <span
                      className="pb-1 leading-none"
                      style={{
                        fontFamily: titleFont,
                        fontSize: `${Math.round(data.titleSize * 1.15)}px`,
                        color: theme.accent,
                        textShadow:
                          '1px 2px 0 rgba(255,255,255,0.55), 2px 5px 12px rgba(160,60,30,0.22)',
                      }}
                    >
                      蹭饭图
                    </span>
                  )}
                </div>
                {data.subtitle.trim() !== '' && (
                  <p
                    className="mt-1 text-sm tracking-[0.25em] uppercase opacity-70"
                    style={{ fontFamily: titleFont, color: theme.titleColor }}
                  >
                    {data.subtitle}
                  </p>
                )}
              </div>
            )}

            {/* 「蹭饭图」右侧竖排大字预设（经典样式） */}
            {data.bigTextStyle === 'vertical' && (
              <div
                aria-hidden
                className="pointer-events-none absolute top-16 right-2 z-10 leading-none select-none"
                style={{
                  fontFamily: titleFont,
                  writingMode: 'vertical-rl',
                  fontSize: '58px',
                  letterSpacing: '0.12em',
                  color: theme.accent,
                  opacity: 0.92,
                  textShadow: '1px 2px 0 rgba(255,255,255,0.55), 2px 5px 12px rgba(160,60,30,0.28)',
                }}
              >
                蹭饭图
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
            />

            {/* 无数据时的温和提示 */}
            {data.students.length === 0 && (
              <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/70 px-4 py-2 text-sm text-stone-500">
                还没有同学数据，先到录入页添加吧
              </p>
            )}

            <TeachersBlock teachers={data.teachers} />
            <UnlocatedBlock students={unlocated} />

            {/* 底部来源条：画布的一部分，随导出一起进 PNG；极小字、克制不喧宾夺主。
                按需求方案 A：导出图不放免责声明长句，只留超小字数据来源 */}
            <div
              className="border-t border-amber-200/50 py-1.5 text-center"
              style={{ backgroundColor: theme.footerBg }}
            >
              <div className="text-[10px] tracking-[0.18em] text-stone-400">
                <p>本图片由 map.linkbrain.top 生成</p>
                <p className="mt-0.5 text-[8px] tracking-normal text-stone-400/70">
                  地图数据来源：阿里云 DataV.GeoAtlas（高德开放平台）
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
