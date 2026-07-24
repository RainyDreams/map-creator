import { useEffect, useMemo, useRef, useState } from 'react'
import { SlidersHorizontal, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useMapData } from '@/store/MapDataContext'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  CUSTOM_FONT_MAX_BYTES,
  FONT_SLOT_LABELS,
  customFontFamilyName,
  presetFontById,
  type CustomFont,
} from '@/utils/fonts'
import { FontSelect } from '@/components/entry/FontSelect'
import { SizeSelect } from '@/components/entry/SizeSelect'
import { Section } from '@/components/entry/Section'
import { recommendFontSizes, recommendLabelFit, applyProvinceSplits } from '@/components/map/labels'
import { isGeoReady, loadGeoFeatures } from '@/components/map/geo'
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
/** 卡片不透明度档位（百分比，存储时 /100） */
const CARD_OPACITY_OPTIONS: readonly number[] = [100, 92, 85, 75, 60, 45, 30]
/** 卡片边缘羽化档位（画布单位，0 = 清晰边缘） */
const CARD_BLUR_OPTIONS: readonly number[] = [0, 2, 4, 6, 8, 10]
/** 卡片颜色预设（'' = 跟随主题页脚底色） */
const CARD_COLOR_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: '跟随主题', value: '' },
  { label: '纯白', value: '#ffffff' },
  { label: '米白', value: '#faf6ef' },
  { label: '浅灰', value: '#f5f5f4' },
  { label: '暖黄', value: '#fef3c7' },
  { label: '青绿', value: '#e7f6ec' },
  { label: '雾蓝', value: '#eaf1f8' },
  { label: '绯红', value: '#fbeaea' },
]

/**
 * 排版设计面板（原「字体设置」，v1.24.3 起分组归类）：
 * 「字体与字号」——地图标注类槽位（省份名/姓名/城市大学）独立选字体（预设 + 用户上传）+ 字号；
 * 「卡片布局」——省份卡片位置、统一卡片宽度、同校合并；
 * 「校徽」——显示开关与大小；
 * 「卡片样式」——背景、圆角、颜色、不透明度、羽化。
 * 上传按钮刻意做小——主要路径是预设字体。
 */
