import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Section } from '@/components/entry/Section'
import { ChevronRight, GraduationCap, MapPinOff, PencilLine } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { StudentGroupModal } from '@/components/entry/StudentGroupModal'
import { useMapData } from '@/store/MapDataContext'
import { breadcrumb } from '@/utils/sessionLog'
import type { StudentEntry } from '@/types'
import { resolveProvince } from '@/utils/geo'

function isRowEmpty(s: StudentEntry): boolean {
  return !s.name.trim() && !s.university.trim() && !s.city.trim()
}

/** 行非空但解析不出省份 → 无法在地图上定位 */
function needsLocationHint(s: StudentEntry): boolean {
  if (isRowEmpty(s)) return false
  return resolveProvince({ city: s.city, university: s.university }) === null
}

/**
 * 学生名单（只读展示，PC 与移动端一致）：
 * - 外面只展示前 5 位（避免长名单把录入页拉得很长）；
 *   完整名单在点击后弹出的「按省份分组」录入面板中查看；
 * - 此处只展示信息，不可编辑、不可排序；
 * - 全部编辑（增删改、省份/城市选择、组内排序、毛笔字图片）都在录入面板中进行。
 */
/** 外部预览行数：只显示前几位，其余在录入面板中查看 */
const PREVIEW_COUNT = 5
export default function StudentTable() {
  const { data, setData } = useMapData()
  const students = data.students
  const [modalOpen, setModalOpen] = useState(false)
  /** 点击某行时，面板打开后滚动定位并高亮该学生 */
  const [focusId, setFocusId] = useState<string | null>(null)

  const filled = students.filter((s) => !isRowEmpty(s))
  const filledCount = filled.length
  const preview = filled.slice(0, PREVIEW_COUNT)
  const hiddenCount = filledCount - preview.length

  return (
    <Section
      icon={GraduationCap}
      title="学生名单"
      summary={filledCount > 0 ? `已填 ${filledCount} 人` : undefined}
    >
      <div className="space-y-2 md:space-y-2.5">
        {students.length === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-center text-xs text-stone-500 md:py-6 md:text-sm">
            还没有学生，点击下方按钮打开录入面板
          </p>
        )}

        {/* 只读行（仅前 5 位预览）：点击任意一行打开录入面板 */}
        {preview.map((s, index) => {
          const warn = needsLocationHint(s)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setFocusId(s.id)
                setModalOpen(true)
              }}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                warn
                  ? 'border-amber-400/70 bg-amber-50/50 hover:bg-amber-50'
                  : 'border-stone-200 bg-stone-50/50 hover:bg-stone-100/70'
              }`}
            >
              <span className="w-6 shrink-0 text-center text-xs tabular-nums text-stone-400">
                {index + 1}
              </span>
              <span className="shrink-0 text-xs font-medium text-stone-800 md:text-sm">
                {s.name.trim() || '（未命名）'}
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-xs text-stone-500 md:text-sm">
                {s.university || '（未填大学）'}
                {s.city.trim() !== '' ? ` · ${s.city}` : ''}
              </span>
              {warn && <MapPinOff className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-300" />
            </button>
          )
        })}

        {/* 超出预览的其余同学：引导到录入面板查看完整名单 */}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setFocusId(null)
              setModalOpen(true)
            }}
            className="w-full rounded-lg border border-dashed border-stone-300 bg-stone-50/60 px-3 py-2 text-center text-xs text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 md:text-sm"
          >
            还有 {hiddenCount} 人 · 打开录入面板查看全部 {filledCount} 人
          </button>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setFocusId(null)
            setModalOpen(true)
          }}
          className="h-9 w-full border-stone-300 text-xs text-stone-600 hover:bg-stone-100 hover:text-stone-900 md:text-sm"
        >
          <PencilLine className="h-4 w-4" />
          {students.length === 0 ? '打开录入面板，添加同学' : '编辑名单 / 添加同学'}
        </Button>
        {/* 名字一键隐私：仅影响地图与导出图片的显示，原始名单保留在本机 */}
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2">
          <span className="min-w-0">
            <span className="block text-xs font-medium text-stone-700 md:text-sm">
              名字一键隐私
            </span>
            <span className="block text-[11px] leading-4 text-stone-400 md:text-xs">
              地图与导出图片中显示为「姓+同学」，原始名单只保留在本机
            </span>
          </span>
          <Switch
            checked={data.anonymizeNames}
            onCheckedChange={(v) => { breadcrumb(`名单：名字一键隐私${v ? '：开' : '：关'}`); setData((prev) => ({ ...prev, anonymizeNames: v })) }}
            aria-label="名字一键隐私"
          />
        </label>
        {/* 录入更详细的信息：开启后录入面板每位同学可填录取专业与高考分数（仅留存，不上图） */}
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2">
          <span className="min-w-0">
            <span className="block text-xs font-medium text-stone-700 md:text-sm">
              录入更详细的信息
            </span>
            <span className="block text-[11px] leading-4 text-stone-400 md:text-xs">
              录入面板中每位同学可填写录取专业与高考分数
            </span>
          </span>
          <Switch
            checked={data.detailedInfo}
            onCheckedChange={(v) => { breadcrumb(`名单：录入更详细的信息${v ? '：开' : '：关'}`); setData((prev) => ({ ...prev, detailedInfo: v })) }}
            aria-label="录入更详细的信息"
          />
        </label>
        <p className="text-center text-xs text-stone-400">
          仅预览前 {PREVIEW_COUNT} 位；完整名单的查看、编辑、排序均在录入面板中进行
        </p>
      </div>

      {/* 录入面板：按省份分组（与地图一致），支持增删改、组内拖动排序、新增同学、毛笔字图片 */}
      <Dialog open={modalOpen} onOpenChange={(v) => {
        setModalOpen(v)
        if (!v) setFocusId(null)
      }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>学生名单录入 · 按省份分组</DialogTitle>
            <DialogDescription>
              分组与地图标注一致，默认按软科排名排序；拖动行首手柄调整组内顺序后，该省保持手动顺序
            </DialogDescription>
          </DialogHeader>
          <StudentGroupModal focusStudentId={focusId} />
        </DialogContent>
      </Dialog>
    </Section>
  )
}
