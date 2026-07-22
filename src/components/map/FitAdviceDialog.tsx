import { Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export interface FitAdviceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 弹窗标题，如「优化标注排版」 */
  title: string
  /** 说明文字（为什么建议调整） */
  description: string
  /** 逐条列出的具体调整项，如「姓名字号：13px → 15px」 */
  changes: string[]
  /** 主按钮文字，默认「采用推荐」 */
  applyLabel?: string
  onApply: () => void
}

/**
 * 排版/字号建议弹窗：与整体 UI 一致的白底圆角卡片（OpenAI/Cloudflare 风格），
 * 逐条展示建议调整的具体参数，用户确认「采用推荐」后才生效。
 */
export function FitAdviceDialog({
  open,
  onOpenChange,
  title,
  description,
  changes,
  applyLabel = '采用推荐',
  onApply,
}: FitAdviceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md rounded-2xl border-stone-200 bg-white p-0 shadow-xl overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-stone-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            {title}
          </DialogTitle>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">{description}</p>
          {changes.length > 0 && (
            <ul className="mt-4 space-y-2 rounded-xl bg-stone-50 border border-stone-100 px-4 py-3">
              {changes.map((c) => (
                <li key={c} className="flex items-center gap-2 text-sm text-stone-700">
                  <span className="h-1 w-1 rounded-full bg-stone-400 shrink-0" />
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-stone-100 bg-stone-50/60 px-6 py-3.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3.5 py-2 text-sm text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            暂不调整
          </button>
          <button
            type="button"
            onClick={() => {
              onApply()
              onOpenChange(false)
            }}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700"
          >
            {applyLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
