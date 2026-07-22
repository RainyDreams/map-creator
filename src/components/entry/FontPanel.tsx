import { useRef, useState } from 'react'
import { Sparkles, Type, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useMapData } from '@/store/MapDataContext'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  CUSTOM_FONT_MAX_BYTES,
  FONT_SLOT_LABELS,
  customFontFamilyName,
  presetFontById,
  type CustomFont,
} from '@/utils/fonts'
import { FontSelect } from '@/components/entry/FontSelect'
import { SizeSelect } from '@/components/entry/SizeSelect'
import { FitAdviceDialog } from '@/components/map/FitAdviceDialog'
import { recommendFontSizes } from '@/components/map/labels'
import { resolveProvince } from '@/utils/geo'
import { newId, type StudentEntry } from '@/types'

// 标题相关的三个槽位（数字/英文/中文）已上移到「班级信息」标题控制区，
// 本面板只保留地图标注相关的三个槽位
const SLOTS = ['province', 'person', 'place'] as const
/** 各标注槽位的字号档位（px，以 1500px 宽画布为基准） */
const SIZE_OPTIONS: Record<(typeof SLOTS)[number], readonly number[]> = {
  province: [12, 14, 16, 18, 20, 22, 24, 26],
  person: [10, 11, 12, 13, 14, 15, 16, 18, 20],
  place: [10, 11, 12, 13, 14, 15, 16, 18, 20],
}
/** 老师名单字号档位（与学生姓名同范围） */
const TEACHER_SIZE_OPTIONS: readonly number[] = [10, 11, 12, 13, 14, 15, 16, 18, 20]
/** 省份卡片圆角档位（画布单位） */
const CARD_RADIUS_OPTIONS: readonly number[] = [0, 6, 10, 14, 20]

/**
 * 字体设置面板：地图标注类槽位（省份名/姓名/城市大学）独立选字体（预设 + 用户上传），
 * 上传按钮刻意做小——主要路径是预设字体。
 */
