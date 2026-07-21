/**
 * 录入页 Excel 工具条：下载模板 + 上传解析导入。
 * 无 props，由录入页直接 <ExcelToolbar /> 使用。
 */
import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMapData } from '@/store/MapDataContext'
import { newId } from '@/types'
import { downloadTemplate, parseWorkbook, type ParseResult } from '@/utils/excel'

interface PendingImport {
  result: ParseResult
  fileName: string
}

export default function ExcelToolbar() {
  const { importStudents, setData } = useMapData()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [parsing, setParsing] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 允许用户重复选择同一文件
    e.target.value = ''
    if (!file) return
    setParsing(true)
    try {
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
    // 解析到老师数据时一并替换老师名单
    if (result.teachers.length > 0) {
      const teachers = result.teachers.map((t) => ({ ...t, id: newId() }))
      setData((prev) => ({ ...prev, teachers }))
    }
    const parts = [
      mode === 'replace' ? `已替换为 ${count} 名学生` : `已追加 ${count} 名学生`,
    ]
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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={downloadTemplate}
          className="border-stone-200 bg-white text-xs text-stone-600 hover:bg-stone-100 hover:text-stone-900 md:text-sm"
        >
          <Download className="size-4" />
          下载模板
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={parsing}
          onClick={() => fileInputRef.current?.click()}
          className="border-stone-200 bg-white text-xs text-stone-600 hover:bg-stone-100 hover:text-stone-900 md:text-sm"
        >
          <Upload className="size-4" />
          {parsing ? '解析中…' : '上传 Excel'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-stone-400" />
              确认导入名单
            </DialogTitle>
            <DialogDescription>
              来自「{pending?.fileName}」的解析结果，请选择导入方式。
            </DialogDescription>
          </DialogHeader>

          {r && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-stone-100 px-2 py-2">
                  <div className="text-lg font-semibold text-stone-800">
                    {r.students.length}
                  </div>
                  <div className="text-xs text-stone-500">名学生</div>
                </div>
                <div className="rounded-md bg-stone-100 px-2 py-2">
                  <div className="text-lg font-semibold text-stone-700">
                    {r.teachers.length}
                  </div>
                  <div className="text-xs text-stone-500">名老师</div>
                </div>
                <div className="rounded-md bg-stone-100 px-2 py-2">
                  <div className="text-lg font-semibold text-stone-700">
                    {r.skipped}
                  </div>
                  <div className="text-xs text-stone-500">行被跳过</div>
                </div>
              </div>

              {r.teachers.length > 0 && (
                <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                  提示：解析到 {r.teachers.length} 名老师，导入时将一并
                  <strong>替换</strong>现有老师名单。
                </p>
              )}

              {r.errors.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-stone-600">
                    以下 {r.errors.length} 处问题，对应内容不会被导入：
                  </p>
                  <ScrollArea className="h-28 rounded-md border border-stone-200 bg-stone-50">
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
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPending(null)}
              className="text-stone-500"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => applyImport('append')}
              className="border-stone-300 text-stone-700 hover:bg-stone-100"
            >
              追加到现有名单
            </Button>
            <Button
              type="button"
              onClick={() => applyImport('replace')}
              className="bg-stone-900 text-white hover:bg-stone-700"
            >
              替换现有名单
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
