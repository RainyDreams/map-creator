/**
 * 录入页数据工具条：导入 / 导出 / 分享。
 * - 导入面板：① 提前下载模板；② 导入 Excel（上传后先预览即将导入的数据，再选追加/替换）；
 *   ③ 导入 JSON（整幅画布备份，预览摘要后作为新画布导入，不覆盖现有内容）
 * - 导出面板：导出 Excel（名单）/ 导出 JSON（整幅画布）
 * 无 props，由录入页直接 <DataToolbar /> 使用。
 */
import { useRef, useState } from 'react'
import { Copy, Download, FileArchive, FileJson, FileSpreadsheet, Image as ImageIcon, Link2, Share2, Upload } from 'lucide-react'
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
import type { ParseResult } from '@/utils/excel'
import { exportCanvasJson, parseCanvasJson, type CanvasJsonPayload } from '@/utils/exportData'
import { requestMapExport } from '@/utils/exportBus'
import { buildShareUrl } from '@/utils/shareLink'
import { breadcrumb } from '@/utils/sessionLog'

/** xlsx 模块懒加载（代码分割：首屏不下载 Excel 引擎，首次使用模板/导入/导出时才加载） */
async function loadExcel(): Promise<typeof import('@/utils/excel')> {
  const t = performance.now()
  const mod = await import('@/utils/excel')
  console.info(`[Excel] 表格模块加载完成（+${Math.round(performance.now() - t)}ms）`)
  return mod
}

/** zip 备份模块懒加载（fflate 引擎首屏不下载，首次导入/导出 ZIP 时才加载） */
async function loadZip(): Promise<typeof import('@/utils/exportZip')> {
  const t = performance.now()
  const mod = await import('@/utils/exportZip')
  console.info(`[ZIP] 备份模块加载完成（+${Math.round(performance.now() - t)}ms）`)
  return mod
}

interface PendingExcel {
  result: ParseResult
  fileName: string
}

interface PendingJson {
  payload: CanvasJsonPayload
  fileName: string
  studentCount: number
  teacherCount: number
}

interface PendingZip {
  result: import('@/utils/exportZip').ImportedCanvasZip
  fileName: string
}

