/**
 * 蹭饭图画布主题系统：预设风格 + 用户自定义。
 * 主题只影响画布（地图、标注、标题、来源条），不影响操作界面 chrome。
 */

export interface ThemeConfig {
  /** 预设 id；自定义为 'custom' */
  id: string
  /** 展示名 */
  name: string
  /** 画布背景（CSS background，可为渐变） */
  canvasBg: string
  /** 来源 footer 条背景 */
  footerBg: string
  /** 无学生省份填充色 */
  provinceBase: string
  /** 有学生省份轮换填充色（按序取色） */
  provinceActive: string[]
  /** 强调色：蹭饭图大字、定位圆点 */
  accent: string
  /** 年份大字颜色 */
  yearColor: string
  /** 班级标题颜色 */
  titleColor: string
  /** 标注文字颜色（省份名/学生行/老师名单） */
  textColor: string
  /** 引线颜色 */
  leaderLine: string
}

export const PRESET_THEMES: ThemeConfig[] = [
  {
    id: 'sunny',
    name: '暖阳金',
    canvasBg: 'radial-gradient(ellipse at 32% 18%, #fdf6df 0%, #f9edcb 55%, #f4e2b4 100%)',
    footerBg: '#f6ecd3',
    provinceBase: '#ece4cf',
    provinceActive: ['#e8b96a', '#d98e5f', '#c9a227', '#e5a04b', '#b8bf6a', '#d97f6a', '#cf9b4e', '#e0c080'],
    accent: '#b0312a',
    yearColor: '#d97706',
    titleColor: '#44403c',
    textColor: '#57534e',
    leaderLine: '#a89263',
  },
  {
    id: 'ocean',
    name: '海阔天空',
    canvasBg: 'linear-gradient(160deg, #eaf4fd 0%, #dbeafb 55%, #cfe2f8 100%)',
    footerBg: '#ddebf8',
    provinceBase: '#c3d9f2',
    provinceActive: ['#5b9bd5', '#7f7fd5', '#4a86c8', '#6a67ce', '#5b9bd5', '#8f96dd', '#4a86c8', '#7f7fd5'],
    accent: '#1d4fa1',
    yearColor: '#1d4fa1',
    titleColor: '#1e3a5f',
    textColor: '#2d4a6f',
    leaderLine: '#7fa3cc',
  },
  {
    id: 'forest',
    name: '青山墨绿',
    canvasBg: 'linear-gradient(160deg, #f0f5ec 0%, #e2eddb 55%, #d4e4c9 100%)',
    footerBg: '#e3edda',
    provinceBase: '#d8e2cf',
    provinceActive: ['#7ba05b', '#5b8a72', '#a3b86b', '#6a9a5b', '#8aa86b', '#5b8a72', '#7ba05b', '#9ab56b'],
    accent: '#2f5d3a',
    yearColor: '#3a6b47',
    titleColor: '#2f4636',
    textColor: '#3f5648',
    leaderLine: '#93a87f',
  },
  {
    id: 'vermilion',
    name: '朱砂喜庆',
    canvasBg: 'radial-gradient(ellipse at 30% 15%, #fdf3e7 0%, #fbe8d8 55%, #f7dcc8 100%)',
    footerBg: '#f9e4d2',
    provinceBase: '#f0ddd0',
    provinceActive: ['#d45d4a', '#e08a5b', '#c94f42', '#e5a04b', '#d4705b', '#c94f42', '#e08a5b', '#d45d4a'],
    accent: '#a5281e',
    yearColor: '#c23a2a',
    titleColor: '#5a2d24',
    textColor: '#6b4038',
    leaderLine: '#c98d72',
  },
  {
    id: 'minimal',
    name: '极简灰白',
    canvasBg: '#ffffff',
    footerBg: '#f5f5f4',
    provinceBase: '#e7e5e4',
    provinceActive: ['#78716c', '#a8a29e', '#57534e', '#8a8580', '#78716c', '#a8a29e', '#57534e', '#8a8580'],
    accent: '#292524',
    yearColor: '#44403c',
    titleColor: '#292524',
    textColor: '#44403c',
    leaderLine: '#b5b0ab',
  },
]

export const DEFAULT_THEME = PRESET_THEMES[0]

/** 由 id 找预设；找不到回退默认 */
export function presetById(id: string): ThemeConfig {
  return PRESET_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME
}
