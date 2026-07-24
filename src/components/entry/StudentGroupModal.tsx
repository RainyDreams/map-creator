import { useEffect, useMemo, useRef, useState } from 'react'
import { AlignLeft, AlignRight, ArrowDownUp, Brush, ChevronDown, ChevronUp, Combine, GripVertical, ImagePlus, MapPinOff, Plane, Plus, RotateCcw, Shield, Split, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import CityPicker from '@/components/entry/CityPicker'
import { useMapData } from '@/store/MapDataContext'
import { inferCityFromUniversity, resolveProvince } from '@/utils/geo'
import { getUniInfoSync, prefetchUniversities, schoolBadgeUrl } from '@/utils/universities'
import { newId, splitCardKey, type CalligraphyAsset, type MapData, type StudentBadge, type StudentEntry } from '@/types'

/** 未定位条目的虚拟分组键 */
const UNLOCATED = '__unlocated__'
/** 境外学生的分组键（不指向中国地图，单独成组） */
const OVERSEAS = '__overseas__'

/** 毛笔字图片上传处理：读取 → 等比压缩到最长边 600px → PNG dataURL（保留透明底） */
function processCalliFile(file: File): Promise<CalligraphyAsset> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const maxSide = 600
      const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * ratio))
      const h = Math.max(1, Math.round(img.naturalHeight * ratio))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas 不可用'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve({ dataUrl: canvas.toDataURL('image/png'), w, h, scale: 1 })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}

/** 校徽上传处理：中心方形裁剪 → 压缩到 256px PNG dataURL（保留透明底） */
function processBadgeFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      const sx = Math.round((img.naturalWidth - side) / 2)
      const sy = Math.round((img.naturalHeight - side) / 2)
      const out = Math.min(256, side)
      const canvas = document.createElement('canvas')
      canvas.width = out
      canvas.height = out
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas 不可用'))
        return
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}

/**
 * 弹出式学生录入（PC 端模态框内容）：
 * - 严格按省份分组展示，分组与顺序和地图上的标注列一致
 *   （默认省内按软科排名；被手动调整过的省份保持手动顺序）
 * - 每组内可拖动手柄调整同学顺序；调整后该省转为「手动顺序」，
 *   地图同步保持此顺序，组头可一键「恢复排名」
 * - 行内可直接修改姓名/大学/城市、删除行，与左侧名单共享同一份数据
 */
