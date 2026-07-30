import { useRef, useState } from 'react'
import { ImagePlus, Sparkles, Trash2, Type } from 'lucide-react'
import { toast } from 'sonner'
import { useMapData } from '@/store/MapDataContext'
import { SizeSelect } from '@/components/entry/SizeSelect'
import { Section } from '@/components/entry/Section'
import { breadcrumb } from '@/utils/sessionLog'
import { newId, type DecorationItem } from '@/types'

/** 文本装饰字号档位（画布基准 px） */
const TEXT_SIZE_OPTIONS: readonly number[] = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48]
/** 图片装饰显示宽度档位（画布基准 px） */
const IMAGE_WIDTH_OPTIONS: readonly number[] = [60, 80, 100, 120, 160, 200, 260, 320, 400]
/** 文本颜色预设（'' = 跟随主题正文色） */
const TEXT_COLOR_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: '跟随主题', value: '' },
  { label: '墨黑', value: '#292524' },
  { label: '朱红', value: '#b91c1c' },
  { label: '靛蓝', value: '#1e40af' },
  { label: '松绿', value: '#166534' },
  { label: '暖棕', value: '#92400e' },
]

/** 图片上传处理：压缩到最长边 600px PNG dataURL（保留透明底） */
function processImageFile(file: File): Promise<string> {
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
 * 装饰元素面板（v1.38）：在画布上添加自由文本框与图片，便于装饰留白处。
 * 添加后在地图画布上直接拖动调整位置（画布内限幅）；字号/宽度与文本颜色在此面板调整；
 * 随导出进 PNG，随 ZIP 全量备份。
 */
export function DecorationPanel() {
  const { data, setData } = useMapData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [textDraft, setTextDraft] = useState('')
  const bc = (text: string) => breadcrumb(`装饰：${text}`)

  const addText = () => {
    const text = textDraft.trim().slice(0, 30)
    if (text === '') {
      toast.error('先输入要添加的文字')
      return
    }
    const item: DecorationItem = {
      id: newId(),
      kind: 'text',
      text,
      dataUrl: '',
      x: 120,
      y: 120,
      size: 20,
      color: '',
    }
    setData((prev) => ({ ...prev, decorations: [...prev.decorations, item] }))
    bc(`添加文本框「${text}」`)
    setTextDraft('')
    toast.success('文本框已添加到画布左上角', { description: '到地图上直接拖动它到合适的位置' })
  }

  const handleUpload = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片不能超过 5MB')
      return
    }
    processImageFile(file)
      .then((dataUrl) => {
        const item: DecorationItem = {
          id: newId(),
          kind: 'image',
          text: '',
          dataUrl,
          x: 120,
          y: 120,
          size: 160,
          color: '',
        }
        setData((prev) => ({ ...prev, decorations: [...prev.decorations, item] }))
        bc(`添加装饰图片（${Math.round(file.size / 1024)}KB）`)
        toast.success('图片已添加到画布左上角', { description: '到地图上直接拖动它到合适的位置' })
      })
      .catch(() => {
        bc('装饰图片读取失败')
        toast.error('读取图片失败，请换一张重试')
      })
  }

  const updateItem = (id: string, patch: Partial<DecorationItem>) => {
    setData((prev) => ({
      ...prev,
      decorations: prev.decorations.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }))
  }

  const removeItem = (item: DecorationItem) => {
    setData((prev) => ({
      ...prev,
      decorations: prev.decorations.filter((it) => it.id !== item.id),
    }))
    bc(item.kind === 'text' ? `删除文本框「${item.text}」` : '删除装饰图片')
  }

  return (
    <Section
      icon={Sparkles}
      title="装饰元素"
      titleHint="可选"
      summary={data.decorations.length > 0 ? `${data.decorations.length} 个` : undefined}
      mobileOpen={false}
    >
      {/* 添加区：文本框（输入 + 按钮）与图片（上传按钮） */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={textDraft}
          maxLength={30}
          placeholder="输入装饰文字，如「前程似锦」"
          onChange={(e) => setTextDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addText()
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-stone-200 px-2 text-xs text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none md:h-9"
        />
        <button
          type="button"
          onClick={addText}
          className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-stone-900 px-2.5 text-xs text-white transition-colors hover:bg-stone-700 md:h-9"
        >
          <Type className="h-3.5 w-3.5" />
          添加文本框
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title="上传装饰图片（PNG/JPG，≤5MB，透明底最佳）"
          className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-stone-200 px-2.5 text-xs text-stone-600 transition-colors hover:bg-stone-50 md:h-9"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          添加图片
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleUpload(f)
            e.target.value = ''
          }}
        />
      </div>

      {/* 已添加列表：文本可改内容与颜色、图片可改宽度；两者都可调大小与删除 */}
      {data.decorations.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-stone-100 pt-2.5">
          {data.decorations.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              {item.kind === 'text' ? (
                <>
                  <input
                    type="text"
                    value={item.text}
                    maxLength={30}
                    aria-label="装饰文字内容"
                    onChange={(e) => updateItem(item.id, { text: e.target.value.slice(0, 30) })}
                    className="h-8 min-w-0 flex-1 rounded-md border border-stone-200 px-2 text-xs text-stone-700 focus:border-stone-400 focus:outline-none"
                  />
                  {/* 文本颜色：预设色板 + 自定义取色 */}
                  <div className="flex shrink-0 items-center gap-1">
                    {TEXT_COLOR_PRESETS.map((c) => {
                      const active = item.color === c.value
                      return (
                        <button
                          key={c.label}
                          type="button"
                          title={c.label}
                          aria-label={`文字颜色：${c.label}`}
                          aria-pressed={active}
                          onClick={() => updateItem(item.id, { color: c.value })}
                          className={
                            active
                              ? 'h-[18px] w-[18px] rounded-full border-2 border-stone-700 ring-1 ring-stone-300'
                              : 'h-[18px] w-[18px] rounded-full border border-stone-300 transition-transform hover:scale-110'
                          }
                          style={{
                            backgroundColor: c.value === '' ? undefined : c.value,
                            backgroundImage:
                              c.value === ''
                                ? 'linear-gradient(135deg,#fafaf9 0%,#fafaf9 49%,#d6d3d1 50%,#fafaf9 51%)'
                                : undefined,
                          }}
                        />
                      )
                    })}
                  </div>
                  <SizeSelect
                    value={item.size}
                    options={TEXT_SIZE_OPTIONS}
                    onChange={(px) => updateItem(item.id, { size: px })}
                    ariaLabel="装饰文字字号"
                  />
                </>
              ) : (
                <>
                  <img
                    src={item.dataUrl}
                    alt="装饰图片缩略图"
                    className="h-8 w-8 shrink-0 rounded border border-stone-200 object-contain"
                  />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-stone-400">
                    图片 · 到地图上拖动调整位置
                  </span>
                  <SizeSelect
                    value={item.size}
                    options={IMAGE_WIDTH_OPTIONS}
                    onChange={(px) => updateItem(item.id, { size: px })}
                    ariaLabel="装饰图片宽度"
                  />
                </>
              )}
              <button
                type="button"
                onClick={() => removeItem(item)}
                title="删除该装饰元素"
                className="shrink-0 rounded-md p-1.5 text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 text-[11px] leading-relaxed text-stone-400">
        添加后到地图上直接拖动调整位置（手机端先点一下选中，再拖动）。
        文字字体跟随「班级信息」的中文字体，装饰会一起导出到图片和全量备份中。
      </p>
    </Section>
  )
}
