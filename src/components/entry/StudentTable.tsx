import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GraduationCap, GripVertical, MapPinOff, Maximize2, Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { StudentGroupModal } from '@/components/entry/StudentGroupModal'
import { useMapData } from '@/store/MapDataContext'
import { newId, type StudentEntry } from '@/types'
import { inferCityFromUniversity, resolveProvince } from '@/utils/geo'
import CityPicker from '@/components/entry/CityPicker'

function isRowEmpty(s: StudentEntry): boolean {
  return !s.name.trim() && !s.university.trim() && !s.city.trim()
}

/** 行非空但解析不出省份 → 无法在地图上定位 */
function needsLocationHint(s: StudentEntry): boolean {
  if (isRowEmpty(s)) return false
  return resolveProvince({ city: s.city, university: s.university }) === null
}

/** 学生名单编辑器：卡片式堆叠，窄屏与 420px 侧栏均适用；PC 端可弹出为按省份分组的模态框 */
export default function StudentTable() {
  const { data, setData } = useMapData()
  const students = data.students
  const [modalOpen, setModalOpen] = useState(false)

  const nameInputRefs = useRef(new Map<string, HTMLInputElement>())
  const [focusId, setFocusId] = useState<string | null>(null)

  // 新增行后自动聚焦姓名
  useEffect(() => {
    if (!focusId) return
    nameInputRefs.current.get(focusId)?.focus()
    setFocusId(null)
  }, [focusId, students.length])

  const updateRow = (id: string, patch: Partial<Omit<StudentEntry, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      students: prev.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }

  const removeRow = (id: string) => {
    nameInputRefs.current.delete(id)
    setData((prev) => ({ ...prev, students: prev.students.filter((s) => s.id !== id) }))
  }

  const addRow = () => {
    const id = newId()
    setData((prev) => ({
      ...prev,
      students: [...prev.students, { id, name: '', university: '', city: '' }],
    }))
    setFocusId(id)
  }

  /** 拖拽排序：只从手柄启动拖拽，落到目标行时把该行移动到目标位置 */
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const moveRow = (fromId: string, toId: string) => {
    if (fromId === toId) return
    setData((prev) => {
      const arr = [...prev.students]
      const from = arr.findIndex((s) => s.id === fromId)
      const to = arr.findIndex((s) => s.id === toId)
      if (from < 0 || to < 0) return prev
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return { ...prev, students: arr }
    })
  }

  const rowDragProps = (id: string) => ({
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      if (!draggingId || draggingId === id) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dropTargetId !== id) setDropTargetId(id)
    },
    onDragLeave: () => setDropTargetId((cur) => (cur === id ? null : cur)),
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const fromId = draggingId
      setDraggingId(null)
      setDropTargetId(null)
      if (fromId) moveRow(fromId, id)
    },
  })

  const endDrag = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  /** 大学失焦时，城市为空则自动推断填充 */
  const handleUniversityBlur = (s: StudentEntry) => {
    if (s.city.trim()) return
    const inferred = inferCityFromUniversity(s.university)
    if (inferred) updateRow(s.id, { city: inferred })
  }

  /** 最后一行任意输入框回车 → 快速加行 */
  const handleEnterOnLastRow = (id: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    if (students[students.length - 1]?.id !== id) return
    e.preventDefault()
    addRow()
  }

  const filledCount = students.filter((s) => !isRowEmpty(s)).length

  return (
    <Card className="gap-4 rounded-xl border-stone-200 bg-white py-4 shadow-sm md:gap-6 md:py-6">
      <CardHeader className="px-4 pb-0 md:px-6">
        <CardTitle className="flex items-center gap-2 text-sm text-stone-700 md:text-base">
          <GraduationCap className="h-4 w-4 text-stone-400" />
          学生名单
          {filledCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-auto bg-stone-100 text-stone-600 hover:bg-stone-100"
            >
              已填 {filledCount} 人
            </Badge>
          )}
          {/* PC 端：弹出按省份分组的录入模态框（手机端空间太小，不提供） */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setModalOpen(true)}
            title="弹出窗口录入（按省份分组）"
            aria-label="弹出窗口录入学生名单"
            className={`hidden size-7 text-stone-400 hover:bg-stone-100 hover:text-stone-700 md:inline-flex ${filledCount === 0 ? 'ml-auto' : ''}`}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 px-4 md:space-y-3 md:px-6">
        {students.length === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-center text-xs text-stone-500 md:py-6 md:text-sm">
            还没有学生，点击下方「添加一行」开始录入
          </p>
        )}

        {students.map((s, index) => {
          const warn = needsLocationHint(s)
          return (
            <div
              key={s.id}
              {...rowDragProps(s.id)}
              className={`rounded-lg border p-2.5 transition-colors md:p-3 ${
                warn
                  ? 'border-amber-400/70 bg-amber-50/50'
                  : 'border-stone-200 bg-stone-50/50'
              } ${dropTargetId === s.id ? 'ring-2 ring-amber-400/70' : ''} ${
                draggingId === s.id ? 'opacity-50' : ''
              }`}
            >
              {/* 第一行：拖拽手柄 + 序号 + 姓名 + 删除 */}
              <div className="flex items-center gap-2">
                <span
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(s.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', s.id)
                  }}
                  onDragEnd={endDrag}
                  title="拖动调整顺序"
                  aria-label={`拖动调整第 ${index + 1} 行顺序`}
                  className="-ml-1 shrink-0 cursor-grab touch-none text-stone-300 hover:text-stone-500 active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <span className="w-6 shrink-0 text-center text-xs tabular-nums text-stone-400">
                  {index + 1}
                </span>
                <Input
                  ref={(el) => {
                    if (el) nameInputRefs.current.set(s.id, el)
                    else nameInputRefs.current.delete(s.id)
                  }}
                  value={s.name}
                  onChange={(e) => updateRow(s.id, { name: e.target.value })}
                  onKeyDown={handleEnterOnLastRow(s.id)}
                  placeholder="姓名"
                  aria-label={`第 ${index + 1} 行姓名`}
                  className="h-8 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:h-9 md:text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeRow(s.id)}
                  aria-label={`删除第 ${index + 1} 行`}
                  className="size-7 shrink-0 text-stone-400 hover:bg-red-50 hover:text-red-500 md:size-8"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* 第二行：大学（整行） */}
              <div className="mt-1.5 pl-[52px] md:mt-2">
                <Input
                  value={s.university}
                  onChange={(e) => updateRow(s.id, { university: e.target.value })}
                  onBlur={() => handleUniversityBlur(s)}
                  onKeyDown={handleEnterOnLastRow(s.id)}
                  placeholder="大学"
                  aria-label={`第 ${index + 1} 行大学`}
                  className="h-8 w-full border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:h-9 md:text-sm"
                />
              </div>

              {/* 第三行：省 / 市联动，各占半行（接口不可用时降级为手动输入） */}
              <div className="mt-1.5 grid grid-cols-2 gap-2 pl-[52px] md:mt-2">
                <CityPicker
                  value={s.city}
                  onChange={(city) => updateRow(s.id, { city })}
                  onEnterKeyDown={handleEnterOnLastRow(s.id)}
                  ariaLabel={`第 ${index + 1} 行城市`}
                />
              </div>

              {/* 行级提示：无法定位 */}
              {warn && (
                <p className="mt-1.5 flex items-center gap-1 pl-[52px] text-xs text-amber-700 md:mt-2">
                  <MapPinOff className="h-3.5 w-3.5 shrink-0" />
                  无法在地图上定位，请补充城市
                </p>
              )}
            </div>
          )
        })}

        <Button
          type="button"
          variant="outline"
          onClick={addRow}
          className="h-8 w-full border-dashed border-stone-300 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-800 md:h-9 md:text-sm"
        >
          <Plus className="h-4 w-4" />
          添加一行
        </Button>
        <p className="text-center text-xs text-stone-400">
          在最后一行按回车可快速加行；拖动左侧手柄可调整顺序
        </p>
      </CardContent>

      {/* PC 端弹出式录入：模态框按省份分组展示（与地图一致），组内可拖动排序 */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>学生名单录入 · 按省份分组</DialogTitle>
            <DialogDescription>
              分组与地图标注一致，默认按软科排名排序；拖动行首手柄调整组内顺序后，该省保持手动顺序
            </DialogDescription>
          </DialogHeader>
          <StudentGroupModal />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
