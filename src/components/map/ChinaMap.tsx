import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CalligraphyAsset, StudentBadge, StudentEntry } from '@/types'
import { useMapData } from '@/store/MapDataContext'
import { prefetchCityCenters } from '@/utils/cities'
import { slotFontFamily } from '@/utils/fonts'
import {
  DESIGN_W,
  getGeoFeatures,
  isGeoReady,
  loadGeoFeatures,
  MAP_H,
  MAP_X0,
  MAP_X1,
  TOP,
  BOTTOM,
} from './geo'
import { computeLabelLayout, textEms, type CityCenterMap, type UniEnrichment } from './labels'
import { LabelColumns } from './LabelColumns'

export interface ChinaMapProps {
  /** 省份全称 → 该省学生列表（已在外层分组好） */
  groups: Map<string, StudentEntry[]>
  /** 左下角覆盖层（老师名单块）需预留的高度（viewBox 单位） */
  reserveLeftBottom?: number
  /** 右下角覆盖层（未定位提示块）需预留的高度（viewBox 单位） */
  reserveRightBottom?: number
  /** 原始校名 → 院校补充信息（软科排名/校徽），提供后省内按排名排序 */
  uniInfo?: Map<string, UniEnrichment>
  /** 三个标注模块的字号（px，以 1500px 宽画布为基准） */
  labelSizes?: { province: number; person: number; place: number }
  /** 每侧标注列数：1（默认）或 2（人多时更宽松） */
  labelColumns?: 1 | 2
  /** 省内手动排序的省份（保持手动顺序，不按排名重排） */
  manualProvinces?: Set<string>
  /** 大学名 → 用户上传的毛笔字图片（提供后该校文字被图片替代） */
  calligraphy?: Record<string, CalligraphyAsset>
  /** 学生 id → 校徽覆盖（隐藏或自定义图片） */
  badgeOverrides?: Record<string, StudentBadge>
}

/**
 * 中国地图 SVG：省份色块 + 南海诸岛小插图 + 城市级定位点 + 左右标注列与引线。
 * 宽度自适应容器，高度按 viewBox 等比缩放；内部全部为 SVG 文本，导出 PNG 时清晰。
 * 定位点优先落到学生实际城市（/api/cities 提供坐标）；接口不可用时回退省份质心。
 */