export function FontPanel() {
  const { data, setData, fontSlots, setFontSlot, customFonts, addCustomFont, removeCustomFont } = useMapData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  /* ---------- 行内推荐标注（去弹窗化） ----------
   * 字号推荐：以地图纵向高度为预算，算出恰好用满空间的字号（含毛笔字图片高度协调）；
   * 列数推荐：能一列绝不分两列，超高 1.1 倍才建议两列；两列能放回一列时反向建议。
   * 推荐值以小标注形式出现在对应设置项旁，点击才应用——不弹窗、不擅改。 */
  const groups = useMemo(() => {
    const g = new Map<string, StudentEntry[]>()
    for (const s of data.students) {
      if (s.overseas === true) continue
      const p = resolveProvince(s)
      if (p === null) continue
      const list = g.get(p)
      if (list) list.push(s)
      else g.set(p, [s])
    }
    return applyProvinceSplits(g, data.provinceSplits)
  }, [data.students, data.provinceSplits])

  const layoutOptions = useMemo(
    () => ({
      sizes: data.labelSizes,
      columnsPerSide: data.labelColumns,
      layout: data.labelLayout,
      manualProvinces: new Set([...data.customOrderProvinces, ...Object.keys(data.provinceSplits)]),
      calligraphy: data.calligraphy,
      badgeOverrides: data.badgeOverrides,
      mergeSameSchool: data.mergeSameSchool,
      cardBg: data.labelCardBg,
    }),
    [
      data.labelSizes,
      data.labelColumns,
      data.labelLayout,
      data.customOrderProvinces,
      data.provinceSplits,
      data.calligraphy,
      data.badgeOverrides,
      data.mergeSameSchool,
      data.labelCardBg,
    ],
  )

  /** 地图轮廓数据异步加载完成后触发推荐重算（投影未就绪时布局预算不可用，推荐会错误地为 null） */
  const [geoTick, setGeoTick] = useState(0)
  useEffect(() => {
    if (isGeoReady()) return
    let cancelled = false
    loadGeoFeatures()
      .then(() => {
        if (!cancelled) setGeoTick((t) => t + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  /** 字号推荐（null = 当前已合适或无数据） */
  const sizeRec = useMemo(
    () => (groups.size > 0 && isGeoReady() ? recommendFontSizes(groups, layoutOptions) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, layoutOptions, geoTick],
  )
  /** 列数/整体排版推荐（null = 无需建议） */
  const fitRec = useMemo(
    () => (groups.size > 0 && isGeoReady() ? recommendLabelFit(groups, layoutOptions) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, layoutOptions, geoTick],
  )

  /** 应用单个槽位的推荐字号 */
  function applySizeRec(slot: (typeof SLOTS)[number]) {
    if (!sizeRec) return
    const px = sizeRec.sizes[slot]
    setData((prev) => ({ ...prev, labelSizes: { ...prev.labelSizes, [slot]: px } }))
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
    <Section
      icon={SlidersHorizontal}
      title="排版设计"
      summary={`${data.labelLayout === 'vertical' ? '竖版' : data.labelColumns === 2 ? '两列' : '一列'} · ${data.labelSizes.person}px`}
      mobileOpen={false}
      headerExtra={
        <>
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
        </>
      }
    >

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
            {/* 行内推荐标注：与当前值不同才出现，点击应用该槽位的推荐字号 */}
            {sizeRec && sizeRec.sizes[slot] !== data.labelSizes[slot] && (
              <button
                type="button"
                onClick={() => applySizeRec(slot)}
                title={`按当前人数与空间，推荐使用 ${sizeRec.sizes[slot]}px（点击应用）`}
                className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 text-[10px] whitespace-nowrap text-amber-700 transition-colors hover:bg-amber-100"
              >
                推荐 {sizeRec.sizes[slot]}px
              </button>
            )}
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

      {customFonts.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2.5">
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

      {/* ============ 卡片布局 ============ */}
      <div className="mt-3 border-t border-stone-100 pt-2.5 text-[11px] font-medium tracking-wide text-stone-400">
        卡片布局
      </div>
      {/* 省份卡片位置：一列/两列为自动布局——切换到它们会重置全部自定义位置（省份卡片 + 老师块）；
          自定义从当前所见状态开始（历史偏移不恢复）；直接拖动卡片也会从当前状态切入自定义 */}
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            省份卡片位置
            {/* 行内推荐标注：超高 1.1 倍才建议两列；两列能放回一列时反向建议 */}
            {fitRec?.twoColumns === true && data.labelColumns === 1 && (
              <button
                type="button"
                onClick={() => setData((prev) => ({ ...prev, labelColumns: 2, customPosition: false, provinceOffsets: {}, teachersOffset: { dx: 0, dy: 0 }, cardSizes: {} }))}
                title="内容较高，推荐切换为每侧两列（点击应用）"
                className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-amber-700 transition-colors hover:bg-amber-100"
              >
                推荐两列
              </button>
            )}
            {fitRec?.oneColumn === true && data.labelColumns === 2 && (
              <button
                type="button"
                onClick={() => setData((prev) => ({ ...prev, labelColumns: 1, customPosition: false, provinceOffsets: {}, teachersOffset: { dx: 0, dy: 0 }, cardSizes: {} }))}
                title="一列也放得下，切回一列更简洁（点击应用）"
                className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-amber-700 transition-colors hover:bg-amber-100"
              >
                一列也放得下
              </button>
            )}
          </span>
          <div className="flex overflow-hidden rounded-md border border-stone-200" role="radiogroup" aria-label="省份卡片位置">
            {(
              [
                { key: '1', label: '一列', active: !data.customPosition && data.labelLayout === 'columns' && data.labelColumns === 1, apply: { labelLayout: 'columns' as const, labelColumns: 1 as const, customPosition: false } },
                { key: '2', label: '两列', active: !data.customPosition && data.labelLayout === 'columns' && data.labelColumns === 2, apply: { labelLayout: 'columns' as const, labelColumns: 2 as const, customPosition: false } },
                { key: 'vertical', label: '竖版', active: !data.customPosition && data.labelLayout === 'vertical', apply: { labelLayout: 'vertical' as const, customPosition: false } },
                { key: 'custom', label: '自定义', active: data.customPosition, apply: { customPosition: true } },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={opt.active}
                onClick={() =>
                  setData((prev) => ({
                    ...prev,
                    ...opt.apply,
                    // 位置语义（v1.16.3）：一切自定义都从「当前所见状态」开始——
                    // · 切到一列/两列：重置全部自定义位置（省份卡片 + 老师块 + 手动尺寸），回到纯净自动布局；
                    // · 切到自定义：清掉历史省份偏移，卡片停在当前自动布局的位置上，画面不跳。
                    // 老师块在「自定义」分支不清——它始终生效，当前位置就是它的「当前状态」
                    ...(opt.key === 'custom'
                      ? { provinceOffsets: {} }
                      : { provinceOffsets: {}, teachersOffset: { dx: 0, dy: 0 }, cardSizes: {} }),
                  }))
                }
                title={
                  opt.key === 'custom'
                    ? '从当前布局开始手动摆放（在地图上按住省份卡片即可拖动）'
                    : opt.key === 'vertical'
                      ? '所有省份卡片集中到地图下方按行排布'
                      : undefined
                }
                className={
                  opt.active
                    ? 'bg-stone-900 px-2.5 py-1 text-[11px] text-white'
                    : 'bg-white px-2.5 py-1 text-[11px] text-stone-500 transition-colors hover:bg-stone-50'
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {/* 自定义位置模式下：一键回到自动排布（清除全部手动偏移与老师块偏移，退出自定义模式） */}
        {data.customPosition && (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={() =>
                setData((prev) => ({
                  ...prev,
                  provinceOffsets: {},
                  teachersOffset: { dx: 0, dy: 0 },
                  cardSizes: {},
                  customPosition: false,
                }))
              }
              title="清除所有手动位置与手动尺寸（省份卡片 + 老师名单块），恢复自动排布"
              className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-amber-700 transition-colors hover:bg-amber-100"
            >
              自动排布
            </button>
          </div>
        )}
        {/* 位置重置：自动布局模式下仍存有手动偏移/手动尺寸时，可一键清除 */}
        {!data.customPosition &&
          (Object.keys(data.provinceOffsets).length > 0 ||
            Object.keys(data.cardSizes).length > 0 ||
            data.teachersOffset.dx !== 0 ||
            data.teachersOffset.dy !== 0) && (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={() =>
                setData((prev) => ({
                  ...prev,
                  provinceOffsets: {},
                  teachersOffset: { dx: 0, dy: 0 },
                  cardSizes: {},
                  customPosition: false,
                }))
              }
              title="清除所有省份卡片与老师名单块的手动位置/手动尺寸，恢复自动布局"
              className="rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] whitespace-nowrap text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700"
            >
              重置位置（已手动调整 {Object.keys(data.provinceOffsets).length + Object.keys(data.cardSizes).length} 个省
              {(data.teachersOffset.dx !== 0 || data.teachersOffset.dy !== 0) && ' + 老师块'}）
            </button>
          </div>
        )}
      </div>

      {/* 统一卡片宽度：开启后所有省份卡片与最宽卡片同宽（左右侧列/竖版均生效；文字对齐方式不变） */}
      <div className="mt-2.5 flex items-center justify-between">
        <Label htmlFor="uniform-width-toggle" className="text-xs text-stone-500">
          统一卡片宽度（与最宽卡片对齐）
        </Label>
        <Switch
          id="uniform-width-toggle"
          checked={data.uniformCardWidth}
          onCheckedChange={(v) => setData((prev) => ({ ...prev, uniformCardWidth: v }))}
          aria-label="统一卡片宽度"
        />
      </div>

      {/* 同校合并：同一大学的多名同学姓名竖排，学校信息只显示一次 */}
      <div className="mt-2.5 flex items-center justify-between">
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

      {/* 分布统计表：画布下方（页脚之上）展示全班各地人数分布，随导出进 PNG */}
      <div className="mt-2.5 flex items-center justify-between">
        <Label htmlFor="stats-toggle" className="text-xs text-stone-500">
          画布下方分布统计表（各地人数，随图导出）
        </Label>
        <Switch
          id="stats-toggle"
          checked={data.showStats}
          onCheckedChange={(v) => setData((prev) => ({ ...prev, showStats: v }))}
          aria-label="画布下方分布统计表"
        />
      </div>

      {/* ============ 校徽 ============ */}
      <div className="mt-3 border-t border-stone-100 pt-2.5 text-[11px] font-medium tracking-wide text-stone-400">
        校徽
      </div>
      {/* 校徽显示开关：关闭后地图与导出图中都不渲染校徽，大学文字照常 */}
      <div className="mt-2 flex items-center justify-between">
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

      {/* 校徽大小：0.5–2 倍（默认 1），自动匹配与用户上传的校徽都按此缩放 */}
      {data.showBadges && (
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 text-[11px] text-stone-500">校徽大小</span>
          <Slider
            value={data.badgeScale}
            min={0.5}
            max={2}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            aria-label="校徽大小"
            onChange={(v) => setData((prev) => ({ ...prev, badgeScale: v }))}
          />
        </div>
      )}

      {/* ============ 卡片样式 ============ */}
      <div className="mt-3 border-t border-stone-100 pt-2.5 text-[11px] font-medium tracking-wide text-stone-400">
        卡片样式
      </div>
      {/* 省份卡片背景：每个省份名单衬一个圆角卡片，引线被卡片遮住不再穿过名单 */}
      <div className="mt-2 flex items-center justify-between">
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
      {/* 人数统计：每张省份卡片内部角落显示该卡人数的精巧小块（默认关闭，位置可选左上/右上） */}
      <div className="mt-2 flex items-center justify-between">
        <Label htmlFor="card-count-toggle" className="text-xs text-stone-500">
          卡片内人数统计小块
        </Label>
        <Switch
          id="card-count-toggle"
          checked={data.showCardCount}
          onCheckedChange={(v) => setData((prev) => ({ ...prev, showCardCount: v }))}
          aria-label="卡片内人数统计小块"
        />
      </div>
      {data.showCardCount && (
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-stone-500">小块位置</span>
          <div
            role="radiogroup"
            aria-label="人数小块位置"
            className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5"
          >
            {(
              [
                { value: 'right', label: '右上' },
                { value: 'left', label: '左上' },
              ] as const
            ).map(({ value, label }) => {
              const active = data.cardCountPos === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setData((prev) => ({ ...prev, cardCountPos: value }))}
                  className={
                    active
                      ? 'rounded-md bg-white px-2.5 py-0.5 text-xs text-stone-800 shadow-sm'
                      : 'rounded-md px-2.5 py-0.5 text-xs text-stone-500 hover:text-stone-700'
                  }
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {data.labelCardBg && (
        <>
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
          {/* 卡片颜色：预设色板（含「跟随主题」）+ 自定义取色 */}
          <div className="mt-2 flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-stone-500 md:w-24">卡片颜色</span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {CARD_COLOR_PRESETS.map((c) => {
                const active = data.cardColor === c.value
                return (
                  <button
                    key={c.label}
                    type="button"
                    title={c.label}
                    aria-label={`卡片颜色：${c.label}`}
                    aria-pressed={active}
                    onClick={() => setData((prev) => ({ ...prev, cardColor: c.value }))}
                    className={
                      active
                        ? 'h-5 w-5 rounded-full border-2 border-stone-700 ring-2 ring-stone-300'
                        : 'h-5 w-5 rounded-full border border-stone-300 transition-transform hover:scale-110'
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
              {/* 自定义颜色（原生取色器，刻意小巧） */}
              <label
                className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-dashed border-stone-400 transition-transform hover:scale-110"
                title="自定义颜色"
                style={
                  data.cardColor !== '' && !CARD_COLOR_PRESETS.some((c) => c.value === data.cardColor)
                    ? { backgroundColor: data.cardColor, borderStyle: 'solid', borderColor: '#44403c' }
                    : undefined
                }
              >
                <input
                  type="color"
                  value={data.cardColor !== '' ? data.cardColor : '#fafaf9'}
                  onChange={(e) => setData((prev) => ({ ...prev, cardColor: e.target.value }))}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="自定义卡片颜色"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-stone-500">
                  +
                </span>
              </label>
            </div>
          </div>
          {/* 不透明度与边缘羽化：下拉档位，非原生滑块 */}
          <div className="mt-2 flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-stone-500 md:w-24">不透明度</span>
            <span className="min-w-0 flex-1 text-[11px] text-stone-400">越低越透出地图</span>
            <SizeSelect
              value={Math.round(data.cardOpacity * 100)}
              options={CARD_OPACITY_OPTIONS}
              unit="%"
              onChange={(v) => setData((prev) => ({ ...prev, cardOpacity: v / 100 }))}
              ariaLabel="卡片不透明度"
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-stone-500 md:w-24">边缘羽化</span>
            <span className="min-w-0 flex-1 text-[11px] text-stone-400">0 为清晰边缘</span>
            <SizeSelect
              value={data.cardBlur}
              options={CARD_BLUR_OPTIONS}
              unit=""
              onChange={(v) => setData((prev) => ({ ...prev, cardBlur: v }))}
              ariaLabel="卡片边缘羽化"
            />
          </div>
        </>
      )}

    </Section>
  )
}

export { presetFontById }
