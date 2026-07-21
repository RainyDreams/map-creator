/**
 * 临时视觉验证脚本（验证后删除）：
 * 1. 启动 vite dev(5211) 与无头 Chrome(CDP 9333)
 * 2. localStorage 注入 50 人 / 22 省测试数据（不改 MapDataContext 源码）
 * 3. 检查字体加载、footer 条、标注重叠、SVG 加高
 * 4. 实测 ultra 导出分辨率并保存 PNG（分块取回 dataURL）
 * 5. 全页截图存 visual-check.png，结束后杀掉全部子进程
 */
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const APP_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const DEV_PORT = 5211
const CDP_PORT = 9333

const students = []
const plan = [
  ['广东', ['广州', '深圳', '广州', '深圳', '佛山', '广州'], ['中山大学', '华南理工大学', '暨南大学', '深圳大学', '南方科技大学', '华南师范大学']],
  ['北京', ['北京', '北京', '北京', '北京', '北京'], ['北京大学', '清华大学', '中国人民大学', '北京师范大学', '北京航空航天大学']],
  ['四川', ['成都', '成都', '绵阳', '成都'], ['四川大学', '电子科技大学', '西南交通大学', '西南财经大学']],
  ['湖北', ['武汉', '武汉', '武汉', '宜昌'], ['武汉大学', '华中科技大学', '武汉理工大学', '华中师范大学']],
  ['江苏', ['南京', '苏州', '南京', '南京'], ['南京大学', '东南大学', '苏州大学', '南京师范大学']],
  ['浙江', ['杭州', '杭州', '宁波'], ['浙江大学', '浙江工业大学', '宁波大学']],
  ['湖南', ['长沙', '长沙', '长沙'], ['湖南大学', '中南大学', '湖南师范大学']],
  ['陕西', ['西安', '西安', '西安'], ['西安交通大学', '西北工业大学', '陕西师范大学']],
  ['山东', ['济南', '青岛'], ['山东大学', '中国海洋大学']],
  ['上海', ['上海', '上海'], ['复旦大学', '上海交通大学']],
  ['重庆', ['重庆', '重庆'], ['重庆大学', '西南大学']],
  ['福建', ['福州', '厦门'], ['福州大学', '厦门大学']],
  ['河南', ['郑州', '郑州'], ['郑州大学', '河南大学']],
  ['云南', ['昆明'], ['云南大学']],
  ['贵州', ['贵阳'], ['贵州大学']],
  ['甘肃', ['兰州'], ['兰州大学']],
  ['辽宁', ['沈阳'], ['东北大学']],
  ['吉林', ['长春'], ['吉林大学']],
  ['黑龙江', ['哈尔滨'], ['哈尔滨工业大学']],
  ['广西', ['南宁'], ['广西大学']],
  ['山西', ['太原'], ['山西大学']],
]
const surnames = '陈林黄张李王吴刘蔡杨许郑谢郭洪邱曾廖赖徐周叶苏庄江吕何罗高萧潘朱简钟彭游詹胡施沈余卢梁'
const given = '伟芳娜敏静丽强磊军洋勇艳杰娟涛明超秀兰霞平刚桂英华玉萍红梅兰竹晨曦宇轩浩然子墨雨桐欣怡'
let nameIdx = 0
function nextName() {
  const a = surnames[nameIdx % surnames.length]
  const b = given[(nameIdx * 7 + 3) % given.length]
  const c = given[(nameIdx * 13 + 5) % given.length]
  nameIdx += 1
  return a + b + c
}
let sid = 0
for (const [prov, cities, unis] of plan) {
  for (let i = 0; i < cities.length; i++) {
    students.push({ id: `stu-${sid++}`, name: nextName(), university: unis[i], city: cities[i] })
  }
}
const testData = {
  title: '高三（2）班',
  year: '2026',
  students,
  teachers: [
    { id: 't1', name: '王建国', subject: '语文' },
    { id: 't2', name: '李慧敏', subject: '数学' },
    { id: 't3', name: '张立群', subject: '英语' },
    { id: 't4', name: '刘志远', subject: '物理' },
  ],
}
console.log(`测试数据：${students.length} 人 / ${plan.length} 省`)

