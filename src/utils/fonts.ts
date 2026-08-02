/**
 * 画布分模块字体系统：
 * - 6 个字体槽位：标题按字符类型分 数字/英文/中文 三槽位，地图标注分 省份名/姓名/地点大学 三槽位
 * - 预设字体均为免费可商用的子集化 woff2（fonts.css 注册）
 * - 用户可上传自己的字体（dataURL 持久化，经 FontFace API 动态注册）
 */

export type FontSlot = 'digit' | 'latin' | 'han' | 'province' | 'person' | 'place'

export const FONT_SLOT_LABELS: Record<FontSlot, string> = {
  digit: '数字',
  latin: '英文',
  han: '中文',
  province: '省份名',
  person: '姓名',
  place: '城市/大学',
}

export interface FontDef {
  id: string
  name: string
  /** 完整 font-family 栈（含回退） */
  family: string
  note?: string
}

export const PRESET_FONTS: FontDef[] = [
  {
    id: 'default',
    name: '系统默认',
    family: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif',
  },
  {
    id: 'shuheiti',
    name: '阿里妈妈数黑体',
    family: '"AlimamaShuHeiTi","Georgia","Times New Roman",serif',
    note: '仅数字/英文',
  },
  {
    id: 'mashanzheng',
    name: '毛笔体',
    family: '"MaShanZheng","Kaiti SC","STKaiti","KaiTi","楷体",serif',
  },
  {
    id: 'excalifont',
    name: '手绘体',
    family: '"Excalifont","XiaolaiSC","MaShanZheng","Kaiti SC","STKaiti","KaiTi","楷体",serif',
    note: 'Excalifont·小赖',
  },
  {
    id: 'comicshanns',
    name: 'Comic Shanns',
    family: '"ComicShanns","AlimamaShuHeiTi","Consolas",monospace',
    note: '仅数字/英文',
  },
  {
    id: 'notosans',
    name: '思源黑体',
    family: '"NotoSansSC","PingFang SC","Microsoft YaHei",sans-serif',
  },
  {
    id: 'xiaowei',
    name: '站酷小薇体',
    family: '"ZCOOLXiaoWei","NotoSansSC",serif',
  },
  {
    id: 'qingke',
    name: '站酷高端黑',
    family: '"ZCOOLQingKeHuangYou","Microsoft YaHei",sans-serif',
  },
]

/** 默认槽位分配（与现有视觉一致）：数字用数黑体，英文/中文沿用毛笔体 */
export const DEFAULT_FONT_SLOTS: Record<FontSlot, string> = {
  digit: 'shuheiti',
  latin: 'mashanzheng',
  han: 'mashanzheng',
  province: 'mashanzheng',
  person: 'default',
  place: 'default',
}

export interface CustomFont {
  /** 'custom-' 前缀 id */
  id: string
  /** 用户给的显示名（默认文件名） */
  name: string
  /** data:font/...;base64,... */
  dataUrl: string
}

export function presetFontById(id: string): FontDef | undefined {
  return PRESET_FONTS.find((f) => f.id === id)
}

/** 解析槽位最终 font-family 栈 */
export function slotFontFamily(
  slot: FontSlot,
  slots: Record<FontSlot, string>,
  customFonts: CustomFont[],
): string {
  const id = slots[slot] ?? DEFAULT_FONT_SLOTS[slot]
  const custom = customFonts.find((f) => f.id === id)
  if (custom) {
    return `"${customFontFamilyName(custom)}","PingFang SC","Microsoft YaHei",sans-serif`
  }
  return presetFontById(id)?.family ?? PRESET_FONTS[0].family
}

/** 上传字体在 FontFace 中注册的家族名 */
export function customFontFamilyName(font: CustomFont): string {
  return `UserFont-${font.id}`
}

const loadedCustomIds = new Set<string>()

/** 用 FontFace API 注册全部自定义字体（幂等），供 App 启动与变更时调用 */
export async function ensureCustomFontsLoaded(customFonts: CustomFont[]): Promise<void> {
  for (const font of customFonts) {
    if (loadedCustomIds.has(font.id)) continue
    try {
      const face = new FontFace(customFontFamilyName(font), `url(${font.dataUrl})`)
      await face.load()
      document.fonts.add(face)
      loadedCustomIds.add(font.id)
    } catch (err) {
      console.warn(`自定义字体加载失败：${font.name}`, err)
    }
  }
}

/** 上传文件大小上限（localStorage 容量考虑） */
export const CUSTOM_FONT_MAX_BYTES = 3 * 1024 * 1024
