/**
 * GET /api/universities?names=清华大学,北京大学（逗号分隔，≤60 个）
 * → { "results": [{ "q": 原始名, "n": 规范校名|null, "c": 城市|null, "p": 省份全称|null,
 *                   "r": 软科2025主榜排名|null（501 表示 500+）, "b": 校徽 slug|null }] }
 *
 * 数据集 functions/api/_data/universities.json 为离线合并生成：
 * 软科 2025 中国大学排名主榜（排名/省份）+ urongda 校徽映射 + 人工维护的城市映射。
 *
 * 匹配规则（与前端正则一致）：精确 → 去括号校区后缀 → 括号内为城市时用校区城市 → 双向包含模糊。
 * 缓存：CDN 长缓存 + stale-while-revalidate，数据集为静态内容。
 * 校徽字段 b 自 v1.42.1 起为本地自托管校徽文件名（_data/badge-files.json，
 * 2961 所高校，/badges/<文件名> 静态加载，内容哈希命名 + immutable 缓存），
 * 不再代理任何第三方站点。
 */
import universitiesData from './_data/universities.json'
import badgeFilesData from './_data/badge-files.json'
import cityProvinceData from '../../src/assets/city-province.json'

/** name -> [city|null, provinceFull|null, rank|null, badgeSlug|null]（尾部 null 已压缩） */
type RawEntry = [string | null, (string | null)?, (number | null)?, (string | null)?]
const DATA = universitiesData as unknown as Record<string, RawEntry>
const CITY_TO_PROVINCE = cityProvinceData as unknown as Record<string, string>

const NAMES = Object.keys(DATA)

/** 校名 → 本地校徽文件名（自托管 /badges/，2961 所） */
const BADGE_FILES = badgeFilesData as unknown as Record<string, string>
const BADGE_NAMES = Object.keys(BADGE_FILES)

/** 校名 → 本地校徽文件名：精确 → 去括号基名 → 包含匹配（取最长键） */
function badgeFileOf(query: string): string | null {
  const name = query.trim()
  if (!name) return null
  const base = name.replace(/[（(].*$/, '').trim()
  const direct = BADGE_FILES[name] ?? BADGE_FILES[base]
  if (direct) return direct
  let best: string | null = null
  for (const k of BADGE_NAMES) {
    if (base.includes(k) || k.includes(base)) {
      if (best === null || k.length > best.length) best = k
    }
  }
  return best ? BADGE_FILES[best] : null
}

interface UniInfo {
  n: string | null
  c: string | null
  p: string | null
  r: number | null
  b: string | null
}

function entryToInfo(name: string, raw: RawEntry): UniInfo {
  return {
    n: name,
    c: raw[0] ?? null,
    p: raw[1] ?? null,
    r: raw[2] ?? null,
    b: raw[3] ?? null,
  }
}

const NULL_INFO: UniInfo = { n: null, c: null, p: null, r: null, b: null }

/**
 * 校徽兜底：命中条目本身没有校徽时（如"中国石油大学"总校条目），
 * 在数据集中找与其相关的、有校徽的最长键（如"中国石油大学（北京）"）补上 slug。
 */
function fillBadge(info: UniInfo, base: string): UniInfo {
  if (info.b != null || base === '') return info
  let best: string | null = null
  for (const k of NAMES) {
    if ((base.includes(k) || k.includes(base)) && DATA[k][3]) {
      if (best === null || k.length > best.length) best = k
    }
  }
  return best ? { ...info, b: DATA[best][3] ?? info.b } : info
}

function lookup(query: string): UniInfo {
  const name = query.trim()
  if (!name) return NULL_INFO

  // 括号校区：如“哈尔滨工业大学（威海）”——校区是城市名时用校区城市
  const campusMatch = name.match(/[（(]([^（）()]+)[)）]/)
  const base = name.replace(/[（(].*$/, '').trim()

  const exact = DATA[name]
  if (exact) return fillBadge(entryToInfo(name, exact), base)

  const baseHit = DATA[base]
  if (baseHit) {
    const info = fillBadge(entryToInfo(base, baseHit), base)
    if (campusMatch) {
      const campus = campusMatch[1].trim()
      if (CITY_TO_PROVINCE[campus] || CITY_TO_PROVINCE[`${campus}市`]) {
        info.c = campus
        info.p = CITY_TO_PROVINCE[campus] ?? CITY_TO_PROVINCE[`${campus}市`] ?? info.p
        info.n = name
      }
    }
    return info
  }

  // 双向包含模糊匹配（取键最长者，避免“北京大学”被“北京”类短键抢先）
  let best: string | null = null
  for (const k of NAMES) {
    if (base.includes(k) || k.includes(base)) {
      if (best === null || k.length > best.length) best = k
    }
  }
  if (best) {
    const info = fillBadge(entryToInfo(best, DATA[best]), base)
    if (campusMatch) {
      const campus = campusMatch[1].trim()
      if (CITY_TO_PROVINCE[campus] || CITY_TO_PROVINCE[`${campus}市`]) {
        info.c = campus
        info.p = CITY_TO_PROVINCE[campus] ?? CITY_TO_PROVINCE[`${campus}市`] ?? info.p
        info.n = name
      }
    }
    return info
  }
  return NULL_INFO
}

export const onRequestGet = ({ request }: { request: Request }): Response => {
  const url = new URL(request.url)
  const namesParam = url.searchParams.get('names')
  const single = url.searchParams.get('name')

  const queries = (namesParam ?? single ?? '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .slice(0, 60)

  if (queries.length === 0) {
    return Response.json(
      { error: '缺少必填查询参数 names（逗号分隔，≤60 个）' },
      { status: 400 },
    )
  }

  // b 字段以本地自托管校徽文件名为准（lookup 内部的 slug 兜底仅为历史数据结构保留，一律覆盖）
  const results = queries.map((q) => ({ q, ...lookup(q), b: badgeFileOf(q) }))
  return Response.json(
    { results },
    {
      headers: {
        // 静态数据集：浏览器 1 小时、CDN 1 天、回源后 7 天内可用陈旧副本
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  )
}
