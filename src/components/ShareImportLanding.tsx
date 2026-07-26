/**
 * hash 分享链接的预览落地页：
 * 打开 #import= 链接后先在本地解码出画布 JSON 并预览（画布名 / 人数 / 省份数 / 名单），
 * 主选项「加载到我的新画布」（导入为独立新画布，不覆盖现有画布）；
 * 次选项「仅下载 JSON」（不显眼的小字链接），以及「不导入，直接返回」。
 */
import { useMemo } from 'react'
import { toast } from 'sonner'
import { Download, Map as MapIcon, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMapData } from '@/store/MapDataContext'
import { exportCanvasJson } from '@/utils/exportData'
import { resolveProvince } from '@/utils/geo'
import type { MapData, StudentEntry } from '@/types'
import type { ShareLinkPayload } from '@/utils/shareLink'

interface PreviewRow {
  name: string
  university: string
  city: string
  overseas?: boolean
}

/** 从未经 normalize 的 payload.data 中尽量提取预览信息（导入前不做完整校验） */
function extractPreview(data: unknown): {
  rows: PreviewRow[]
  studentCount: number
  teacherCount: number
  provinceCount: number
  title: string
} {
  const d = (data ?? {}) as Partial<MapData>
  const students = Array.isArray(d.students) ? (d.students as StudentEntry[]) : []
  const teachers = Array.isArray(d.teachers) ? d.teachers : []
  const provinces = new Set<string>()
  for (const s of students) {
    if (s && s.overseas !== true) {
      const p = resolveProvince(s)
      if (p !== null) provinces.add(p)
    }
  }
  const rows: PreviewRow[] = students
    .filter((s): s is StudentEntry => !!s && typeof s === 'object')
    .map((s) => ({
      name: typeof s.name === 'string' ? s.name : '',
      university: typeof s.university === 'string' ? s.university : '',
      city: typeof s.city === 'string' ? s.city : '',
      overseas: s.overseas === true,
    }))
  return {
    rows,
    studentCount: rows.length,
    teacherCount: teachers.length,
    provinceCount: provinces.size,
    title: typeof d.title === 'string' ? d.title : '',
  }
}

export function ShareImportLanding({
  payload,
  onClose,
}: {
  payload: ShareLinkPayload
  onClose: () => void
}) {
  const { importCanvas } = useMapData()
  const name = typeof payload.name === 'string' && payload.name !== '' ? payload.name : '未命名画布'
  const preview = useMemo(() => extractPreview(payload.data), [payload.data])

  // 链接已超过 1 天有效期：只展示过期提示，不提供导入
  if (payload.expired === true) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-100">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-8 md:py-12">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:p-7">
            <p className="text-xs text-stone-400">蹭饭图分享链接</p>
            <h1 className="mt-1 text-xl font-bold text-stone-900">链接已过期</h1>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              分享链接的有效期为 1 天，这条链接已超过有效期，无法再继续导入。
              请联系分享者重新生成一条新链接。
            </p>
            <div className="mt-5">
              <Button
                type="button"
                onClick={onClose}
                className="h-11 w-full bg-stone-900 text-sm font-semibold text-white hover:bg-stone-700"
              >
                返回蹭饭图生成器
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const handleImport = () => {
    const id = importCanvas({
      name: payload.name,
      data: payload.data,
      theme: payload.theme,
      fontSlots: payload.fontSlots,
      badge: null,
    })
    if (id === null) {
      toast.error('分享的画布数据不完整，无法导入')
      return
    }
    toast.success(`已导入「${name}」`, { description: `${preview.studentCount} 名学生，已作为新画布打开` })
    onClose()
  }

  const handleDownload = () => {
    exportCanvasJson({
      name,
      data: payload.data,
      theme: payload.theme,
      fontSlots: payload.fontSlots,
      badge: null,
    })
    toast.success('已下载 JSON 文件', { description: '之后可在「导入」面板中作为新画布导入' })
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-100">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-8 md:py-12">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-stone-400">有人向你分享了一张蹭饭图画布</p>
              <h1 className="mt-1 text-xl font-bold text-stone-900">{name}</h1>
              {preview.title !== '' && (
                <p className="mt-0.5 text-sm text-stone-500">标题：{preview.title}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="rounded-md p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* 概览指标 */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { icon: Users, label: '学生', value: preview.studentCount },
              { icon: MapIcon, label: '省份', value: preview.provinceCount },
              { icon: Users, label: '老师', value: preview.teacherCount },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-lg border border-stone-100 bg-stone-50/70 px-3 py-2.5 text-center"
              >
                <m.icon className="mx-auto h-4 w-4 text-stone-400" />
                <div className="mt-1 text-lg font-semibold tabular-nums text-stone-800">
                  {m.value}
                </div>
                <div className="text-[11px] text-stone-400">{m.label}</div>
              </div>
            ))}
          </div>

          {/* 名单预览（只读，完整展示，超高滚动） */}
          {preview.rows.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-lg border border-stone-200">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-stone-50 text-stone-500">
                      <th className="px-3 py-2 font-medium">姓名</th>
                      <th className="px-3 py-2 font-medium">大学</th>
                      <th className="px-3 py-2 font-medium">地区</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="border-t border-stone-100 text-stone-700">
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5">{r.university}</td>
                        <td className="px-3 py-1.5 text-stone-500">
                          {r.overseas ? '海外' : r.city}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-stone-100 bg-stone-50/60 px-3 py-1.5 text-[11px] text-stone-400">
                共 {preview.rows.length} 人，导入后可继续编辑
              </p>
            </div>
          )}

          <p className="mt-3 text-[11px] leading-4 text-stone-400">
            图片类内容（大学毛笔字、自定义校徽、班徽）不随链接传输；导入后可在本机重新上传。
            导入会生成一张<strong>独立的新画布</strong>，不会覆盖你现有的任何画布。
          </p>

          {/* 主操作 */}
          <div className="mt-5 flex flex-col gap-2">
            <Button
              type="button"
              onClick={handleImport}
              className="h-11 w-full bg-stone-900 text-sm font-semibold text-white hover:bg-stone-700"
            >
              加载到我的新画布
            </Button>
            <div className="flex items-center justify-center gap-4 pt-1">
              {/* 次选项：不显眼的小字链接 */}
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1 text-[11px] text-stone-400 underline-offset-2 transition-colors hover:text-stone-600 hover:underline"
              >
                <Download className="h-3 w-3" />
                仅下载 JSON
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-[11px] text-stone-400 transition-colors hover:text-stone-600"
              >
                不导入，直接返回
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