export function ChinaMap({ groups, reserveLeftBottom, reserveRightBottom, uniInfo, labelSizes, labelColumns, manualProvinces, calligraphy, badgeOverrides }: ChinaMapProps) {
  const { theme, fontSlots, customFonts, data } = useMapData()
  const [cityCenters, setCityCenters] = useState<CityCenterMap | null>(null)
  /** 地图轮廓数据（/data/china.json）异步加载：未就绪时渲染同尺寸占位 SVG，避免布局跳动 */
  const [geoReady, setGeoReady] = useState(isGeoReady())
  useEffect(() => {
    if (geoReady) return
    let cancelled = false
    let attempts = 0
    /** 失败后有界重试（fetch 级 3 次超时重试之外的组件级兜底），弱网最终也能自愈 */
    const tryLoad = () => {
      loadGeoFeatures()
        .then(() => {
          if (!cancelled) setGeoReady(true)
        })
        .catch(() => {
          if (cancelled) return
          attempts += 1
          if (attempts < 5) setTimeout(tryLoad, 1500 * attempts)
        })
    }
    tryLoad()
    return () => {
      cancelled = true
    }
  }, [geoReady])
  // 桌面端与移动端布局会同时挂载两个 ChinaMap（CSS 隐藏其一）；
  // clipPath id 必须按实例唯一，否则 url(#id) 解析到另一个实例的裁剪区，小插图溢出画框
  const uid = useId().replace(/:/g, '')
  const mainClipId = `cf-main-clip-${uid}`
  const insetClipId = `cf-inset-clip-${uid}`

  /** 拖动中的省份块实时偏移（LabelColumns 上报）：用于画布 viewBox 实时扩大，
      拖到边缘的卡片不会被裁剪，也不会被上方标题区盖住 */
  const [liveDrag, setLiveDrag] = useState<{ province: string; dx: number; dy: number } | null>(null)

  /** 卡片 z 序：点击/拖动某省份卡片时分配递增序号，渲染时序号大的绘制在上层（SVG 无 z-index，
      以绘制顺序实现「点谁谁上移」）。会话级状态，不落库 */
  const [zRanks, setZRanks] = useState<Record<string, number>>({})
  const zCounterRef = useRef(0)
  const activateCard = (province: string) => {
    // 已是最上层（最近一次激活的就是它）时不重复分配，避免无意义重渲染
    if (zRanks[province] === zCounterRef.current && zCounterRef.current > 0) return
    zCounterRef.current += 1
    const rank = zCounterRef.current
    setZRanks((prev) => ({ ...prev, [province]: rank }))
  }

  /** 省份集合的稳定键，用于触发城市坐标预取 */
  const provincesKey = useMemo(() => [...groups.keys()].join('|'), [groups])

  useEffect(() => {
    const provinces = provincesKey === '' ? [] : provincesKey.split('|')
    if (provinces.length === 0) {
      setCityCenters(null)
      return
    }
    let cancelled = false
    prefetchCityCenters(provinces)
      .then((m) => {
        if (!cancelled) setCityCenters(m.size > 0 ? m : null)
      })
      .catch(() => {
        if (!cancelled) setCityCenters(null)
      })
    return () => {
      cancelled = true
    }
  }, [provincesKey])

  /**
   * 换行判定用的真实文字宽度测量（canvas measureText + 姓名/地点实际字体栈）。
   * 字体未就绪时 measureText 回落到已加载字体，测量偏保守；fontTick 在字体
   * 就绪后触发 layout 重算，消除「（北京）· 北京」这类行的误换行。
   */
  const personFont = slotFontFamily('person', fontSlots, customFonts)
  const placeFont = slotFontFamily('place', fontSlots, customFonts)
  const measureCtx = useMemo(() => document.createElement('canvas').getContext('2d'), [])
  const measure = useMemo(
    () =>
      (text: string, px: number, slot: 'person' | 'place'): number => {
        const family = slot === 'person' ? personFont : placeFont
        if (measureCtx) {
          try {
            measureCtx.font = `${px}px ${family}`
            const w = measureCtx.measureText(text).width
            if (w > 0) return w
          } catch {
            // 回退估算
          }
        }
        return textEms(text) * px
      },
    [measureCtx, personFont, placeFont],
  )

  /** 网络字体/自定义字体加载完成后触发一次重排，让换行判定用到真实字宽 */
  const [fontTick, setFontTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    document.fonts?.ready
      ?.then(() => {
        if (!cancelled) setFontTick((t) => t + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [personFont, placeFont])

  const layout = useMemo(
    () =>
      computeLabelLayout(groups, cityCenters ?? undefined, {
        reserveLeftBottom,
        reserveRightBottom,
        uniInfo,
        sizes: labelSizes,
        columnsPerSide: labelColumns,
        manualProvinces,
        measure,
        calligraphy,
        badgeOverrides,
        mergeSameSchool: data.mergeSameSchool,
        cardBg: data.labelCardBg,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // 注意：geoReady 必须在依赖里——computeLabelLayout 内部调用 getProvinceShape，
    // 地图数据未加载时算出的布局是空的；数据就绪后必须重算，否则标注永久丢失
    [groups, cityCenters, reserveLeftBottom, reserveRightBottom, uniInfo, labelSizes, labelColumns, manualProvinces, measure, fontTick, calligraphy, badgeOverrides, geoReady, data.mergeSameSchool, data.labelCardBg],
  )

  const fillByName = useMemo(() => {
    const m = new Map<string, string>()
    const actives = theme.provinceActive
    let i = 0
    for (const name of groups.keys()) {
      m.set(name, actives[i % actives.length])
      i += 1
    }
    return m
  }, [groups, theme.provinceActive])

  /** 城市级定位圆点：每省一个主点（引线起点/点簇中心），多城市时逐城一个小副点 */
  const dots = useMemo(() => {
    const list: Array<{ key: string; x: number; y: number; primary: boolean }> = []
    for (const b of [...layout.left, ...layout.right]) {
      list.push({ key: `${b.province}-main`, x: b.centroidX, y: b.centroidY, primary: true })
      b.cityPoints.forEach((p, idx) => {
        if (Math.abs(p.x - b.centroidX) < 0.01 && Math.abs(p.y - b.centroidY) < 0.01) return
        list.push({ key: `${b.province}-${idx}`, x: p.x, y: p.y, primary: false })
      })
    }
    return list
  }, [layout])

  /** 动态几何：画布宽/地图位置随标注内容界定（见 labels.ts）。
      必须在 !geoReady 早退之前计算——useMemo 是 Hook，不能放在条件 return 之后 */
  const geom = layout.geom

  /* 画布自动扩大：把「持久化偏移 + 拖动中实时偏移」后的卡片包围盒纳入 viewBox。
     向上拖出界的卡片不再被 SVG 视口裁剪（此前表现为被标题区盖住）。
     横向不扩画布：地图左右两侧的间隙允许不一致（由内容动态界定），但卡片左右拖动
     不再撑宽 viewBox——否则会在画布左/右出现大面积空白。卡片横向限幅在 LabelColumns
     内完成（不超出 [0, designW]），避免被视口裁剪。纵向仍可扩画布（向上拖的卡片不被标题盖住）。
     注意：此 Hook 必须位于 !geoReady 条件早退之前，否则 Hook 数量随渲染变化会崩溃 */
  const vb = useMemo(() => {
    const PAD = 10
    let minX = 0
    let minY = 0
    let maxX = geom.designW
    let maxY = layout.svgHeight
    for (const b of [...layout.left, ...layout.right]) {
      // 自动布局（一列/两列）模式下持久化偏移不生效；拖动中的实时偏移始终生效
      const off =
        liveDrag && liveDrag.province === b.province
          ? liveDrag
          : data.customPosition
            ? (data.provinceOffsets[b.province] ?? null)
            : null
      if (!off) continue
      // 仅纵向扩画布；横向锁定 [0, designW]，不产生左右空白
      minY = Math.min(minY, b.cardY + off.dy - PAD)
      maxY = Math.max(maxY, b.cardY + b.cardH + off.dy + PAD)
    }
    return {
      x: Math.floor(minX),
      y: Math.floor(minY),
      w: Math.ceil(maxX - Math.floor(minX)),
      h: Math.ceil(maxY - Math.floor(minY)),
    }
  }, [layout, liveDrag, data.provinceOffsets, data.customPosition, geom.designW])

  // 地图数据未就绪：渲染与正式图同高度的骨架占位（与 labels.ts 的 svgHeight 公式一致），
  // 灰底呼吸块模拟标题/地图/两侧标注列，避免布局跳动与空白闪烁
  if (!geoReady) {
    const h = Math.max(
      TOP + MAP_H + BOTTOM + Math.max(reserveLeftBottom ?? 0, reserveRightBottom ?? 0),
      120,
    )
    const midY = TOP + MAP_H / 2
    return (
      <svg
        viewBox={`0 0 ${DESIGN_W} ${Math.round(h)}`}
        className="block h-auto w-full animate-pulse"
        role="img"
        aria-label="地图加载中"
      >
        {/* 标题条 */}
        <rect x={40} y={TOP + 6} width={340} height={26} rx={6} fill="#e7e5e4" />
        {/* 地图主体 */}
        <rect
          x={MAP_X0 + 60}
          y={TOP + 20}
          width={MAP_X1 - MAP_X0 - 120}
          height={MAP_H - 40}
          rx={18}
          fill="#e7e5e4"
        />
        {/* 左右标注列的模拟行（3 组：省份条 + 学生行） */}
        {[0, 1, 2].map((i) => {
          const y = TOP + 40 + i * 118
          return (
            <g key={`skel-l-${i}`}>
              <rect x={MAP_X0 - 136} y={y} width={120} height={15} rx={4} fill="#e7e5e4" />
              <rect x={MAP_X0 - 216} y={y + 24} width={200} height={11} rx={4} fill="#f5f5f4" />
              <rect x={MAP_X0 - 186} y={y + 42} width={170} height={11} rx={4} fill="#f5f5f4" />
            </g>
          )
        })}
        {[0, 1, 2].map((i) => {
          const y = TOP + 52 + i * 108
          return (
            <g key={`skel-r-${i}`}>
              <rect x={MAP_X1 + 16} y={y} width={120} height={15} rx={4} fill="#e7e5e4" />
              <rect x={MAP_X1 + 16} y={y + 24} width={200} height={11} rx={4} fill="#f5f5f4" />
              <rect x={MAP_X1 + 16} y={y + 42} width={170} height={11} rx={4} fill="#f5f5f4" />
            </g>
          )
        })}
        {/* 模拟引线 */}
        <path
          d={`M${MAP_X0 + 90},${midY - 90} C${MAP_X0 + 40},${midY - 90} ${MAP_X0 - 60},${midY - 110} ${MAP_X0 - 130},${midY - 110}`}
          fill="none"
          stroke="#e7e5e4"
          strokeWidth={2}
          strokeDasharray="6 5"
        />
        <path
          d={`M${MAP_X1 - 90},${midY + 70} C${MAP_X1 - 40},${midY + 70} ${MAP_X1 + 60},${midY + 90} ${MAP_X1 + 130},${midY + 90}`}
          fill="none"
          stroke="#e7e5e4"
          strokeWidth={2}
          strokeDasharray="6 5"
        />
      </svg>
    )
  }
  const features = getGeoFeatures()

  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className="block h-auto w-full"
      role="img"
      aria-label="班级蹭饭地图"
      style={{
        fontFamily: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif',
      }}
    >
      <defs>
        <clipPath id={mainClipId}>
          <rect x={geom.x0 - 6} y={TOP - 6} width={geom.x1 - geom.x0 + 12} height={geom.mapH + 12} />
        </clipPath>
        <clipPath id={insetClipId}>
          <rect x={geom.inset.x} y={geom.inset.y} width={geom.inset.w} height={geom.inset.h} />
        </clipPath>
      </defs>

      {/* 主图省份（裁剪掉 17.5°N 以南，南沙等只进小插图）；无名要素为十段线细多边形，用引线色填充+描边保证亚像素厚度下仍可见 */}
      <g clipPath={`url(#${mainClipId})`}>
        <g transform={geom.transform}>
          {features.map((f, i) =>
            f.name === '' ? (
              <path
                key={`dash-${i}`}
                d={f.d}
                fill={theme.leaderLine}
                stroke={theme.leaderLine}
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <path
                key={f.name}
                d={f.d}
                fill={fillByName.get(f.name) ?? theme.provinceBase}
                stroke="#ffffff"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ),
          )}
        </g>
      </g>

      {/* 南海诸岛小插图：白底增强对比，十段线细多边形用引线色填充+描边 */}
      <rect
        x={geom.inset.x}
        y={geom.inset.y}
        width={geom.inset.w}
        height={geom.inset.h}
        rx={3}
        fill="#ffffff"
        stroke={theme.leaderLine}
        strokeWidth={1}
        opacity={0.75}
      />
      <g clipPath={`url(#${insetClipId})`}>
        <g transform={geom.inset.transform}>
          {features.map((f, i) =>
            f.name === '' ? (
              <path
                key={`inset-dash-${i}`}
                d={f.d}
                fill={theme.leaderLine}
                stroke={theme.leaderLine}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              // 白底小插图上白色描边会隐形，海南/台湾/南海诸岛必须用引线色描边才能看清轮廓
              <path
                key={`inset-${f.name}`}
                d={f.d}
                fill={fillByName.get(f.name) ?? theme.provinceBase}
                stroke={theme.leaderLine}
                strokeWidth={0.8}
                strokeOpacity={0.65}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ),
          )}
        </g>
      </g>

      {/* 标注列 + 引线（onLiveDrag 上报拖动实时偏移，驱动画布 viewBox 自动扩大；
          onCardActivate/zRanks 实现点击卡片层级上移） */}
      <LabelColumns
        left={layout.left}
        right={layout.right}
        designW={geom.designW}
        onLiveDrag={setLiveDrag}
        zRanks={zRanks}
        onCardActivate={activateCard}
      />

      {/* 城市级定位圆点（压在引线起点之上）；主点带光晕，多城市时副点略小 */}
      {dots.map((d) =>
        d.primary ? (
          <g key={`dot-${d.key}`}>
            <circle cx={d.x} cy={d.y} r={5.5} fill={theme.accent} opacity={0.25} />
            <circle cx={d.x} cy={d.y} r={3.5} fill={theme.accent} stroke="#ffffff" strokeWidth={1.4} />
          </g>
        ) : (
          <circle
            key={`dot-${d.key}`}
            cx={d.x}
            cy={d.y}
            r={2.6}
            fill={theme.accent}
            stroke="#ffffff"
            strokeWidth={1.1}
            opacity={0.9}
          />
        ),
      )}
    </svg>
  )
}
