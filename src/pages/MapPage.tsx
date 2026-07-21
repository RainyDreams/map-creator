import { useMemo, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMapData } from '@/store/MapDataContext'
import { resolveProvince } from '@/utils/geo'
import { exportNodeToPng, type ExportQuality } from '@/utils/exportImage'
import { ChinaMap } from '@/components/map/ChinaMap'
import { TeachersBlock } from '@/components/map/TeachersBlock'
import { UnlocatedBlock } from '@/components/map/UnlocatedBlock'
import type { StudentEntry } from '@/types'

/**
 * 地图页面：顶部工具栏（导出 PNG）+ 整幅"蹭饭图"画布。
 * 画布为导出目标：标题区 / 地图 SVG / 老师名单 / 未定位提示 / 底部来源条 全部包含在内。
 */
export default function MapPage() {
  const { data } = useMapData()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState<ExportQuality | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  /** 学生 → 省份分组（保持录入顺序，保证色块与列序稳定）；无法定位的单独收集 */
  const { groups, unlocated } = useMemo(() => {
    const g = new Map<string, StudentEntry[]>()
    const u: StudentEntry[] = []
    for (const s of data.students) {
      const province = resolveProvince(s)
      if (province === null) {
        u.push(s)
      } else {
        const list = g.get(province)
        if (list) list.push(s)
        else g.set(province, [s])
      }
    }
    return { groups: g, unlocated: u }
  }, [data.students])

  const hasHeader = data.year.trim() !== '' || data.title.trim() !== ''

  async function handleExport(quality: ExportQuality) {
    const node = canvasRef.current
    if (!node || exporting) return
    setExporting(quality)
    setExportError(null)
    try {
      await exportNodeToPng(node, data.title, data.year, quality)
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
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200/70 bg-white/70 px-4 py-2.5">
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
            className="bg-amber-600 text-white hover:bg-amber-700"
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

      {/* 画布滚动区：移动端画布保持最小宽度，可横纵滚动查看 */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[680px] p-3 md:p-5">
          <div
            ref={canvasRef}
            data-testid="map-canvas"
            className="relative overflow-hidden rounded-xl border border-amber-200/60 shadow-sm"
            style={{
              background:
                'radial-gradient(ellipse at 32% 18%, #fdf6df 0%, #f9edcb 55%, #f4e2b4 100%)',
            }}
          >
            {/* 标题区：年份艺术字 + 班级标题（均为空时不渲染占位） */}
            {hasHeader && (
              <div className="flex flex-wrap items-end gap-x-5 gap-y-1 px-8 pt-6 pb-1">
                {data.year.trim() !== '' && (
                  <span
                    className="font-calligraphy text-6xl leading-none tracking-wider text-amber-600"
                    style={{
                      textShadow: '1px 2px 0 rgba(255,255,255,0.65), 2px 5px 10px rgba(180,120,30,0.25)',
                      transform: 'skewX(-5deg)',
                    }}
                  >
                    {data.year}
                  </span>
                )}
                {data.title.trim() !== '' && (
                  <span className="font-calligraphy pb-1 text-3xl text-stone-700">
                    {data.title}
                  </span>
                )}
              </div>
            )}

            {/* "蹭饭图"三个大字：右侧竖排，书法感朱红 */}
            <div
              aria-hidden
              className="font-calligraphy pointer-events-none absolute top-16 right-2 z-10 leading-none select-none"
              style={{
                writingMode: 'vertical-rl',
                fontSize: '58px',
                letterSpacing: '0.12em',
                color: '#b0312a',
                opacity: 0.92,
                textShadow: '1px 2px 0 rgba(255,255,255,0.55), 2px 5px 12px rgba(160,60,30,0.28)',
              }}
            >
              蹭饭图
            </div>

            {/* 地图主体（含标注列与引线）；左右下角覆盖层换算为画布预留高度，避免压字 */}
            <ChinaMap
              groups={groups}
              reserveLeftBottom={
                data.teachers.length > 0
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

            {/* 底部来源条：画布的一部分，随导出一起进 PNG；极小字、克制不喧宾夺主 */}
            <div className="border-t border-amber-200/50 bg-[#f6ecd3] py-1.5 text-center">
              <span className="text-[10px] tracking-[0.18em] text-stone-400">
                本图片由 map.linkbrain.top 生成
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
