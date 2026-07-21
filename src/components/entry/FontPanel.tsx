import { useRef, useState } from 'react'
import { Type, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useMapData } from '@/store/MapDataContext'
import {
  CUSTOM_FONT_MAX_BYTES,
  FONT_SLOT_LABELS,
  PRESET_FONTS,
  customFontFamilyName,
  presetFontById,
  type CustomFont,
  type FontSlot,
} from '@/utils/fonts'
import { newId } from '@/types'

const SLOTS: FontSlot[] = ['year', 'title', 'province', 'person', 'place']

/**
 * 字体设置面板：5 个槽位独立选字体（预设 + 用户上传），
 * 上传按钮刻意做小——主要路径是预设字体。
 */
export function FontPanel() {
  const { fontSlots, setFontSlot, customFonts, addCustomFont, removeCustomFont } = useMapData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  function handleUpload(file: File) {
    if (file.size > CUSTOM_FONT_MAX_BYTES) {
      toast.error('字体文件过大', { description: '请选择 3MB 以内的字体文件（过大的字体会占用本地存储）' })
      return
    }
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) {
      toast.error('不支持的格式', { description: '请上传 .ttf / .otf / .woff / .woff2 字体文件' })
      return
    }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const font: CustomFont = {
        id: newId(),
        name: file.name.replace(/\.(ttf|otf|woff2?)$/i, ''),
        dataUrl: String(reader.result),
      }
      addCustomFont(font)
      toast.success(`字体「${font.name}」已添加`, { description: '可在各模块的下拉列表中选用' })
      setUploading(false)
    }
    reader.onerror = () => {
      toast.error('读取文件失败，请重试')
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-3 md:p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
          <Type className="h-4 w-4 text-stone-400" />
          字体设置
        </h2>
        {/* 上传入口刻意小巧：预设字体是主路径 */}
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          title="上传自己的字体（.ttf/.otf/.woff2，≤3MB）"
          className="flex items-center gap-1 rounded-md border border-stone-200 px-1.5 py-1 text-[11px] text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700 disabled:opacity-50"
        >
          <Upload className="h-3 w-3" />
          上传字体
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleUpload(f)
            e.target.value = ''
          }}
        />
      </header>

      <div className="space-y-2.5">
        {SLOTS.map((slot) => (
          <label key={slot} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-stone-500 md:w-24">
              {FONT_SLOT_LABELS[slot]}
            </span>
            <select
              value={fontSlots[slot]}
              onChange={(e) => setFontSlot(slot, e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-2 text-xs text-stone-700 outline-none focus:border-stone-400 md:h-9 md:text-sm"
            >
              {PRESET_FONTS.map((f) => (
                <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>
                  {f.name}
                  {f.note ? `（${f.note}）` : ''}
                </option>
              ))}
              {customFonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}（自定义）
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {customFonts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2.5">
          {customFonts.map((f) => (
            <span
              key={f.id}
              className="flex items-center gap-1 rounded-full bg-stone-100 py-0.5 pr-1 pl-2.5 text-[11px] text-stone-600"
              style={{ fontFamily: `"${customFontFamilyName(f)}"` }}
            >
              {f.name}
              <button
                type="button"
                onClick={() => removeCustomFont(f.id)}
                title="删除该字体"
                className="rounded-full p-0.5 hover:bg-stone-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="mt-2.5 text-[11px] leading-relaxed text-stone-400">
        预设字体均为免费可商用字体（马善政毛笔体 / 思源黑体为 SIL OFL，站酷系列、阿里妈妈数黑体官方免费商用）。
        上传的字体仅保存在你自己的浏览器中。
      </p>
    </section>
  )
}

export { presetFontById }
