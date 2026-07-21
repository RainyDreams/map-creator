import { useState } from 'react'
import { Check, Copy, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMapData } from '@/store/MapDataContext'
import { cn } from '@/lib/utils'

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 画布管理台：新建 / 切换 / 重命名 / 复制 / 删除 多张独立蹭饭图画布。
 * 每张画布拥有完全独立的名单、主题、字体与班徽配置。
 */
export function CanvasManager() {
  const {
    canvases,
    activeCanvasId,
    activeCanvasName,
    switchCanvas,
    createCanvas,
    renameCanvas,
    duplicateCanvas,
    deleteCanvas,
  } = useMapData()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const startRename = (id: string, current: string) => {
    setEditingId(id)
    setEditingName(current)
  }

  const commitRename = () => {
    if (editingId) renameCanvas(editingId, editingName)
    setEditingId(null)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="管理我的多张画布"
        className="border-stone-200 bg-white text-xs text-stone-600 hover:bg-stone-100 hover:text-stone-900 md:text-sm"
      >
        <Layers className="size-4" />
        我的画布（{canvases.length}）
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl border-stone-200 bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-stone-800">
              <Layers className="h-5 w-5 text-stone-400" />
              画布管理台
            </DialogTitle>
            <DialogDescription>
              可同时制作多张蹭饭图，每张画布的名单、主题、字体完全独立。
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {canvases.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-2.5 transition-colors',
                  c.active
                    ? 'border-amber-400/70 bg-amber-50/60'
                    : 'border-stone-200 bg-stone-50/50',
                )}
              >
                {editingId === c.id ? (
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    aria-label="画布名称"
                    className="h-8 min-w-0 flex-1 border-stone-300 bg-white text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      switchCanvas(c.id)
                      setOpen(false)
                    }}
                    className="min-w-0 flex-1 text-left"
                    title={c.active ? '当前画布' : '切换到这张画布'}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-stone-700">
                        {c.name}
                      </span>
                      {c.active && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                          当前
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-stone-400">
                      {c.studentCount} 名学生 · 更新于 {formatTime(c.updatedAt)}
                    </span>
                  </button>
                )}

                {editingId !== c.id && (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => startRename(c.id, c.name)}
                      aria-label={`重命名「${c.name}」`}
                      title="重命名"
                      className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        duplicateCanvas(c.id)
                        toast.success(`已复制「${c.name}」，并切换到副本`)
                      }}
                      aria-label={`复制「${c.name}」`}
                      title="复制为新画布"
                      className="rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {canvases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          deleteCanvas(c.id)
                          toast.success(`已删除画布「${c.name}」`)
                        }}
                        aria-label={`删除「${c.name}」`}
                        title="删除该画布"
                        className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                )}
                {editingId === c.id && (
                  <button
                    type="button"
                    onClick={commitRename}
                    aria-label="确认重命名"
                    className="shrink-0 rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              createCanvas()
              toast.success('已新建空白画布')
              setOpen(false)
            }}
            className="w-full border-dashed border-stone-300 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            <Plus className="h-4 w-4" />
            新建画布
          </Button>
          {activeCanvasId && canvases.length > 1 && (
            <p className="text-center text-[11px] text-stone-400">
              当前画布：{activeCanvasName}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
