import { useMemo, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMapData } from '@/store/MapDataContext'
import { resolveProvince } from '@/utils/geo'
import { exportNodeToPng } from '@/utils/exportImage'
import { ChinaMap } from '@/components/map/ChinaMap'
import { TeachersBlock } from '@/components/map/TeachersBlock'
import { UnlocatedBlock } from '@/components/map/UnlocatedBlock'
import type { StudentEntry } from '@/types'

const KAITI = '"Kaiti SC","STKaiti","KaiTi","楷体",serif'

/**
 * 地图页面：顶部工具栏（导出 PNG）+ 整幅"蹭饭图"画布。
 * 画布为导出目标：标题区 / 地图 SVG / 老师名单 / 未定位提示 全部包含在内。
 */
export default function MapPage() {
  const { data } = useMapData()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
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

  async function handleExport() {
    const node = canvasRef.current
    if (!node || exporting) return
    setExporting(true)
    setExportError(null)
    try {
      await exportNodeToPng(node, data.title, data.year)
    } catch (err) {
      console.error('导出 PNG 失败', err)
      setExportError('导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏（不参与导出） */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-200/70 bg-white/70 px-4 py-2.5">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-stone-700">蹭饭图预览</h1>
          <p className="truncate text-xs text-stone-400">
            {exportError ?? '随录入实时更新 · 可导出高清 PNG'}
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          className="shrink-0 bg-amber-600 text-white hover:bg-amber-700"
        >
          {exporting ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Download />
          )}
          {exporting ? '导出中…' : '导出 PNG'}
        </Button>
      </header>

      {/* 画布滚动区：移动端画布保持最小宽度，可横纵滚动查看 */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[680px] p-3 md:p-5">
          <div
            ref={canvasRef}
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
                    className="text-6xl leading-none font-bold tracking-wider text-amber-600"
                    style={{
                      fontFamily: KAITI,
                      textShadow: '1px 2px 0 rgba(255,255,255,0.65), 2px 5px 10px rgba(180,120,30,0.25)',
                      transform: 'skewX(-5deg)',
                    }}
                  >
                    {data.year}
                  </span>
                )}
                {data.title.trim() !== '' && (
                  <span
                    className="pb-1 text-2xl font-semibold text-stone-700"
                    style={{ fontFamily: KAITI }}
                  >
                    {data.title}
                  </span>
                )}
              </div>
            )}

            {/* "蹭饭图"三个大字：右侧竖排，书法感朱红 */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-16 right-2 z-10 leading-none font-bold select-none"
              style={{
                writingMode: 'vertical-rl',
                fontFamily: KAITI,
                fontSize: '58px',
                letterSpacing: '0.12em',
                color: '#b0312a',
                opacity: 0.92,
                textShadow: '1px 2px 0 rgba(255,255,255,0.55), 2px 5px 12px rgba(160,60,30,0.28)',
              }}
            >
              蹭饭图
            </div>

            {/* 地图主体（含标注列与引线） */}
            <ChinaMap groups={groups} />

            {/* 无数据时的温和提示 */}
            {data.students.length === 0 && (
              <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/70 px-4 py-2 text-sm text-stone-500">
                还没有同学数据，先到录入页添加吧
              </p>
            )}

            <TeachersBlock teachers={data.teachers} />
            <UnlocatedBlock students={unlocated} />
          </div>
        </div>
      </div>
    </div>
  )
}
