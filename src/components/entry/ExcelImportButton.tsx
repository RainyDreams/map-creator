import { useRef, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMapData } from '@/store/MapDataContext'
import { breadcrumb } from '@/utils/sessionLog'
import { newId } from '@/types'
import type { ParseResult } from '@/utils/excel'

/** xlsx 模块懒加载（代码分割：首屏不下载 Excel 引擎，首次使用时才加载） */
async function loadExcel(): Promise<typeof import('@/utils/excel')> {
  const t = performance.now()
  const mod = await import('@/utils/excel')
  console.info(`[Excel] 表格模块加载完成（+${Math.round(performance.now() - t)}ms）`)
  return mod
}

/**
 * 上传名单 Excel 的自包含按钮（v1.39.1）：学生名单处的快捷入口。
 * 与「导入」面板中的 Excel 导入同一条链路：选择文件 → 解析 → 预览（学生/老师/跳过计数 +
 * 前 10 行预览 + 问题行）→ 追加或替换；解析到老师数据时一并替换老师名单。
 */
export function ExcelImportButton() {
  const { importStudents, setData } = useMapData()
  const inputRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [pending, setPending] = useState<{ result: ParseResult; fileName: string } | null>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return
    setParsing(true)
    breadcrumb(`数据：学生名单处上传 Excel（${file.name}）`)
    try {
      const { parseWorkbook } = await loadExcel()
      const result = await parseWorkbook(file)
      if (result.students.length === 0 && result.teachers.length === 0) {
        // 原样回传模板（只含说明/示例行）是最常见的误操作，给出针对性提示而非“格式不符”
        const hint =
          result.skipped > 0
            ? '，文件中只有模板说明/示例行（已自动跳过），请在模板中填写正式名单后再上传'
            : result.errors.length > 0
              ? `：${result.errors[0]}`
              : '，请检查是否按模板格式填写'
        toast.error(`未识别到有效名单数据${hint}`)
        return
      }
      setPending({ result, fileName: file.name })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '文件解析失败，请重试')
    } finally {
      setParsing(false)
    }
  }

  const applyImport = (mode: 'replace' | 'append') => {
    if (!pending) return
    const { result } = pending
    const count = importStudents(result.students, mode)
    breadcrumb(`数据：导入 Excel（${mode === 'replace' ? '替换' : '追加'} ${count} 名学生，老师 ${result.teachers.length} 名，问题行 ${result.errors.length}）`)
    // 解析到老师数据时一并替换老师名单
    if (result.teachers.length > 0) {
      const teachers = result.teachers.map((t) => ({ ...t, id: newId() }))
      setData((prev) => ({ ...prev, teachers }))
    }
    const parts = [mode === 'replace' ? `已替换为 ${count} 名学生` : `已追加 ${count} 名学生`]
    if (result.teachers.length > 0) {
      parts.push(`老师名单已同步替换（${result.teachers.length} 名）`)
    }
    if (result.errors.length > 0) {
      parts.push(`${result.errors.length} 行有问题未导入`)
    }
    toast.success(parts.join('，'))
    setPending(null)
  }

  const r = pending?.result

  return (
    <>
      <button
        type="button"
        disabled={parsing}
        onClick={() => inputRef.current?.click()}
        title="上传按模板填写的 Excel 名单（.xlsx / .xls / .csv），导入前可先预览"
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-xs text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        {parsing ? '正在解析 Excel…' : '上传 Excel 名单'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleChange}
      />

      {/* 导入预览：与「导入」面板的 Excel 预览一致（计数 + 前 10 行 + 问题行 + 追加/替换） */}
      <Dialog open={pending !== null} onOpenChange={(v) => { if (!v) setPending(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-stone-400" />
              导入 Excel 名单
            </DialogTitle>
            <DialogDescription>确认无误后选择追加或替换</DialogDescription>
          </DialogHeader>
          {pending !== null && r && (
            <div className="space-y-3">
              <p className="text-xs text-stone-500">来自「{pending.fileName}」，即将导入：</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-stone-100 px-2 py-2">
                  <div className="text-lg font-semibold text-stone-800">{r.students.length}</div>
                  <div className="text-xs text-stone-500">名学生</div>
                </div>
                <div className="rounded-md bg-stone-100 px-2 py-2">
                  <div className="text-lg font-semibold text-stone-700">{r.teachers.length}</div>
                  <div className="text-xs text-stone-500">名老师</div>
                </div>
                <div className="rounded-md bg-stone-100 px-2 py-2">
                  <div className="text-lg font-semibold text-stone-700">{r.skipped}</div>
                  <div className="text-xs text-stone-500">行被跳过</div>
                </div>
              </div>

              {/* 数据预览：即将导入的学生（前 10 行）与老师（前 5 行） */}
              {r.students.length > 0 && (
                <div className="max-h-44 overflow-y-auto rounded-md border border-stone-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                        <th className="sticky top-0 bg-stone-50 px-2.5 py-1.5 text-left font-medium">姓名</th>
                        <th className="sticky top-0 bg-stone-50 px-2.5 py-1.5 text-left font-medium">大学</th>
                        <th className="sticky top-0 bg-stone-50 px-2.5 py-1.5 text-left font-medium">城市</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.students.slice(0, 10).map((s, i) => (
                        <tr key={i} className="border-b border-stone-100 last:border-0">
                          <td className="px-2.5 py-1.5 text-stone-700">{s.name || '—'}</td>
                          <td className="px-2.5 py-1.5 text-stone-600">{s.university || '—'}</td>
                          <td className="px-2.5 py-1.5 text-stone-600">{s.city || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {r.students.length > 10 && (
                    <p className="border-t border-stone-100 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-400">
                      … 共 {r.students.length} 名学生，仅预览前 10 行
                    </p>
                  )}
                </div>
              )}
              {r.teachers.length > 0 && (
                <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                  老师：
                  {r.teachers
                    .slice(0, 5)
                    .map((t) => `${t.name}（${t.subject}）`)
                    .join('、')}
                  {r.teachers.length > 5 ? ` 等 ${r.teachers.length} 人` : ''}
                  ，导入时将<strong>替换</strong>现有老师名单
                </p>
              )}
              {r.errors.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-stone-600">
                    以下 {r.errors.length} 处问题，对应内容不会被导入：
                  </p>
                  <ScrollArea className="h-24 rounded-md border border-stone-200 bg-stone-50">
                    <ul className="space-y-1 px-3 py-2 text-xs text-stone-600">
                      {r.errors.map((msg, i) => (
                        <li key={i} className="leading-relaxed">
                          {msg}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPending(null)}
                  className="text-stone-500"
                >
                  重新选择
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyImport('append')}
                  className="border-stone-300 text-stone-700 hover:bg-stone-100"
                >
                  追加到现有名单
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => applyImport('replace')}
                  className="bg-stone-900 text-white hover:bg-stone-700"
                >
                  替换现有名单
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
