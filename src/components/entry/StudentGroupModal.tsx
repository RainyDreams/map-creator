import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, GripVertical, MapPinOff, RotateCcw, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useMapData } from '@/store/MapDataContext'
import { inferCityFromUniversity, resolveProvince } from '@/utils/geo'
import { getUniInfoSync, prefetchUniversities } from '@/utils/universities'
import type { StudentEntry } from '@/types'

/** 未定位条目的虚拟分组键 */
const UNLOCATED = '__unlocated__'

/**
 * 弹出式学生录入（PC 端模态框内容）：
 * - 严格按省份分组展示，分组与顺序和地图上的标注列一致
 *   （默认省内按软科排名；被手动调整过的省份保持手动顺序）
 * - 每组内可拖动手柄调整同学顺序；调整后该省转为「手动顺序」，
 *   地图同步保持此顺序，组头可一键「恢复排名」
 * - 行内可直接修改姓名/大学/城市、删除行，与左侧名单共享同一份数据
 */
export function StudentGroupModal() {
  const { data, setData } = useMapData()
  const students = data.students
  const [tick, setTick] = useState(0)

  /** 预取院校数据（城市补全/排名），模块级缓存与地图页共享 */
  useEffect(() => {
    if (students.length === 0) return
    let cancelled = false
    prefetchUniversities(students.map((s) => s.university)).then(() => {
      if (!cancelled) setTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [students])

  /** 展示用学生：城市为空时用院校数据/本地推断补全（与地图一致，不回写录入数据） */
  const display = useMemo(
    () =>
      students.map((s) => {
        if (s.city.trim() !== '') return s
        const c = getUniInfoSync(s.university.trim())?.c ?? inferCityFromUniversity(s.university) ?? ''
        return c === '' ? s : { ...s, city: c }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, tick],
  )

  const manual = useMemo(() => new Set(data.customOrderProvinces), [data.customOrderProvinces])

  const rankOf = (s: StudentEntry): number => {
    const r = getUniInfoSync(s.university.trim())?.r
    return typeof r === 'number' ? r : 9999
  }

  /** 按省份分组；组内顺序与地图一致（手动省保持顺序，其余按软科排名，未定位沉底） */
  const groups = useMemo(() => {
    const g = new Map<string, StudentEntry[]>()
    for (const s of display) {
      const prov = resolveProvince(s) ?? UNLOCATED
      const list = g.get(prov)
      if (list) list.push(s)
      else g.set(prov, [s])
    }
    for (const [prov, list] of g) {
      if (prov !== UNLOCATED && !manual.has(prov)) {
        list.sort((a, b) => rankOf(a) - rankOf(b))
      }
    }
    // 未定位组沉底
    const unlocated = g.get(UNLOCATED)
    if (unlocated) {
      g.delete(UNLOCATED)
      g.set(UNLOCATED, unlocated)
    }
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, manual, tick])

  const updateRow = (id: string, patch: Partial<Omit<StudentEntry, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      students: prev.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }

  const removeRow = (id: string) => {
    setData((prev) => ({ ...prev, students: prev.students.filter((s) => s.id !== id) }))
  }

  /* ---------- 组内拖拽排序 ---------- */
  const dragRef = useRef<{ id: string; group: string } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  /** 把 fromId 移动到 toId 的位置（仅限同组）；实省份转为手动顺序 */
  const reorderWithin = (groupKey: string, fromId: string, toId: string) => {
    if (fromId === toId) return
    setData((prev) => {
      const members = groups.get(groupKey) ?? []
      const ids = members.map((m) => m.id)
      const from = ids.indexOf(fromId)
      const to = ids.indexOf(toId)
      if (from < 0 || to < 0) return prev
      const newIds = [...ids]
      const [moved] = newIds.splice(from, 1)
      newIds.splice(to, 0, moved)
      // 全局 students 数组中，属于本组的位置按新顺序依次回填，其余人保持原位
      const queue = [...newIds]
      const byId = new Map(prev.students.map((s) => [s.id, s]))
      const peerSet = new Set(ids)
      const nextStudents = prev.students.map((s) =>
        peerSet.has(s.id) ? (byId.get(queue.shift()!) ?? s) : s,
      )
      const customOrderProvinces =
        groupKey !== UNLOCATED && !prev.customOrderProvinces.includes(groupKey)
          ? [...prev.customOrderProvinces, groupKey]
          : prev.customOrderProvinces
      return { ...prev, students: nextStudents, customOrderProvinces }
    })
  }

  const resetOrder = (prov: string) => {
    setData((prev) => ({
      ...prev,
      customOrderProvinces: prev.customOrderProvinces.filter((p) => p !== prov),
    }))
  }

  const endDrag = () => {
    dragRef.current = null
    setDraggingId(null)
    setDropTargetId(null)
  }

  if (students.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-6 text-center text-sm text-stone-500">
        还没有学生，先在左侧名单里添加吧
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1.5 text-xs text-stone-400">
        <ArrowDownUp className="h-3.5 w-3.5" />
        名单按省份分组（与地图一致）；拖动行首手柄可调整组内顺序，调整后该省保持手动顺序
      </p>
      {[...groups.entries()].map(([prov, members]) => {
        const isUnlocated = prov === UNLOCATED
        const isManual = !isUnlocated && manual.has(prov)
        return (
          <section key={prov} className="space-y-1.5">
            <header className="flex items-center gap-2">
              <h3
                className={`text-sm font-semibold ${isUnlocated ? 'flex items-center gap-1 text-amber-700' : 'text-stone-700'}`}
              >
                {isUnlocated && <MapPinOff className="h-3.5 w-3.5" />}
                {isUnlocated ? '未定位（请补充城市）' : prov}
              </h3>
              <span className="text-xs text-stone-400">{members.length} 人</span>
              {!isUnlocated && (
                <span className="ml-auto flex items-center gap-1 text-[11px] text-stone-400">
                  {isManual ? '手动顺序' : '按软科排名'}
                  {isManual && (
                    <button
                      type="button"
                      onClick={() => resetOrder(prov)}
                      title="恢复按软科排名自动排序"
                      className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                    >
                      <RotateCcw className="h-3 w-3" />
                      恢复排名
                    </button>
                  )}
                </span>
              )}
            </header>

            <ul className="space-y-1">
              {members.map((s, index) => (
                <li
                  key={s.id}
                  onDragOver={(e) => {
                    if (!dragRef.current || dragRef.current.group !== prov || dragRef.current.id === s.id) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (dropTargetId !== s.id) setDropTargetId(s.id)
                  }}
                  onDragLeave={() => setDropTargetId((cur) => (cur === s.id ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault()
                    const drag = dragRef.current
                    endDrag()
                    if (drag && drag.group === prov) reorderWithin(prov, drag.id, s.id)
                  }}
                  className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors ${
                    isUnlocated ? 'border-amber-300/70 bg-amber-50/50' : 'border-stone-200 bg-stone-50/50'
                  } ${dropTargetId === s.id ? 'ring-2 ring-amber-400/70' : ''} ${
                    draggingId === s.id ? 'opacity-50' : ''
                  }`}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      dragRef.current = { id: s.id, group: prov }
                      setDraggingId(s.id)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', s.id)
                    }}
                    onDragEnd={endDrag}
                    title="拖动调整组内顺序"
                    aria-label={`拖动调整 ${s.name || '该行'} 的顺序`}
                    className="shrink-0 cursor-grab touch-none text-stone-300 hover:text-stone-500 active:cursor-grabbing"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-stone-400">
                    {index + 1}
                  </span>
                  <Input
                    value={s.name}
                    onChange={(e) => updateRow(s.id, { name: e.target.value })}
                    placeholder="姓名"
                    aria-label="姓名"
                    className="h-7 w-20 shrink-0 border-stone-200 bg-white text-xs focus-visible:ring-stone-300"
                  />
                  <Input
                    value={s.university}
                    onChange={(e) => updateRow(s.id, { university: e.target.value })}
                    placeholder="大学"
                    aria-label="大学"
                    className="h-7 min-w-0 flex-1 border-stone-200 bg-white text-xs focus-visible:ring-stone-300"
                  />
                  <Input
                    value={s.city}
                    onChange={(e) => updateRow(s.id, { city: e.target.value })}
                    placeholder="城市"
                    aria-label="城市"
                    className="h-7 w-20 shrink-0 border-stone-200 bg-white text-xs focus-visible:ring-stone-300"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(s.id)}
                    aria-label="删除该行"
                    className="shrink-0 rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
