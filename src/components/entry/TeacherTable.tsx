import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Plus, Trash2 } from 'lucide-react'
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

  const handleEnterOnLastRow = (id: string) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    if (teachers[teachers.length - 1]?.id !== id) return
    e.preventDefault()
    addRow()
  }

  return (
    <Card className="rounded-xl border-stone-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base text-stone-700">
            <BookOpen className="h-4 w-4 text-stone-400" />
            老师名单
            <span className="text-xs font-normal text-stone-400">（可选填）</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="teacher-toggle" className="text-xs text-stone-500">
              在地图上显示老师名单
            </Label>
            <Switch
              id="teacher-toggle"
              checked={show}
              onCheckedChange={setShow}
              aria-label="在地图上显示或隐藏老师名单"
            />
          </div>
        </div>
      </CardHeader>

      {show && (
        <CardContent className="space-y-3">
          {teachers.length === 0 && (
            <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-center text-sm text-stone-500">
              留下想感谢的老师吧，留空则地图上不显示
            </p>
          )}

          {teachers.map((t, index) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50/50 p-3"
            >
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
                className="h-9 border-stone-200 bg-white focus-visible:ring-stone-300"
              />
              <Input
                value={t.subject}
                onChange={(e) => updateRow(t.id, { subject: e.target.value })}
                onKeyDown={handleEnterOnLastRow(t.id)}
                placeholder="学科"
                aria-label={`第 ${index + 1} 位老师学科`}
                className="h-9 w-24 shrink-0 border-stone-200 bg-white focus-visible:ring-stone-300"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRow(t.id)}
                aria-label={`删除第 ${index + 1} 位老师`}
                className="shrink-0 text-stone-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addRow}
            className="w-full border-dashed border-stone-300 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            <Plus className="h-4 w-4" />
            添加一位老师
          </Button>
        </CardContent>
      )}
    </Card>
  )
}
