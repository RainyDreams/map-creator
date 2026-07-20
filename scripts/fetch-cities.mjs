/**
 * 城市数据集生成脚本（node 直接运行）：
 *   node scripts/fetch-cities.mjs
 *
 * 流程：
 *   1. 读 src/assets/china.json 拿 34 个省级 feature 的 adcode / name / center
 *   2. 逐省下载 https://geo.datav.aliyun.com/areas_v3/bound/{adcode}_full.json
 *      提取 level === 'city' 的 feature（name + center，center 缺失时用 centroid）
 *   3. 特殊处理：
 *      - 四个直辖市（北京/天津/上海/重庆）：市级即自身
 *      - 香港/澳门：市级即自身
 *      - 台湾省：阿里数据源无市级数据，保留自身
 *   4. 输出 functions/api/_data/cities.json：{ "省份全称": [{name, center}], ... }
 *
 * 可重复运行；打印省份数 / 城市总数统计。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CHINA_JSON = join(ROOT, 'src/assets/china.json')
const OUT_DIR = join(ROOT, 'functions/api/_data')
const OUT_FILE = join(OUT_DIR, 'cities.json')

const BASE = 'https://geo.datav.aliyun.com/areas_v3/bound'

/** 市级即自身的特殊省级区域（直辖市 / 港澳 / 台湾） */
const SELF_ONLY = new Set(['110000', '120000', '310000', '500000', '710000', '810000', '820000'])

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (i === retries - 1) throw e
      await sleep(1000 * (i + 1))
    }
  }
}

/** 提取一个可用的 [lng, lat] 坐标 */
function pickCenter(props) {
  const c = props.center || props.centroid
  if (Array.isArray(c) && c.length >= 2 && c.every((n) => Number.isFinite(n))) {
    return [c[0], c[1]]
  }
  return null
}

async function main() {
  const china = JSON.parse(await readFile(CHINA_JSON, 'utf8'))
  const provinces = china.features
    .filter((f) => f.properties?.name && f.properties?.adcode)
    .map((f) => ({
      adcode: String(f.properties.adcode),
      name: f.properties.name,
      center: pickCenter(f.properties),
    }))

  console.log(`读取 china.json：${provinces.length} 个省级区域`)

  const result = {}
  let cityTotal = 0
  const failures = []

  for (const p of provinces) {
    // 特殊省级区域：市级即自身
    if (SELF_ONLY.has(p.adcode)) {
      result[p.name] = [{ name: p.name, center: p.center }]
      cityTotal += 1
      console.log(`[${p.name}] 特殊处理：市级即自身`)
      continue
    }

    const url = `${BASE}/${p.adcode}_full.json`
    try {
      const data = await fetchJson(url)
      const cityFeatures = (data.features || []).filter(
        (f) => f.properties?.level === 'city' && f.properties?.name,
      )
      const cities = []
      for (const f of cityFeatures) {
        const center = pickCenter(f.properties)
        if (center) cities.push({ name: f.properties.name, center })
      }

      if (cities.length === 0) {
        // 兜底：无市级数据时退回自身
        console.warn(`[${p.name}] 警告：无 level=city 数据，退回自身`)
        result[p.name] = [{ name: p.name, center: p.center }]
        cityTotal += 1
      } else {
        result[p.name] = cities
        cityTotal += cities.length
        console.log(`[${p.name}] ${cities.length} 个市级区域`)
      }
    } catch (e) {
      console.error(`[${p.name}] 下载失败：${e.message}，退回自身`)
      failures.push(p.name)
      result[p.name] = [{ name: p.name, center: p.center }]
      cityTotal += 1
    }

    await sleep(150) // 限速，礼貌抓取
  }

  // 校验：center 为空的不允许出现
  for (const [prov, cities] of Object.entries(result)) {
    for (const c of cities) {
      if (!c.center) throw new Error(`${prov} / ${c.name} 缺少 center 坐标`)
    }
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, JSON.stringify(result), 'utf8')

  console.log('\n===== 统计 =====')
  console.log(`省份数：${Object.keys(result).length}`)
  console.log(`城市总数：${cityTotal}`)
  console.log(`输出文件：${OUT_FILE}`)
  if (failures.length > 0) {
    console.log(`下载失败（已退回自身）：${failures.join('、')}`)
  }
}

main().catch((e) => {
  console.error('脚本执行失败：', e)
  process.exit(1)
})
