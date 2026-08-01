/**
 * CMD 风格导出进程终端：固定高度黑框，实时滚动显示导出日志。
 * - 固定尺寸（h-32），内部滚动，新日志自动吸底；
 * - 长行自动换行（whitespace-pre-wrap + break-all）；
 * - 不可复制不可拖动：select-none + copy/dragstart 拦截（防误触，保持「只读屏幕」感）；
 * - 等宽字体优先用自托管 JetBrains Mono（与右下角水印同款），未加载则回退系统等宽。
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getExportLogSnapshot, subscribeExportLog } from '@/utils/exportLog'

const MONO = "'JetBrainsMono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

export default function ExportLogTerminal() {
  const lines = useSyncExternalStore(subscribeExportLog, getExportLogSnapshot)
  const bodyRef = useRef<HTMLDivElement>(null)

  // 新日志自动吸底（终端的「滚屏」感）
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div
      className="select-none overflow-hidden rounded-lg border border-stone-800 bg-stone-950"
      style={{ WebkitUserSelect: 'none' }}
      onCopy={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      aria-hidden="true"
    >
      {/* 标题栏：模拟终端窗口 */}
      <div className="flex items-center gap-1.5 border-b border-stone-800/80 bg-stone-900 px-2.5 py-1.5">
        <span className="h-2 w-2 rounded-full bg-stone-700" />
        <span className="h-2 w-2 rounded-full bg-stone-700" />
        <span className="h-2 w-2 rounded-full bg-emerald-800" />
        <span
          className="ml-1.5 text-[9px] tracking-wider text-stone-500"
          style={{ fontFamily: MONO }}
        >
          导出进程
        </span>
      </div>
      <div
        ref={bodyRef}
        className="h-32 overflow-y-auto overscroll-contain px-2.5 py-1.5"
        style={{ fontFamily: MONO }}
      >
        {lines.length === 0 ? (
          <p className="text-[10px] leading-5 text-stone-600">等待导出开始…</p>
        ) : (
          lines.map((l, i) => (
            <p
              key={i}
              className="whitespace-pre-wrap break-all text-[10px] leading-[1.7] text-stone-400"
            >
              <span className="text-stone-600">[{l.at.toFixed(1)}s]</span>{' '}
              <span className="text-emerald-600">&gt;</span> {l.text}
            </p>
          ))
        )}
        {/* 闪烁光标 */}
        <p className="animate-pulse text-[10px] leading-[1.7] text-emerald-700">▍</p>
      </div>
    </div>
  )
}
