import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Section } from '@/components/entry/Section'
import { BookOpen, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useMapData } from '@/store/MapDataContext'
import { newId, type TeacherEntry } from '@/types'

/**
 * 老师名单（可选填）：
 * - 开关直接读写 data.showTeachers：关闭后地图上隐藏老师名单，已填数据保留
 * - 名单为空时地图页不显示老师区块（地图侧处理）
 */
export default function TeacherTable() {
  const { data, setData } = useMapData()
  const teachers = data.teachers
  const show = data.showTeachers

  const nameInputRefs = useRef(new Map<string, HTMLInputElement>())
  const [focusId, setFocusId] = useState<string | null>(null)

  /** 开关 → showTeachers：只控制地图显示，绝不清空已填数据 */
  const setShow = (v: boolean) => {
    setData((prev) => ({ ...prev, showTeachers: v }))
  }

  useEffect(() => {
    if (!focusId) return
    nameInputRefs.current.get(focusId)?.focus()
    setFocusId(null)
  }, [focusId, teachers.length])

  const updateRow = (id: string, patch: Partial<Omit<TeacherEntry, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      teachers: prev.teachers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
  }

  const removeRow = (id: string) => {
    nameInputRefs.current.delete(id)
    setData((prev) => ({ ...prev, teachers: prev.teachers.filter((t) => t.id !== id) }))
  }

  const addRow = () => {
    const id = newId()
    setData((prev) => ({
      ...prev,
      teachers: [...prev.teachers, { id, name: '', subject: '' }],
    }))
    setFocusId(id)
  }

  /** 拖拽排序：只从手柄启动拖拽，落到目标行时把该行移动到目标位置 */
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const moveRow = (fromId: string, toId: string) => {
    if (fromId === toId) return
    setData((prev) => {
      const arr = [...prev.teachers]
      const from = arr.findIndex((t) => t.id === fromId)
      const to = arr.findIndex((t) => t.id === toId)
      if (from < 0 || to < 0) return prev
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return { ...prev, teachers: arr }
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

  const handleEnterOnLastRow = (id: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    if (teachers[teachers.length - 1]?.id !== id) return
    e.preventDefault()
    addRow()
  }

  return (
    <Section
      icon={BookOpen}
      title="老师名单"
      titleHint="可选填"
      summary={teachers.length > 0 ? `${teachers.length} 位` : undefined}
      headerExtra={
        <>
          <Label htmlFor="teacher-toggle" className="text-xs whitespace-nowrap text-stone-500">
            地图上显示
          </Label>
          <Switch
            id="teacher-toggle"
            checked={show}
            onCheckedChange={setShow}
            aria-label="在地图上显示或隐藏老师名单"
          />
        </>
      }
    >

      {show && (
        <div className="space-y-2.5 md:space-y-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="teachers-title" className="shrink-0 text-xs text-stone-500">
              名单标题
            </Label>
            <Input
              id="teachers-title"
              value={data.teachersTitle}
              onChange={(e) => setData((prev) => ({ ...prev, teachersTitle: e.target.value }))}
              placeholder="相伴三年的老师们"
              aria-label="老师名单块标题（留空则不显示标题）"
              className="h-8 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:h-9 md:text-sm"
            />
          </div>
          {teachers.length === 0 && (
            <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-3 text-center text-xs text-stone-500 md:py-4 md:text-sm">
              留下想感谢的老师吧，留空则地图上不显示
            </p>
          )}

          {teachers.map((t, index) => (
            <div
              key={t.id}
              {...rowDragProps(t.id)}
              className={`flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50/50 p-2.5 md:p-3 ${
                dropTargetId === t.id ? 'ring-2 ring-amber-400/70' : ''
              } ${draggingId === t.id ? 'opacity-50' : ''}`}
            >
              <span
                draggable
                onDragStart={(e) => {
                  setDraggingId(t.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', t.id)
                }}
                onDragEnd={endDrag}
                title="拖动调整顺序"
                aria-label={`拖动调整第 ${index + 1} 位老师顺序`}
                className="-ml-1 shrink-0 cursor-grab touch-none text-stone-300 hover:text-stone-500 active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </span>
              <span className="w-5 shrink-0 text-center text-xs tabular-nums text-stone-400">
                {index + 1}
              </span>
              <Input
                ref={(el) => {
                  if (el) nameInputRefs.current.set(t.id, el)
                  else nameInputRefs.current.delete(t.id)
                }}
                value={t.name}
                onChange={(e) => updateRow(t.id, { name: e.target.value })}
                onKeyDown={handleEnterOnLastRow(t.id)}
                placeholder="姓名"
                aria-label={`第 ${index + 1} 位老师姓名`}
                className="h-8 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:h-9 md:text-sm"
              />
              <Input
                value={t.subject}
                onChange={(e) => updateRow(t.id, { subject: e.target.value })}
                onKeyDown={handleEnterOnLastRow(t.id)}
                placeholder="学科"
                aria-label={`第 ${index + 1} 位老师学科`}
                className="h-8 w-20 shrink-0 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:h-9 md:w-24 md:text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRow(t.id)}
                aria-label={`删除第 ${index + 1} 位老师`}
                className="size-7 shrink-0 text-stone-400 hover:bg-red-50 hover:text-red-500 md:size-8"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addRow}
            className="h-8 w-full border-dashed border-stone-300 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-800 md:h-9 md:text-sm"
          >
            <Plus className="h-4 w-4" />
            添加一位老师
          </Button>
        </div>
      )}
    </Section>
  )
}