export default function DataToolbar() {
  const {
    data,
    theme,
    fontSlots,
    badge,
    customFonts,
    activeCanvasName,
    activeShare,
    importStudents,
    setData,
    importCanvas,
    addCustomFont,
  } = useMapData()

  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  // 面板中展示的链接：仅当前画布已绑定的历史链接（链接生成功能已置灰停用）
  const shownShareUrl = activeShare
    ? `${window.location.origin}/?share=${activeShare.id}`
    : null
  const shownShareExpiresAt = activeShare?.expiresAt ?? null

  /** hash 分享链接（纯前端生成，数据编码在 URL 里，不经过服务器） */
  const [hashShare, setHashShare] = useState<{ url: string; stripped: string[]; tooLarge: boolean } | null>(null)

  const handleBuildHashLink = () => {
    const result = buildShareUrl({ name: activeCanvasName, data, theme, fontSlots, badge })
    breadcrumb(`分享：生成链接（${result.tooLarge ? '超长' : '正常'}，剥离 ${result.stripped.length} 项）`)
    setHashShare(result)
    if (result.tooLarge) {
      toast.info('名单较长，链接已生成但可能超出部分浏览器限制', {
        description: '如对方打不开，请改用导出 JSON 文件分享',
      })
    }
  }

  const handleCopyHashLink = async () => {
    if (!hashShare) return
    try {
      await navigator.clipboard.writeText(hashShare.url)
      toast.success('链接已复制', { description: '发给同学，打开即可预览并加载到自己的画布' })
    } catch {
      const input = document.getElementById('hash-share-input') as HTMLInputElement | null
      input?.select()
      toast.info('请手动复制选中的链接')
    }
  }

  const excelInputRef = useRef<HTMLInputElement>(null)
  const jsonInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)
  const [pendingExcel, setPendingExcel] = useState<PendingExcel | null>(null)
  const [pendingJson, setPendingJson] = useState<PendingJson | null>(null)
  const [pendingZip, setPendingZip] = useState<PendingZip | null>(null)
  const [parsing, setParsing] = useState(false)
  /** Excel 引擎首次加载中的繁忙标记（下载模板 / 导出 Excel 共用，按钮显示加载动画） */
  const [excelBusy, setExcelBusy] = useState(false)
  /** ZIP 导出中的繁忙标记（首次需加载 fflate 引擎） */
  const [zipBusy, setZipBusy] = useState(false)

  /* ---------------- 导出 ---------------- */

  const handleExportExcel = async () => {
    setExcelBusy(true)
    breadcrumb('数据：导出 Excel')
    try {
      const { exportWorkbook } = await loadExcel()
      exportWorkbook(data)
      toast.success('已导出 Excel 名单', { description: '与模板同构，可再次上传导入' })
      setExportOpen(false)
    } catch (err) {
      breadcrumb(`数据：导出 Excel 失败（${err instanceof Error ? err.message : '未知'}）`)
      toast.error(err instanceof Error ? err.message : '导出失败，请重试')
    } finally {
      setExcelBusy(false)
    }
  }

  /** 下载模板（首点需加载 Excel 引擎，显示加载动画） */
  const handleDownloadTemplate = async () => {
    setExcelBusy(true)
    breadcrumb('数据：下载 Excel 模板')
    try {
      const { downloadTemplate } = await loadExcel()
      downloadTemplate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '模板生成失败，请重试')
    } finally {
      setExcelBusy(false)
    }
  }

  const handleExportJson = () => {
    breadcrumb('数据：导出 JSON')
    exportCanvasJson({ name: activeCanvasName, data, theme, fontSlots, badge })
    toast.success('已导出 JSON 画布文件', { description: '包含名单、主题、字体与班徽配置' })
    setExportOpen(false)
  }

  /** 导出 ZIP 全量备份：名单 + 主题 + 字体槽位 + 卡片位置 + 班徽 + 毛笔字/自定义校徽图片 + 自定义字体 */
  const handleExportZip = async () => {
    setZipBusy(true)
    breadcrumb('数据：导出 ZIP 全量备份')
    try {
      const { exportFullCanvasZip } = await loadZip()
      exportFullCanvasZip({ name: activeCanvasName, data, theme, fontSlots, badge, customFonts })
      toast.success('已导出 ZIP 全量备份', {
        description: '画布的全部内容与上传资源已打包，可通过「导入 ZIP」完整恢复',
      })
      setExportOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败，请重试')
    } finally {
      setZipBusy(false)
    }
  }

  /** 移动端「预览并导出为图片」：关闭面板 → 切到地图 Tab → 自动开始导出 */
  const handlePreviewExport = () => {
    breadcrumb('数据：预览并导出为图片')
    setExportOpen(false)
    requestMapExport()
  }

  /* ---------------- 分享为链接（已置灰停用，仅保留历史链接的复制入口） ---------------- */

  const handleCopyShareLink = async () => {
    if (!shownShareUrl) return
    try {
      await navigator.clipboard.writeText(shownShareUrl)
      toast.success('链接已复制')
    } catch {
      // 剪贴板 API 不可用时降级为手动复制：选中输入框内容
      const input = document.getElementById('share-link-input') as HTMLInputElement | null
      input?.select()
      toast.info('请手动复制选中的链接')
    }
  }

  /* ---------------- 导入 Excel ---------------- */

  const handleExcelChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return
    setParsing(true)
    setPendingJson(null)
    setPendingZip(null)
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
      setPendingExcel({ result, fileName: file.name })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '文件解析失败，请重试')
    } finally {
      setParsing(false)
    }
  }

  const applyExcelImport = (mode: 'replace' | 'append') => {
    if (!pendingExcel) return
    const { result } = pendingExcel
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
    setPendingExcel(null)
    setImportOpen(false)
  }

  /* ---------------- 导入 JSON ---------------- */

  const handleJsonChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPendingExcel(null)
    setPendingZip(null)
    try {
      const text = await file.text()
      const payload = parseCanvasJson(text)
      const d = payload.data as { students?: unknown; teachers?: unknown }
      setPendingJson({
        payload,
        fileName: file.name,
        studentCount: Array.isArray(d.students) ? d.students.length : 0,
        teacherCount: Array.isArray(d.teachers) ? d.teachers.length : 0,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'JSON 文件读取失败，请重试')
    }
  }

  const applyJsonImport = () => {
    if (!pendingJson) return
    const id = importCanvas({
      name: pendingJson.payload.name,
      data: pendingJson.payload.data,
      theme: pendingJson.payload.theme,
      fontSlots: pendingJson.payload.fontSlots,
      badge: pendingJson.payload.badge,
    })
    if (id === null) {
      toast.error('画布数据不完整，无法导入')
      return
    }
    breadcrumb(`数据：导入 JSON 画布「${pendingJson.payload.name || '未命名'}」（${pendingJson.studentCount} 名学生）`)
    toast.success(`已作为新画布导入「${pendingJson.payload.name || '未命名画布'}」`, {
      description: `${pendingJson.studentCount} 名学生，已自动切换过去`,
    })
    setPendingJson(null)
    setImportOpen(false)
  }

  /* ---------------- 导入 ZIP（全量备份） ---------------- */

  const handleZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setParsing(true)
    setPendingExcel(null)
    setPendingJson(null)
    try {
      const { importCanvasZip } = await loadZip()
      const result = await importCanvasZip(file)
      if (result.stats.students === 0 && result.stats.teachers === 0) {
        toast.error('备份文件中没有名单数据', { description: '请确认这是本工具导出的 ZIP 备份' })
        return
      }
      setPendingZip({ result, fileName: file.name })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ZIP 文件读取失败，请重试')
    } finally {
      setParsing(false)
    }
  }

  const applyZipImport = () => {
    if (!pendingZip) return
    const { result } = pendingZip
    const id = importCanvas(result.payload)
    if (id === null) {
      toast.error('画布数据不完整，无法导入')
      return
    }
    // 备份中的自定义字体注册到全局字体库（同 id 自动去重）
    result.customFonts.forEach((f) => addCustomFont(f))
    breadcrumb(`数据：导入 ZIP 画布「${result.payload.name || '未命名'}」（${result.stats.students} 名学生，毛笔字 ${result.stats.calligraphy}，校徽 ${result.stats.badges}，字体 ${result.stats.fonts}）`)
    const extras: string[] = []
    if (result.stats.calligraphy > 0) extras.push(`毛笔字 ${result.stats.calligraphy} 张`)
    if (result.stats.badges > 0) extras.push(`自定义校徽 ${result.stats.badges} 张`)
    if (result.stats.hasBadge) extras.push('班徽')
    if (result.stats.fonts > 0) extras.push(`自定义字体 ${result.stats.fonts} 个`)
    toast.success(`已作为新画布导入「${result.payload.name || '未命名画布'}」`, {
      description:
        `${result.stats.students} 名学生、主题/字体/卡片位置已还原` +
        (extras.length > 0 ? `，含${extras.join('、')}` : ''),
    })
    setPendingZip(null)
    setImportOpen(false)
  }

  const r = pendingExcel?.result

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setPendingExcel(null)
            setPendingJson(null)
            setPendingZip(null)
            setImportOpen(true)
          }}
          className="border-stone-200 bg-white text-xs text-stone-600 hover:bg-stone-100 hover:text-stone-900 md:text-sm"
        >
          <Upload className="size-4" />
          导入
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExportOpen(true)}
          className="border-stone-200 bg-white text-xs text-stone-600 hover:bg-stone-100 hover:text-stone-900 md:text-sm"
        >
          <Download className="size-4" />
          导出
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShareOpen(true)}
          className="border-stone-200 bg-white text-xs text-stone-600 hover:bg-stone-100 hover:text-stone-900 md:text-sm"
        >
          <Share2 className="size-4" />
          分享
        </Button>
      </div>

      {/* 隐藏文件输入 */}
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleExcelChange}
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleJsonChange}
      />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleZipChange}
      />

      {/* ==================== 导入面板 ==================== */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>导入</DialogTitle>
            <DialogDescription>
              支持 Excel 名单、JSON 画布与 ZIP 全量备份三种方式；导入前均可先预览
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* ① 提前下载模板 */}
            <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2.5">
              <div className="text-xs text-stone-500">
                还没有模板？先下载，按格式填好再回来上传
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={excelBusy}
                onClick={handleDownloadTemplate}
                className="shrink-0 border-stone-900 bg-stone-900 text-xs text-white hover:bg-stone-700 hover:text-white"
              >
                <Download className="size-3.5" />
                {excelBusy ? '加载中…' : '下载模板'}
              </Button>
            </div>

            {/* ② 导入 Excel */}
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
                <FileSpreadsheet className="h-4 w-4 text-stone-400" />
                导入 Excel
              </h3>
              {pendingExcel === null ? (
                <button
                  type="button"
                  disabled={parsing}
                  onClick={() => excelInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-4 text-xs text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700 disabled:opacity-50 md:text-sm"
                >
                  <Upload className="h-4 w-4" />
                  {parsing ? '正在解析…' : '选择 .xlsx / .xls / .csv 文件'}
                </button>
              ) : (
                r && (
                  <div className="space-y-3 rounded-lg border border-stone-200 p-3">
                    <p className="text-xs text-stone-500">
                      来自「{pendingExcel.fileName}」，即将导入：
                    </p>
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
                        onClick={() => setPendingExcel(null)}
                        className="text-stone-500"
                      >
                        重新选择
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => applyExcelImport('append')}
                        className="border-stone-300 text-stone-700 hover:bg-stone-100"
                      >
                        追加到现有名单
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => applyExcelImport('replace')}
                        className="bg-stone-900 text-white hover:bg-stone-700"
                      >
                        替换现有名单
                      </Button>
                    </div>
                  </div>
                )
              )}
            </section>

            {/* ③ 导入 JSON */}
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
                <FileJson className="h-4 w-4 text-stone-400" />
                导入 JSON
              </h3>
              {pendingJson === null ? (
                <button
                  type="button"
                  onClick={() => jsonInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-4 text-xs text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700 md:text-sm"
                >
                  <Upload className="h-4 w-4" />
                  选择本工具导出的 .json 画布文件
                </button>
              ) : (
                <div className="space-y-3 rounded-lg border border-stone-200 p-3">
                  <p className="text-xs text-stone-500">来自「{pendingJson.fileName}」：</p>
                  <div className="rounded-md bg-stone-50 px-3 py-2 text-xs leading-6 text-stone-600">
                    <div>
                      画布名：<span className="font-medium text-stone-800">
                        {pendingJson.payload.name || '（未命名）'}
                      </span>
                    </div>
                    <div>
                      名单：{pendingJson.studentCount} 名学生
                      {pendingJson.teacherCount > 0 ? `、${pendingJson.teacherCount} 名老师` : ''}
                      ，含主题 / 字体 / 班徽配置
                    </div>
                    {pendingJson.payload.exportedAt && (
                      <div>
                        导出时间：
                        {new Date(pendingJson.payload.exportedAt).toLocaleString('zh-CN')}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] leading-4 text-stone-400">
                    将作为<strong>新画布</strong>导入并自动切换，不会覆盖你现有的任何画布。
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingJson(null)}
                      className="text-stone-500"
                    >
                      重新选择
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={applyJsonImport}
                      className="bg-stone-900 text-white hover:bg-stone-700"
                    >
                      作为新画布导入
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* ④ 导入 ZIP（全量备份） */}
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
                <FileArchive className="h-4 w-4 text-stone-400" />
                导入 ZIP
              </h3>
              {pendingZip === null ? (
                <button
                  type="button"
                  disabled={parsing}
                  onClick={() => zipInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-4 text-xs text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700 disabled:opacity-50 md:text-sm"
                >
                  <Upload className="h-4 w-4" />
                  {parsing ? '正在解析…' : '选择本工具导出的 .zip 全量备份文件'}
                </button>
              ) : (
                <div className="space-y-3 rounded-lg border border-stone-200 p-3">
                  <p className="text-xs text-stone-500">来自「{pendingZip.fileName}」：</p>
                  <div className="rounded-md bg-stone-50 px-3 py-2 text-xs leading-6 text-stone-600">
                    <div>
                      画布名：
                      <span className="font-medium text-stone-800">
                        {pendingZip.result.payload.name || '（未命名）'}
                      </span>
                    </div>
                    <div>
                      名单：{pendingZip.result.stats.students} 名学生
                      {pendingZip.result.stats.teachers > 0
                        ? `、${pendingZip.result.stats.teachers} 名老师`
                        : ''}
                      ，含主题 / 字体 / 卡片位置配置
                    </div>
                    {(pendingZip.result.stats.calligraphy > 0 ||
                      pendingZip.result.stats.badges > 0 ||
                      pendingZip.result.stats.hasBadge ||
                      pendingZip.result.stats.fonts > 0) && (
                      <div>
                        资源：
                        {[
                          pendingZip.result.stats.calligraphy > 0 &&
                            `毛笔字 ${pendingZip.result.stats.calligraphy} 张`,
                          pendingZip.result.stats.badges > 0 &&
                            `自定义校徽 ${pendingZip.result.stats.badges} 张`,
                          pendingZip.result.stats.hasBadge && '班徽',
                          pendingZip.result.stats.fonts > 0 &&
                            `自定义字体 ${pendingZip.result.stats.fonts} 个`,
                        ]
                          .filter(Boolean)
                          .join('、')}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] leading-4 text-stone-400">
                    将作为<strong>新画布</strong>导入并自动切换，不会覆盖你现有的任何画布。
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingZip(null)}
                      className="text-stone-500"
                    >
                      重新选择
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={applyZipImport}
                      className="bg-stone-900 text-white hover:bg-stone-700"
                    >
                      作为新画布导入
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== 导出面板 ==================== */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>导出</DialogTitle>
            <DialogDescription>把当前画布的内容导出到本机文件</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {/* 黑底醒目按钮：跳到地图画面并自动导出 PNG（移动端会切到地图 Tab） */}
            <button
              type="button"
              onClick={handlePreviewExport}
              className="flex items-center gap-3 rounded-lg bg-stone-900 px-3.5 py-3 text-left text-white shadow-sm transition-colors hover:bg-stone-700"
            >
              <ImageIcon className="h-5 w-5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">预览并导出为图片</span>
                <span className="block text-xs text-stone-300">
                  跳转到地图画面，导出超清 PNG（微信中请长按图片保存）
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={excelBusy}
              onClick={handleExportExcel}
              className="flex items-center gap-3 rounded-lg border border-stone-200 px-3.5 py-3 text-left transition-colors hover:bg-stone-50 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-stone-400" />
              <span>
                <span className="block text-sm font-medium text-stone-800">
                  {excelBusy ? '正在加载表格模块…' : '导出 Excel'}
                </span>
                <span className="block text-xs text-stone-500">
                  仅名单（学生 + 老师），与模板同构，可再次导入
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-3 rounded-lg border border-stone-200 px-3.5 py-3 text-left transition-colors hover:bg-stone-50"
            >
              <FileJson className="h-5 w-5 shrink-0 text-stone-400" />
              <span>
                <span className="block text-sm font-medium text-stone-800">导出 JSON</span>
                <span className="block text-xs text-stone-500">
                  整幅画布（名单 + 主题 + 字体 + 班徽），用于备份或迁移
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={zipBusy}
              onClick={handleExportZip}
              className="flex items-center gap-3 rounded-lg border border-stone-200 px-3.5 py-3 text-left transition-colors hover:bg-stone-50 disabled:opacity-50"
            >
              <FileArchive className="h-5 w-5 shrink-0 text-stone-400" />
              <span>
                <span className="block text-sm font-medium text-stone-800">
                  {zipBusy ? '正在打包…' : '导出 ZIP（全量备份）'}
                </span>
                <span className="block text-xs text-stone-500">
                  画布的全部内容：配置、卡片位置、班徽、毛笔字与自定义校徽图片、自定义字体，可通过导入 ZIP 完整恢复
                </span>
              </span>
            </button>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setExportOpen(false)}
              className="text-stone-500"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== 分享面板：主路径是导出图片，链接分享为小选项 ==================== */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>分享这张蹭饭图</DialogTitle>
            <DialogDescription>
              推荐给同学和老师的方式：导出超清图片，直接发到班级群
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* 最明显的选项：导出为图片 */}
            <button
              type="button"
              onClick={() => {
                setShareOpen(false)
                requestMapExport()
              }}
              className="flex w-full items-center gap-3 rounded-lg bg-stone-900 px-3.5 py-3.5 text-left text-white shadow-sm transition-colors hover:bg-stone-700"
            >
              <ImageIcon className="h-6 w-6 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">导出为图片</span>
                <span className="block text-xs text-stone-300">
                  跳转到地图画面，导出超清 PNG（微信中请长按图片保存）
                </span>
              </span>
            </button>

            {shownShareUrl !== null && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="share-link-input"
                    readOnly
                    value={shownShareUrl}
                    onFocus={(e) => e.target.select()}
                    className="h-8 min-w-0 flex-1 rounded-md border border-stone-200 bg-stone-50 px-2.5 font-mono text-xs text-stone-700 outline-none"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCopyShareLink}
                    className="shrink-0 bg-stone-900 text-white hover:bg-stone-700"
                  >
                    <Copy className="size-3.5" />
                    复制
                  </Button>
                </div>
                {shownShareExpiresAt !== null && (
                  <p className="text-[11px] leading-4 text-stone-400">
                    有效期至 {new Date(shownShareExpiresAt).toLocaleString('zh-CN')}
                  </p>
                )}
              </div>
            )}

            {/* 次明显选项：在其他设备上继续此工作（纯前端 ?import= 编码，数据不经过服务器） */}
            <button
              type="button"
              onClick={handleBuildHashLink}
              className="flex w-full items-center gap-3 rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-left transition-colors hover:bg-stone-50"
            >
              <Link2 className="h-5 w-5 shrink-0 text-stone-500" />
              <span>
                <span className="block text-sm font-medium text-stone-800">
                  在其他设备上继续此工作
                </span>
                <span className="block text-xs text-stone-500">
                  生成一个链接（有效期 1 天），在另一台手机/电脑上打开即可接着编辑这张画布
                </span>
              </span>
            </button>

            {hashShare !== null && (
              <div className="w-full space-y-2 rounded-lg border border-stone-200 bg-stone-50/60 p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    id="hash-share-input"
                    readOnly
                    value={hashShare.url}
                    onFocus={(e) => e.target.select()}
                    className="h-8 min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-2.5 font-mono text-xs text-stone-700 outline-none"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCopyHashLink}
                    className="shrink-0 bg-stone-900 text-white hover:bg-stone-700"
                  >
                    <Copy className="size-3.5" />
                    复制
                  </Button>
                </div>
                <p className="text-[11px] leading-4 text-stone-400">
                  链接有效期 1 天，一天内打开可将这张画布导入到自己的画布中。
                  链接内容是生成这一刻的画布快照，之后你的修改不会同步，需重新生成。
                  {hashShare.stripped.length > 0 &&
                    `（${hashShare.stripped.join('、')}不随链接传输）`}
                </p>
                {hashShare.tooLarge && (
                  <p className="text-[11px] leading-4 text-amber-600">
                    名单较长，链接可能超出部分浏览器/微信的长度限制；对方打不开时请改用导出
                    JSON 文件分享。
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShareOpen(false)}
              className="text-stone-500"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