export function StudentGroupModal({ focusStudentId }: { focusStudentId?: string | null }) {
  const { data, setData } = useMapData()
  const students = data.students
  const [tick, setTick] = useState(0)
  /** 打开面板时定位并短暂高亮的目标学生 */
  const [focusFlash, setFocusFlash] = useState<string | null>(null)

  useEffect(() => {
    if (!focusStudentId) return
    const timer = setTimeout(() => {
      document
        .querySelector(`[data-student-id="${CSS.escape(focusStudentId)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setFocusFlash(focusStudentId)
    }, 220)
    const clear = setTimeout(() => setFocusFlash(null), 2000)
    return () => {
      clearTimeout(timer)
      clearTimeout(clear)
    }
  }, [focusStudentId])

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

  /** 展示用学生：城市为空时用院校数据/本地推断补全（与地图一致，不回写录入数据；境外学生不推断） */
  const display = useMemo(
    () =>
      students.map((s) => {
        if (s.overseas === true) return s
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

  /** 按省份分组；组内顺序与地图一致（手动省保持顺序，其余按软科排名；境外、未定位依次沉底） */
  const groups = useMemo(() => {
    const g = new Map<string, StudentEntry[]>()
    for (const s of display) {
      const prov = s.overseas === true ? OVERSEAS : (resolveProvince(s) ?? UNLOCATED)
      const list = g.get(prov)
      if (list) list.push(s)
      else g.set(prov, [s])
    }
    for (const [prov, list] of g) {
      if (prov !== UNLOCATED && prov !== OVERSEAS && !manual.has(prov)) {
        list.sort((a, b) => rankOf(a) - rankOf(b))
      }
    }
    // 境外组、未定位组依次沉底
    const overseas = g.get(OVERSEAS)
    if (overseas) {
      g.delete(OVERSEAS)
      g.set(OVERSEAS, overseas)
    }
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
        groupKey !== UNLOCATED && groupKey !== OVERSEAS && !prev.customOrderProvinces.includes(groupKey)
          ? [...prev.customOrderProvinces, groupKey]
          : prev.customOrderProvinces
      return { ...prev, students: nextStudents, customOrderProvinces }
    })
  }

  /** 移动端上移/下移（同组内；与拖拽共用回填逻辑） */
  const moveWithin = (groupKey: string, id: string, dir: -1 | 1) => {
    const members = groups.get(groupKey) ?? []
    const ids = members.map((m) => m.id)
    const idx = ids.indexOf(id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= ids.length) return
    reorderWithin(groupKey, id, ids[target])
  }

  const resetOrder = (prov: string) => {
    setData((prev) => ({
      ...prev,
      customOrderProvinces: prev.customOrderProvinces.filter((p) => p !== prov),
    }))
  }

  /* ---------- 省份卡片拆分 ---------- */

  /** 拆分省份的卡片成员（与 applyProvinceSplits 同规则清洗：已删 id 丢弃、未入卡的学生补到第一张卡） */
  const cardsOf = (prov: string, members: StudentEntry[]): StudentEntry[][] | null => {
    const raw = data.provinceSplits[prov]
    if (!raw || raw.length < 2) return null
    const byId = new Map(members.map((m) => [m.id, m]))
    const seen = new Set<string>()
    const cards = raw.map((ids) => {
      const list: StudentEntry[] = []
      for (const id of ids) {
        const s = byId.get(id)
        if (s && !seen.has(id)) {
          seen.add(id)
          list.push(s)
        }
      }
      return list
    })
    for (const m of members) if (!seen.has(m.id)) cards[0].push(m)
    return cards
  }

  /** 小卡标题：卡内学生城市全相同 → 城市名；否则「卡片 N」 */
  const cardTitle = (members: StudentEntry[], idx: number): string => {
    const cities = new Set(members.map((m) => m.city.trim()).filter((c) => c !== ''))
    return cities.size === 1 ? [...cities][0] : `卡片 ${idx + 1}`
  }

  /** 卡片文字对齐切换（v1.23）：左/右；再次点击已选中的对齐则清除覆盖（恢复跟随所在列默认）。
      键：未拆分省 = 省份名；拆分卡 = splitCardKey(prov, i)——与地图卡片键一致 */
  const AlignToggle = ({ cardKey }: { cardKey: string }) => {
    const cur = data.cardTextAlign[cardKey]
    const set = (v: 'left' | 'right') =>
      setData((prev) => {
        const next = { ...prev.cardTextAlign }
        if (cur === v) delete next[cardKey]
        else next[cardKey] = v
        return { ...prev, cardTextAlign: next }
      })
    const btn = (v: 'left' | 'right', Icon: typeof AlignLeft, label: string) => (
      <button
        type="button"
        onClick={() => set(v)}
        title={`${label}（当前${cur ? (cur === 'left' ? '左对齐' : '右对齐') : '跟随列默认'}；再次点击恢复默认）`}
        aria-label={`${cardKey} ${label}`}
        className={`flex items-center rounded px-1 py-0.5 ${
          cur === v ? 'bg-stone-700 text-white' : 'text-stone-400 hover:bg-stone-100 hover:text-stone-700'
        }`}
      >
        <Icon className="h-3 w-3" />
      </button>
    )
    return (
      <span className="inline-flex items-center gap-0.5 rounded border border-stone-200 bg-white p-0.5">
        {btn('left', AlignLeft, '卡片文字左对齐')}
        {btn('right', AlignRight, '卡片文字右对齐')}
      </span>
    )
  }

  /** 拆分/跨卡拖动后该省转为手动顺序（不再按软科排名重排） */
  const markCustom = (prev: MapData, prov: string): string[] =>
    prev.customOrderProvinces.includes(prov)
      ? prev.customOrderProvinces
      : [...prev.customOrderProvinces, prov]

  /** 拆分卡片：当前顺序整体留在第一张卡，新增一张空卡 */
  const splitProvince = (prov: string) => {
    setData((prev) => {
      const members = groups.get(prov) ?? []
      if (members.length === 0) return prev
      return {
        ...prev,
        provinceSplits: { ...prev.provinceSplits, [prov]: [members.map((m) => m.id), []] },
        customOrderProvinces: markCustom(prev, prov),
      }
    })
  }

  /** 按城市拆分：每个城市一张卡（城市为空的同学单独一张卡） */
  const splitByCity = (prov: string) => {
    setData((prev) => {
      const members = groups.get(prov) ?? []
      const byCity = new Map<string, string[]>()
      for (const m of members) {
        const c = m.city.trim()
        const list = byCity.get(c)
        if (list) list.push(m.id)
        else byCity.set(c, [m.id])
      }
      if (byCity.size < 2) return prev
      return {
        ...prev,
        provinceSplits: { ...prev.provinceSplits, [prov]: [...byCity.values()] },
        customOrderProvinces: markCustom(prev, prov),
      }
    })
  }

  /** 末尾追加一张空卡 */
  const addCard = (prov: string) => {
    setData((prev) => {
      const raw = prev.provinceSplits[prov]
      if (!raw) return prev
      return { ...prev, provinceSplits: { ...prev.provinceSplits, [prov]: [...raw, []] } }
    })
  }

  /** 合并为一张卡：按卡片顺序展开回填全局 students 顺序（手动顺序保留），并移除拆分 */
  const mergeCards = (prov: string) => {
    setData((prev) => {
      const raw = prev.provinceSplits[prov]
      if (!raw) return prev
      const members = groups.get(prov) ?? []
      const byId = new Map(members.map((m) => [m.id, m]))
      const seen = new Set<string>()
      const orderedIds: string[] = []
      for (const ids of raw) {
        for (const id of ids) {
          if (byId.has(id) && !seen.has(id)) {
            seen.add(id)
            orderedIds.push(id)
          }
        }
      }
      for (const m of members) if (!seen.has(m.id)) orderedIds.push(m.id)
      const queue = [...orderedIds]
      const fullById = new Map(prev.students.map((s) => [s.id, s]))
      const peerSet = new Set(members.map((m) => m.id))
      const nextStudents = prev.students.map((s) =>
        peerSet.has(s.id) ? (fullById.get(queue.shift()!) ?? s) : s,
      )
      const provinceSplits = { ...prev.provinceSplits }
      delete provinceSplits[prov]
      return { ...prev, students: nextStudents, provinceSplits }
    })
  }

  /**
   * 拆分省内的移动：toId 非空时把 fromId 插到 toId 原位置（同卡与 reorderWithin 语义一致，跨卡=插入其前）；
   * toId 为 null 时追加到 toCardIdx 卡末尾（拖到空卡占位区）
   */
  const moveInSplits = (prov: string, fromId: string, toId: string | null, toCardIdx: number) => {
    if (toId === fromId) return
    setData((prev) => {
      const raw = prev.provinceSplits[prov]
      if (!raw || raw.length < 2) return prev
      const members = groups.get(prov) ?? []
      const memberSet = new Set(members.map((m) => m.id))
      // 先按 cardsOf 同规则清洗，保证拖动基于当前真实成员
      const cards = raw.map((c) => c.filter((id) => memberSet.has(id)))
      const seen = new Set(cards.flat())
      for (const m of members) if (!seen.has(m.id)) cards[0].push(m.id)
      let fromCard = -1
      let fromPos = -1
      cards.forEach((c, i) => {
        const p = c.indexOf(fromId)
        if (p >= 0) {
          fromCard = i
          fromPos = p
        }
      })
      if (fromCard < 0) return prev
      let insertCard = Math.min(toCardIdx, cards.length - 1)
      let insertPos = cards[insertCard].length
      if (toId !== null) {
        let tc = -1
        let tp = -1
        cards.forEach((c, i) => {
          const p = c.indexOf(toId)
          if (p >= 0) {
            tc = i
            tp = p
          }
        })
        if (tc < 0) return prev
        insertCard = tc
        insertPos = tp
      }
      cards[fromCard].splice(fromPos, 1)
      cards[insertCard].splice(insertPos, 0, fromId)
      return {
        ...prev,
        provinceSplits: { ...prev.provinceSplits, [prov]: cards },
        customOrderProvinces: markCustom(prev, prov),
      }
    })
  }

  /** 移动端上/下移（拆分省）：卡内移动；到顶再点上移 → 进上一张卡末尾，到底再点下移 → 进下一张卡开头 */
  const moveAcrossCards = (
    prov: string,
    id: string,
    dir: -1 | 1,
    cardIdx: number,
    cards: StudentEntry[][],
  ) => {
    const card = cards[cardIdx]
    const idx = card.findIndex((m) => m.id === id)
    if (idx < 0) return
    const target = idx + dir
    if (target >= 0 && target < card.length) {
      moveInSplits(prov, id, card[target].id, cardIdx)
      return
    }
    if (dir === -1 && cardIdx > 0) {
      moveInSplits(prov, id, null, cardIdx - 1)
    } else if (dir === 1 && cardIdx < cards.length - 1) {
      const first = cards[cardIdx + 1][0]
      moveInSplits(prov, id, first ? first.id : null, cardIdx + 1)
    }
  }

  const endDrag = () => {
    dragRef.current = null
    setDraggingId(null)
    setDropTargetId(null)
  }

  /* ---------- 大学毛笔字图片（按校名存储，同校学生共用） ---------- */
  const [calliOpenId, setCalliOpenId] = useState<string | null>(null)
  const calliFileRef = useRef<HTMLInputElement>(null)
  /** 当前正在上传/替换毛笔字的大学名 */
  const calliTargetRef = useRef<string>('')

  const setCalli = (uni: string, asset: CalligraphyAsset | null) => {
    setData((prev) => {
      const calligraphy = { ...prev.calligraphy }
      if (asset) calligraphy[uni] = asset
      else delete calligraphy[uni]
      return { ...prev, calligraphy }
    })
  }

  const handleCalliFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const uni = calliTargetRef.current
    if (!file || uni === '') return
    try {
      const asset = await processCalliFile(file)
      setCalli(uni, asset)
      // 字号协调建议已去弹窗化：统一由「字体设置」面板中的行内推荐标注给出（recommendFontSizes 并入毛笔字高度因素）
    } catch {
      // 读取失败静默忽略（用户可重试）
    }
  }

  /* ---------- 每人校徽：自定义图片 / 单独隐藏（按学生 id 存储） ---------- */
  const [badgeOpenId, setBadgeOpenId] = useState<string | null>(null)
  const badgeFileRef = useRef<HTMLInputElement>(null)
  /** 当前正在上传自定义校徽的学生 id */
  const badgeTargetRef = useRef<string>('')

  const setBadgeOverride = (id: string, patch: StudentBadge | null) => {
    setData((prev) => {
      const badgeOverrides = { ...prev.badgeOverrides }
      if (patch && (patch.hidden || patch.dataUrl || (patch.scale !== undefined && patch.scale !== 1))) {
        badgeOverrides[id] = { ...badgeOverrides[id], ...patch }
        // 所有字段都回到默认则移除整条，保持数据干净
        const cur = badgeOverrides[id]
        if (!cur.hidden && !cur.dataUrl && (cur.scale === undefined || cur.scale === 1)) delete badgeOverrides[id]
      } else {
        delete badgeOverrides[id]
      }
      return { ...prev, badgeOverrides }
    })
  }

  const handleBadgeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const id = badgeTargetRef.current
    if (!file || id === '') return
    try {
      const dataUrl = await processBadgeFile(file)
      setBadgeOverride(id, { dataUrl, hidden: false })
    } catch {
      // 读取失败静默忽略（用户可重试）
    }
  }

  /* ---------- 新增同学（嵌套模态框；自动归入所在省份分组） ---------- */
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', university: '', city: '', overseas: false })
  const addNameRef = useRef<HTMLInputElement>(null)

  const openAdd = () => {
    setAddForm({ name: '', university: '', city: '', overseas: false })
    setAddOpen(true)
    // 对话框动画结束后聚焦姓名输入框
    setTimeout(() => addNameRef.current?.focus(), 120)
  }

  const confirmAdd = () => {
    const name = addForm.name.trim()
    const university = addForm.university.trim()
    const city =
      addForm.city.trim() ||
      (addForm.overseas ? '' : inferCityFromUniversity(university) || '')
    if (name === '' && university === '' && city === '') return
    setData((prev) => ({
      ...prev,
      students: [
        ...prev.students,
        { id: newId(), name, university, city, overseas: addForm.overseas || undefined },
      ],
    }))
    setAddOpen(false)
  }

  if (students.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-6 text-center text-sm text-stone-500">
          还没有学生，点击下方「新增同学」开始录入
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={openAdd}
          className="h-9 w-full border-stone-800 bg-stone-800 text-xs text-white shadow-md hover:bg-stone-700 hover:text-white md:text-sm"
        >
          <Plus className="h-4 w-4" />
          新增同学
        </Button>
        <AddStudentDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          form={addForm}
          setForm={setAddForm}
          nameRef={addNameRef}
          onConfirm={confirmAdd}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <input
        ref={calliFileRef}
        type="file"
        accept="image/png,image/webp,image/*"
        className="hidden"
        onChange={handleCalliFile}
      />
      <input
        ref={badgeFileRef}
        type="file"
        accept="image/png,image/webp,image/*"
        className="hidden"
        onChange={handleBadgeFile}
      />
      <p className="flex items-center gap-1.5 text-xs text-stone-400">
        <ArrowDownUp className="h-3.5 w-3.5" />
        <span className="hidden md:inline">
          名单按省份分组（与地图一致）；拖动行首手柄可调整组内顺序，调整后该省保持手动顺序
        </span>
        <span className="md:hidden">
          名单按省份分组（与地图一致）；用行首上下按钮调整组内顺序，调整后该省保持手动顺序
        </span>
      </p>
      {[...groups.entries()].map(([prov, members]) => {
        const isUnlocated = prov === UNLOCATED
        const isOverseas = prov === OVERSEAS
        const isManual = !isUnlocated && !isOverseas && manual.has(prov)
        const cards = isUnlocated || isOverseas ? null : cardsOf(prov, members)
        const cityCount = new Set(members.map((m) => m.city.trim()).filter((c) => c !== '')).size
        return (
          <section key={prov} className="space-y-1.5">
            <header className="flex items-center gap-2">
              <h3
                className={`text-sm font-semibold ${isUnlocated ? 'flex items-center gap-1 text-amber-700' : 'flex items-center gap-1 text-stone-700'}`}
              >
                {isUnlocated && <MapPinOff className="h-3.5 w-3.5" />}
                {isOverseas && <Plane className="h-3.5 w-3.5 text-stone-400" />}
                {isUnlocated ? '未定位（请补充城市）' : isOverseas ? '海外 / 境外' : prov}
              </h3>
              <span className="text-xs text-stone-400">{members.length} 人</span>
              {!isUnlocated && !isOverseas && (
                <span className="ml-auto flex flex-wrap items-center gap-1 text-[11px] text-stone-400">
                  <AlignToggle cardKey={prov} />
                  {cards !== null ? '已拆分' : isManual ? '手动顺序' : '按软科排名'}
                  {isManual && cards === null && (
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
                  {cards === null ? (
                    <>
                      <button
                        type="button"
                        onClick={() => splitProvince(prov)}
                        title="把这个省拆成两张卡片，同学可在卡片之间拖动分配"
                        className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                      >
                        <Split className="h-3 w-3" />
                        拆分卡片
                      </button>
                      {members.length >= 2 && cityCount >= 2 && (
                        <button
                          type="button"
                          onClick={() => splitByCity(prov)}
                          title="按城市自动分卡：每个城市一张卡"
                          className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                        >
                          <Split className="h-3 w-3" />
                          按城市拆分
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => addCard(prov)}
                        title="末尾新增一张空卡片"
                        className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                      >
                        <Plus className="h-3 w-3" />
                        新建卡片
                      </button>
                      <button
                        type="button"
                        onClick={() => mergeCards(prov)}
                        title="取消拆分，合并回一张卡片（保留当前顺序）"
                        className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                      >
                        <Combine className="h-3 w-3" />
                        合并为一张卡
                      </button>
                    </>
                  )}
                </span>
              )}
            </header>

            {(() => {
              /** 渲染一名学生的行（未拆分组 / 拆分卡内共用） */
              const renderRow = (
                s: StudentEntry,
                index: number,
                groupLen: number,
                split: { cards: StudentEntry[][]; cardIdx: number } | null,
              ) => {
                const uniKey = s.university.trim()
                const calli = uniKey !== '' ? data.calligraphy[uniKey] : undefined
                const calliOpen = calliOpenId === s.id
                const ovr = data.badgeOverrides[s.id]
                const badgeOpen = badgeOpenId === s.id
                const autoBadge = uniKey !== '' && getUniInfoSync(uniKey)?.b != null
                return (
                <li
                  key={s.id}
                  data-student-id={s.id}
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
                    if (!drag || drag.group !== prov) return
                    if (split) moveInSplits(prov, drag.id, s.id, split.cardIdx)
                    else reorderWithin(prov, drag.id, s.id)
                  }}
                  className={`rounded-md border px-1.5 py-1 transition-colors ${
                    isUnlocated ? 'border-amber-300/70 bg-amber-50/50' : 'border-stone-200 bg-stone-50/50'
                  } ${dropTargetId === s.id ? 'ring-2 ring-amber-400/70' : ''} ${
                    draggingId === s.id ? 'opacity-50' : ''
                  } ${focusFlash === s.id ? 'ring-2 ring-stone-400' : ''}`}
                >
                  {/* 第一行：手柄（桌面）/上下按钮（移动端） + 序号 + 姓名 + 毛笔字/删除 + 大学（移动端独占一行） */}
                  <div className="flex flex-wrap items-center gap-1.5">
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
                    className="hidden shrink-0 cursor-grab touch-none text-stone-300 hover:text-stone-500 active:cursor-grabbing md:block"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  {/* 移动端：上移/下移按钮（窄屏不拖拽） */}
                  <span className="flex shrink-0 flex-col md:hidden">
                    <button
                      type="button"
                      disabled={split ? split.cardIdx === 0 && index === 0 : index === 0}
                      onClick={() =>
                        split
                          ? moveAcrossCards(prov, s.id, -1, split.cardIdx, split.cards)
                          : moveWithin(prov, s.id, -1)
                      }
                      aria-label={`上移 ${s.name || '该行'}`}
                      className="rounded-sm p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={
                        split
                          ? split.cardIdx === split.cards.length - 1 &&
                            index === split.cards[split.cardIdx].length - 1
                          : index === groupLen - 1
                      }
                      onClick={() =>
                        split
                          ? moveAcrossCards(prov, s.id, 1, split.cardIdx, split.cards)
                          : moveWithin(prov, s.id, 1)
                      }
                      aria-label={`下移 ${s.name || '该行'}`}
                      className="rounded-sm p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-stone-400">
                    {index + 1}
                  </span>
                  <Input
                    value={s.name}
                    onChange={(e) => updateRow(s.id, { name: e.target.value })}
                    placeholder="姓名"
                    aria-label="姓名"
                    className="h-7 min-w-0 flex-1 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:w-20 md:flex-none"
                  />
                  <button
                    type="button"
                    disabled={uniKey === ''}
                    onClick={() => setCalliOpenId((cur) => (cur === s.id ? null : s.id))}
                    aria-label={`${calli ? '编辑' : '上传'}${uniKey || '大学'}的毛笔字图片`}
                    title={
                      uniKey === ''
                        ? '先填写大学名'
                        : calli
                          ? '已上传毛笔字图片，点击调整'
                          : '上传该校的毛笔字图片（替代大学文字）'
                    }
                    className={`shrink-0 rounded p-1 ${
                      calli
                        ? 'text-stone-700 bg-stone-200/70 hover:bg-stone-200'
                        : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600'
                    } disabled:cursor-not-allowed disabled:opacity-40 ${calliOpen ? 'ring-1 ring-stone-400' : ''}`}
                  >
                    <Brush className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBadgeOpenId((cur) => (cur === s.id ? null : s.id))}
                    aria-label={`自定义 ${s.name || '该行'} 的校徽`}
                    title={
                      ovr?.dataUrl
                        ? '已上传自定义校徽，点击调整'
                        : ovr?.hidden
                          ? '此人的校徽已隐藏，点击调整'
                          : '自定义此人的校徽（上传图片或单独隐藏）'
                    }
                    className={`shrink-0 rounded p-1 ${
                      ovr?.dataUrl
                        ? 'text-stone-700 bg-stone-200/70 hover:bg-stone-200'
                        : ovr?.hidden
                          ? 'text-amber-600 bg-amber-100/70 hover:bg-amber-100'
                          : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600'
                    } ${badgeOpen ? 'ring-1 ring-stone-400' : ''}`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(s.id)}
                    aria-label="删除该行"
                    className="shrink-0 rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <Input
                    value={s.university}
                    onChange={(e) => updateRow(s.id, { university: e.target.value })}
                    onBlur={() => {
                      if (s.overseas !== true && s.city.trim() === '') {
                        const inferred = inferCityFromUniversity(s.university)
                        if (inferred) updateRow(s.id, { city: inferred })
                      }
                    }}
                    placeholder="大学"
                    aria-label="大学"
                    className="order-6 h-7 w-full min-w-0 border-stone-200 bg-white text-xs focus-visible:ring-stone-300 md:order-none md:w-auto md:flex-1"
                  />
                  </div>

                  {/* 第二行：省 / 市级联下拉（单独一行，接口不可用时降级为手动输入；支持「海外 / 境外」） */}
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 pl-0 md:pl-[52px]">
                    <CityPicker
                      value={s.city}
                      onChange={(city) => updateRow(s.id, { city })}
                      overseas={s.overseas === true}
                      onOverseasChange={(v) =>
                        updateRow(
                          s.id,
                          v ? { overseas: true, city: '' } : { overseas: undefined },
                        )
                      }
                      ariaLabel={`${s.name || `第 ${index + 1} 行`}的城市`}
                    />
                  </div>

                  {/* 毛笔字图片编辑面板：透明底横版 PNG，同校学生共用；上传后地图上替代大学文字 */}
                  {calliOpen && uniKey !== '' && (
                    <div className="mt-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-2">
                      <p className="mb-1.5 text-[11px] leading-4 text-stone-400">
                        「{uniKey}」的毛笔字图片：透明底横版 PNG（自备），同校学生共用；上传后地图上不再显示大学文字，校徽后直接渲染该图片。
                      </p>
                      {calli ? (
                        <div className="space-y-2">
                          <div
                            className="flex h-12 items-center justify-center overflow-hidden rounded border border-stone-100"
                            style={{
                              backgroundImage:
                                'repeating-conic-gradient(#f0efec 0% 25%, #ffffff 0% 50%)',
                              backgroundSize: '10px 10px',
                            }}
                          >
                            <img
                              src={calli.dataUrl}
                              alt={`${uniKey} 毛笔字预览`}
                              className="max-h-10 max-w-full object-contain"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 text-[11px] text-stone-500">大小</span>
                            <Slider
                              value={Math.round(calli.scale * 100)}
                              min={30}
                              max={300}
                              step={1}
                              format={(v) => `${v}%`}
                              aria-label="毛笔字图片大小"
                              onChange={(v) => setCalli(uniKey, { ...calli, scale: v / 100 })}
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                calliTargetRef.current = uniKey
                                calliFileRef.current?.click()
                              }}
                              className="flex items-center gap-1 rounded border border-stone-200 px-2 py-1 text-[11px] text-stone-600 hover:bg-stone-50"
                            >
                              <ImagePlus className="h-3 w-3" />
                              替换图片
                            </button>
                            <button
                              type="button"
                              onClick={() => setCalli(uniKey, null)}
                              className="flex items-center gap-1 rounded border border-stone-200 px-2 py-1 text-[11px] text-stone-500 hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                              移除（恢复显示大学文字）
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            calliTargetRef.current = uniKey
                            calliFileRef.current?.click()
                          }}
                          className="flex items-center gap-1 rounded border border-dashed border-stone-300 px-2.5 py-1.5 text-[11px] text-stone-500 hover:bg-stone-50 hover:text-stone-700"
                        >
                          <ImagePlus className="h-3.5 w-3.5" />
                          上传毛笔字图片
                        </button>
                      )}
                    </div>
                  )}
                  {/* 每人校徽面板：自定义图片 / 单独隐藏（优先于全局校徽开关） */}
                  {badgeOpen && (
                    <div className="mt-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-2">
                      <p className="mb-1.5 text-[11px] leading-4 text-stone-400">
                        「{s.name || '该同学'}」的校徽：默认按大学自动匹配（若该校已收录）；可上传自定义图片替代、单独隐藏，或用滑块单独调整大小（在全局倍率基础上叠加）。
                      </p>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-stone-100"
                          style={{
                            backgroundImage:
                              'repeating-conic-gradient(#f0efec 0% 25%, #ffffff 0% 50%)',
                            backgroundSize: '8px 8px',
                          }}
                        >
                          {ovr?.dataUrl ? (
                            <img src={ovr.dataUrl} alt="自定义校徽预览" className="max-h-9 max-w-9 object-contain" />
                          ) : autoBadge ? (
                            <img src={schoolBadgeUrl(uniKey)} alt="自动匹配校徽预览" className="max-h-9 max-w-9 object-contain" />
                          ) : (
                            <span className="px-1 text-center text-[10px] leading-3 text-stone-400">暂无自动校徽</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 text-[11px] leading-4 text-stone-500">
                          {ovr?.dataUrl
                            ? '当前：自定义图片'
                            : autoBadge
                              ? '当前：自动匹配'
                              : '当前：无校徽可显示'}
                          {ovr?.hidden && <span className="ml-1 text-amber-600">（已隐藏，不在图上显示）</span>}
                        </div>
                      </div>
                      {/* 个人校徽大小：50%–200%（默认 100% = 跟随全局），自动匹配与自定义校徽都适用 */}
                      {!ovr?.hidden && (autoBadge || ovr?.dataUrl) && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="shrink-0 text-[11px] text-stone-500">大小</span>
                          <Slider
                            value={Math.round((ovr?.scale ?? 1) * 100)}
                            min={50}
                            max={200}
                            step={5}
                            format={(v) => `${v}%`}
                            aria-label="该同学校徽大小"
                            onChange={(v) => setBadgeOverride(s.id, { ...ovr, scale: v / 100 })}
                          />
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            badgeTargetRef.current = s.id
                            badgeFileRef.current?.click()
                          }}
                          className="flex items-center gap-1 rounded border border-stone-200 px-2 py-1 text-[11px] text-stone-600 hover:bg-stone-50"
                        >
                          <ImagePlus className="h-3 w-3" />
                          {ovr?.dataUrl ? '替换图片' : '上传自定义校徽'}
                        </button>
                        {ovr?.dataUrl && (
                          <button
                            type="button"
                            onClick={() => setBadgeOverride(s.id, { ...ovr, dataUrl: undefined })}
                            className="flex items-center gap-1 rounded border border-stone-200 px-2 py-1 text-[11px] text-stone-500 hover:bg-stone-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            恢复自动匹配
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setBadgeOverride(s.id, { ...ovr, hidden: !ovr?.hidden })}
                          className="flex items-center gap-1 rounded border border-stone-200 px-2 py-1 text-[11px] text-stone-500 hover:bg-amber-50 hover:text-amber-700"
                        >
                          <Shield className="h-3 w-3" />
                          {ovr?.hidden ? '恢复显示校徽' : '隐藏此人的校徽'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
                )
              }
              if (cards === null) {
                return (
                  <ul className="space-y-1">
                    {members.map((s, index) => renderRow(s, index, members.length, null))}
                  </ul>
                )
              }
              return (
                <div className="space-y-1.5">
                  {cards.map((cardMembers, ci) => (
                    <div key={ci} className="rounded-md border border-stone-200 bg-white/70 p-1.5">
                      <p className="flex items-center justify-between gap-1 px-1 pb-1 text-[11px] font-medium text-stone-500">
                        <span>{cardTitle(cardMembers, ci)}</span>
                        <AlignToggle cardKey={splitCardKey(prov, ci)} />
                      </p>
                      {cardMembers.length === 0 ? (
                        <div
                          onDragOver={(e) => {
                            if (!dragRef.current || dragRef.current.group !== prov) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            const drag = dragRef.current
                            endDrag()
                            if (drag && drag.group === prov) moveInSplits(prov, drag.id, null, ci)
                          }}
                          className="rounded border border-dashed border-stone-300 px-2 py-2.5 text-center text-[11px] text-stone-400"
                        >
                          把同学拖到这里
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {cardMembers.map((s, index) =>
                            renderRow(s, index, cardMembers.length, { cards, cardIdx: ci }),
                          )}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )
            })()}
          </section>
        )
      })}

      {/* 底部固定操作：新增同学（弹出独立模态框，自动归入所在省份） */}
      <div className="sticky bottom-0 -mx-1 border-t border-stone-100 bg-white/95 px-1 pt-2 pb-0.5 backdrop-blur">
        <Button
          type="button"
          variant="outline"
          onClick={openAdd}
          className="h-9 w-full border-stone-800 bg-stone-800 text-xs text-white shadow-md hover:bg-stone-700 hover:text-white md:text-sm"
        >
          <Plus className="h-4 w-4" />
          新增同学
        </Button>
      </div>

      {/* 新增同学模态框：姓名/大学/省市联动；确认后自动加入所在省份分组 */}
      <AddStudentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        form={addForm}
        setForm={setAddForm}
        nameRef={addNameRef}
        onConfirm={confirmAdd}
      />
    </div>
  )
}

/** 新增同学弹窗（空名单与名单内两种入口共用） */
function AddStudentDialog({
  open,
  onOpenChange,
  form,
  setForm,
  nameRef,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  form: { name: string; university: string; city: string; overseas: boolean }
  setForm: React.Dispatch<React.SetStateAction<{ name: string; university: string; city: string; overseas: boolean }>>
  nameRef: React.RefObject<HTMLInputElement | null>
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新增同学</DialogTitle>
          <DialogDescription>
            确认后将自动加入其所在省份的分组；大学失焦时会自动推断城市，可再手动调整
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="add-name" className="text-xs text-stone-500">
              姓名
            </label>
            <Input
              id="add-name"
              ref={nameRef}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="姓名"
              className="h-9 border-stone-200 bg-white text-sm focus-visible:ring-stone-300"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="add-university" className="text-xs text-stone-500">
              大学
            </label>
            <Input
              id="add-university"
              value={form.university}
              onChange={(e) => setForm((f) => ({ ...f, university: e.target.value }))}
              onBlur={() => {
                if (!form.overseas && form.city.trim() === '') {
                  const inferred = inferCityFromUniversity(form.university)
                  if (inferred) setForm((f) => ({ ...f, city: inferred }))
                }
              }}
              placeholder="大学全称，如 西安电子科技大学"
              className="h-9 border-stone-200 bg-white text-sm focus-visible:ring-stone-300"
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-stone-500">省份 / 城市（境外学校选「海外 / 境外」）</span>
            <div className="grid grid-cols-2 gap-2">
              <CityPicker
                value={form.city}
                onChange={(city) => setForm((f) => ({ ...f, city }))}
                overseas={form.overseas}
                onOverseasChange={(v) => setForm((f) => ({ ...f, overseas: v }))}
                ariaLabel="新增同学的城市"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-stone-500"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={
                form.name.trim() === '' &&
                form.university.trim() === '' &&
                form.city.trim() === ''
              }
              className="bg-stone-800 text-white hover:bg-stone-700"
            >
              添加
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