function httpJson(url) {
  return new Promise((resolve, reject) => {
    fetch(url).then((r) => r.json()).then(resolve).catch(reject)
  })
}
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now()
  for (;;) {
    try {
      const v = await fn()
      if (v) return v
    } catch { /* retry */ }
    if (Date.now() - t0 > timeoutMs) throw new Error(`等待超时: ${label}`)
    await new Promise((r) => setTimeout(r, 300))
  }
}

let devProc = null
let chromeProc = null
const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-chrome-'))

function killTree(pid) {
  if (!pid) return
  try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }) } catch { /* already dead */ }
}

async function main() {
  // 1) 启动 vite dev
  devProc = spawn('cmd.exe', ['/c', 'npm.cmd', 'run', 'dev', '--', '--port', String(DEV_PORT), '--strictPort'], {
    cwd: APP_DIR, stdio: ['ignore', 'pipe', 'pipe'],
  })
  devProc.stdout.on('data', () => {})
  devProc.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`))
  await waitFor(async () => {
    const r = await fetch(`http://localhost:${DEV_PORT}/`).catch(() => null)
    return r && r.ok
  }, 60000, 'vite dev 启动')
  console.log('vite dev 已就绪')

  // 2) 启动无头 Chrome
  chromeProc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${chromeProfile}`, '--no-first-run', '--disable-gpu',
    '--window-size=1600,1100', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] })
  const version = await waitFor(() => httpJson(`http://127.0.0.1:${CDP_PORT}/json/version`), 30000, 'Chrome CDP 启动')
  console.log('Chrome 已就绪:', version.Browser)

  // 3) CDP 连接
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let msgId = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    else if (m.method) events.push(m)
  }
  function send(method, params = {}, sessionId) {
    const id = ++msgId
    return new Promise((resolve, reject) => {
      pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)))
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }
  async function waitEvent(method, sessionId, timeoutMs = 20000) {
    const t0 = Date.now()
    for (;;) {
      const i = events.findIndex((e) => e.method === method && (!sessionId || e.sessionId === sessionId))
      if (i >= 0) return events.splice(i, 1)[0]
      if (Date.now() - t0 > timeoutMs) throw new Error(`等待事件超时: ${method}`)
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)

  async function evaluate(expression, awaitPromise = false) {
    const r = await send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue: true, timeout: 120000,
    }, sessionId)
    if (r.exceptionDetails) throw new Error(`页面内执行出错: ${JSON.stringify(r.exceptionDetails).slice(0, 500)}`)
    return r.result.value
  }

  // 4) 注入 50 人数据 → 打开页面
  await send('Page.navigate', { url: `http://localhost:${DEV_PORT}/` }, sessionId)
  await waitEvent('Page.loadEventFired', sessionId)
  await evaluate(`localStorage.setItem('cenfan-map-data-v1', ${JSON.stringify(JSON.stringify(testData))})`)
  await send('Page.reload', { ignoreCache: true }, sessionId)
  await waitEvent('Page.loadEventFired', sessionId)
  await waitFor(async () => {
    const n = await evaluate(`document.querySelectorAll('[data-testid="map-canvas"] svg text').length`)
    return n > 60 // 22 省头 + 50 学生行
  }, 30000, '50 人标注渲染')
  await evaluate(`(async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 800)) })()`, true)
  console.log('页面渲染完成')

  // 5) 字体检查
  const fontCheck = await evaluate(`(() => {
    const big = [...document.querySelectorAll('[data-testid="map-canvas"] *')]
      .find((e) => e.textContent === '蹭饭图' && e.children.length === 0)
    const header = [...document.querySelectorAll('[data-testid="map-canvas"] svg text')]
      .find((t) => t.textContent === '广东省')
    return {
      fontLoaded: document.fonts.check('58px "MaShanZheng"'),
      bigFont: big ? getComputedStyle(big).fontFamily : null,
      headerFont: header ? getComputedStyle(header).fontFamily : null,
    }
  })()`)
  console.log('字体检查:', JSON.stringify(fontCheck, null, 2))

  // 6) footer 检查
  const footerCheck = await evaluate(`(() => {
    const el = [...document.querySelectorAll('[data-testid="map-canvas"] *')]
      .find((e) => e.textContent.includes('本图片由 map.linkbrain.top 生成') && e.children.length === 0)
    if (!el) return { found: false }
    const r = el.getBoundingClientRect()
    const canvas = document.querySelector('[data-testid="map-canvas"]').getBoundingClientRect()
    return { found: true, fontSize: getComputedStyle(el).fontSize, nearBottom: canvas.bottom - r.bottom < 30 }
  })()`)
  console.log('footer 检查:', JSON.stringify(footerCheck))

  // 7) 标注重叠检测（同列内 text 两两 bbox 相交）
  const overlapCheck = await evaluate(`(() => {
    const svg = document.querySelector('[data-testid="map-canvas"] svg')
    const vb = svg.viewBox.baseVal
    const texts = [...svg.querySelectorAll('text')].map((t) => {
      const r = t.getBoundingClientRect()
      return { txt: t.textContent, anchor: t.getAttribute('text-anchor'), l: r.left, r: r.right, t: r.top, b: r.bottom }
    })
    const overlaps = []
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j]
      if (a.anchor !== b.anchor) continue // 只查同列
      if (a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t) overlaps.push(a.txt + ' ∩ ' + b.txt)
    }
    return { svgW: vb.width, svgH: vb.height, textCount: texts.length, overlapCount: overlaps.length, overlaps: overlaps.slice(0, 10) }
  })()`)
  console.log('重叠检查:', JSON.stringify(overlapCheck, null, 2))

  // 8) 展开滚动区 → 全画布截图
  await evaluate(`(() => {
    const canvas = document.querySelector('[data-testid="map-canvas"]')
    let n = canvas
    while (n && n !== document.body) {
      n.style.height = 'auto'; n.style.maxHeight = 'none'
      n.style.overflow = 'visible'; n.style.minHeight = '0'
      n = n.parentElement
    }
    document.documentElement.style.height = 'auto'
    document.body.style.height = 'auto'
    window.scrollTo(0, 0)
  })()`)
  await new Promise((r) => setTimeout(r, 600))
  const clip = await evaluate(`(() => {
    const r = document.querySelector('[data-testid="map-canvas"]').getBoundingClientRect()
    return { x: Math.max(0, r.left), y: Math.max(0, r.top + window.scrollY), width: r.width, height: r.height }
  })()`)
  console.log('画布尺寸:', JSON.stringify(clip))
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 },
  }, sessionId)
  fs.writeFileSync(path.join(APP_DIR, 'visual-check.png'), Buffer.from(shot.data, 'base64'))
  console.log('截图已保存 visual-check.png')

  // 9) 实测 ultra 导出（分块取回 dataURL）
  const meta = await evaluate(`(async () => {
    const m = await import('/src/utils/exportImage.ts')
    const node = document.querySelector('[data-testid="map-canvas"]')
    const r = await m.renderNodeToPngDataUrl(node, 'ultra')
    window.__exportData = r.dataUrl
    return { width: r.width, height: r.height, fellBack: r.fellBack, quality: r.quality, dataLen: r.dataUrl.length }
  })()`, true)
  console.log('ultra 导出实测:', JSON.stringify(meta))
  const CHUNK = 3_000_000
  const parts = []
  for (let off = 0; off < meta.dataLen; off += CHUNK) {
    parts.push(await evaluate(`window.__exportData.slice(${off}, ${off + CHUNK})`))
  }
  const dataUrl = parts.join('')
  fs.writeFileSync(
    path.join(APP_DIR, 'visual-export.png'),
    Buffer.from(dataUrl.split(',')[1], 'base64'),
  )
  console.log('导出 PNG 已保存 visual-export.png')

  await evaluate(`delete window.__exportData`)
  ws.close()
}

main()
  .then(() => { console.log('VERIFY_DONE') })
  .catch((e) => { console.error('VERIFY_FAIL:', e.message); process.exitCode = 1 })
  .finally(() => {
    killTree(chromeProc?.pid)
    killTree(devProc?.pid)
    try { fs.rmSync(chromeProfile, { recursive: true, force: true }) } catch { /* ignore */ }
    setTimeout(() => process.exit(process.exitCode ?? 0), 1000)
  })