export function FontPanel() {
  const { data, setData, fontSlots, setFontSlot, customFonts, addCustomFont, removeCustomFont } = useMapData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  /** 「推荐设置」字号建议弹窗内容 */
  const [fontAdvice, setFontAdvice] = useState<{
    sizes: { province: number; person: number; place: number }
    direction: 'up' | 'down'
  } | null>(null)

  /** 推荐设置：按当前人数/列数，以地图纵向高度为预算算出最美观的字号 */
  function handleRecommend() {
    const groups = new Map<string, StudentEntry[]>()
    for (const s of data.students) {
      if (s.overseas === true) continue
      const p = resolveProvince(s)
      if (p === null) continue
      const list = groups.get(p)
      if (list) list.push(s)
      else groups.set(p, [s])
    }
    if (groups.size === 0) {
      toast('先录入一些同学，再使用推荐设置')
      return
    }
    const rec = recommendFontSizes(groups, {
      sizes: data.labelSizes,
      columnsPerSide: data.labelColumns,
      manualProvinces: new Set(data.customOrderProvinces),
      calligraphy: data.calligraphy,
      badgeOverrides: data.badgeOverrides,
      mergeSameSchool: data.mergeSameSchool,
      cardBg: data.labelCardBg,
    })
    if (!rec) {
      toast.success('当前字号已经很合适', { description: '与页面空间匹配良好，无需调整' })
      return
    }
    setFontAdvice(rec)
  }

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
        <div className="flex items-center gap-1.5">
          {/* 推荐设置：按人数/列数计算最美观的字号（弹窗确认后生效） */}
          <button
            type="button"
            onClick={handleRecommend}
            title="根据同学人数与列数，推荐合适的字号"
            className="flex items-center gap-1 rounded-md border border-stone-200 px-1.5 py-1 text-[11px] text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700"
          >
            <Sparkles className="h-3 w-3" />
            推荐设置
          </button>
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
        </div>
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
          <div key={slot} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-stone-500 md:w-24">
              {FONT_SLOT_LABELS[slot]}
            </span>
            <FontSelect
              value={fontSlots[slot]}
              onChange={(id) => setFontSlot(slot, id)}
              ariaLabel={`${FONT_SLOT_LABELS[slot]}字体`}
            />
            <SizeSelect
              value={data.labelSizes[slot]}
              options={SIZE_OPTIONS[slot]}
              onChange={(px) =>
                setData((prev) => ({
                  ...prev,
                  labelSizes: { ...prev.labelSizes, [slot]: px },
                }))
              }
              ariaLabel={`${FONT_SLOT_LABELS[slot]}字号`}
            />
          </div>
        ))}
        {/* 老师名单只有字号可调（字体跟随标题/姓名/地点槽位） */}
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-stone-500 md:w-24">老师名单</span>
          <span className="min-w-0 flex-1 text-[11px] text-stone-400">
            字体随上方设置，仅调字号
          </span>
          <SizeSelect
            value={data.labelSizes.teacher}
            options={TEACHER_SIZE_OPTIONS}
            onChange={(px) =>
              setData((prev) => ({
                ...prev,
                labelSizes: { ...prev.labelSizes, teacher: px },
              }))
            }
            ariaLabel="老师名单字号"
          />
        </div>
      </div>

      {/* 每侧标注列数：人多时两列更宽松（文字列宽减半、换行更多） */}
      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2.5">
        <span className="text-xs text-stone-500">每侧标注列数</span>
        <div className="flex overflow-hidden rounded-md border border-stone-200" role="radiogroup" aria-label="每侧标注列数">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={data.labelColumns === n}
              onClick={() => setData((prev) => ({ ...prev, labelColumns: n }))}
              className={
                data.labelColumns === n
                  ? 'bg-stone-900 px-2.5 py-1 text-[11px] text-white'
                  : 'bg-white px-2.5 py-1 text-[11px] text-stone-500 transition-colors hover:bg-stone-50'
              }
            >
              {n === 1 ? '一列' : '两列（人多时）'}
            </button>
          ))}
        </div>
      </div>

      {/* 校徽显示开关：关闭后地图与导出图中都不渲染校徽，大学文字照常 */}
      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2.5">
        <Label htmlFor="badge-toggle" className="text-xs text-stone-500">
          在大学名前显示校徽图片
        </Label>
        <Switch
          id="badge-toggle"
          checked={data.showBadges}
          onCheckedChange={(v) => setData((prev) => ({ ...prev, showBadges: v }))}
          aria-label="在大学名前显示校徽图片"
        />
      </div>

      {/* 同校合并：同一大学的多名同学姓名竖排，学校信息只显示一次 */}
      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2.5">
        <Label htmlFor="merge-school-toggle" className="text-xs text-stone-500">
          同校合并（同大学的人姓名竖排，校名只显示一次）
        </Label>
        <Switch
          id="merge-school-toggle"
          checked={data.mergeSameSchool}
          onCheckedChange={(v) => setData((prev) => ({ ...prev, mergeSameSchool: v }))}
          aria-label="同校合并"
        />
      </div>

      {/* 省份卡片背景：每个省份名单衬一个圆角卡片，引线被卡片遮住不再穿过名单 */}
      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2.5">
        <Label htmlFor="card-bg-toggle" className="text-xs text-stone-500">
          省份名单卡片背景
        </Label>
        <Switch
          id="card-bg-toggle"
          checked={data.labelCardBg}
          onCheckedChange={(v) => setData((prev) => ({ ...prev, labelCardBg: v }))}
          aria-label="省份名单卡片背景"
        />
      </div>
      {data.labelCardBg && (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-stone-500 md:w-24">卡片圆角</span>
          <span className="min-w-0 flex-1 text-[11px] text-stone-400">0 为直角</span>
          <SizeSelect
            value={data.cardRadius}
            options={CARD_RADIUS_OPTIONS}
            onChange={(r) => setData((prev) => ({ ...prev, cardRadius: r }))}
            ariaLabel="卡片圆角"
          />
        </div>
      )}

      {/* 「推荐设置」字号建议弹窗 */}
      <FitAdviceDialog
        open={fontAdvice !== null}
        onOpenChange={(open) => {
          if (!open) setFontAdvice(null)
        }}
        title="推荐字号设置"
        description={
          fontAdvice?.direction === 'up'
            ? '当前空间比较充裕，字号可以适当放大，整体会更美观：'
            : '按当前人数与列数，字号偏大、内容会被迫整体缩小，建议调整为：'
        }
        changes={
          fontAdvice
            ? [
                `省份名字号：${data.labelSizes.province}px → ${fontAdvice.sizes.province}px`,
                `姓名字号：${data.labelSizes.person}px → ${fontAdvice.sizes.person}px`,
                `城市/大学字号：${data.labelSizes.place}px → ${fontAdvice.sizes.place}px`,
              ]
            : []
        }
        onApply={() => {
          if (!fontAdvice) return
          setData((prev) => ({ ...prev, labelSizes: { ...prev.labelSizes, ...fontAdvice.sizes } }))
          toast.success('已应用推荐字号')
        }}
      />

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
