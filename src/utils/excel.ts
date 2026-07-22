/**
 * Excel 模板下载与上传解析（纯函数模块，不依赖 React）。
 *
 * 跳过约定（模板与解析共用）：
 * - 「姓名」为空的行（整行全空除外，直接忽略）→ 跳过，计入 skipped
 * - 「姓名」中包含“示例”字样的行（模板说明行 / 示例数据行）→ 跳过，计入 skipped
 * 因此用户即使不删除模板里的示例行，上传时也不会混入正式名单。
 */
import * as XLSX from 'xlsx'
import { inferCityFromUniversity } from '@/utils/geo'

/** 调试日志统一前缀：上传 Excel 时在控制台详细输出解析全过程（默认开启，便于用户反馈问题） */
const DBG = '[Excel调试]'
function dbg(...args: unknown[]): void {
  console.log(DBG, ...args)
}
function dbgWarn(...args: unknown[]): void {
  console.warn(DBG, ...args)
}

export interface ParsedStudent {
  name: string
  university: string
  city: string
}

export interface ParsedTeacher {
  name: string
  subject: string
}

export interface ParseResult {
  students: ParsedStudent[]
  teachers: ParsedTeacher[]
  /** 行级问题（带行号），不阻断导入 */
  errors: string[]
  /** 被跳过的行数（空姓名行 / 示例行） */
  skipped: number
}

/** 模板文件名 */
export const TEMPLATE_FILENAME = '蹭饭图名单模板.xlsx'

// ---------------------------------------------------------------------------
// 模板下载
// ---------------------------------------------------------------------------

/** 生成并触发下载《蹭饭图名单模板.xlsx》，含「学生名单」「老师名单」两个 Sheet */
export function downloadTemplate(): void {
  const wb = XLSX.utils.book_new()

  // 学生名单：第 1 行表头，第 2 行说明文字，第 3~5 行示例数据。
  // 说明行与示例行的「姓名」列均含“示例”二字，上传解析时会被自动跳过。
  const studentRows: string[][] = [
    ['姓名', '大学', '城市（选填）'],
    [
      '示例说明：城市留空可根据大学自动推断；境外同学在「城市」列填国家/地区（如：美国），将单独列入海外区块；本行与下方示例行上传时会自动跳过，正式填写前请删除',
      '',
      '',
    ],
    ['张示例', '清华大学', '北京'],
    ['李示例', '北京大学', ''],
    ['王示例', '复旦大学', '上海'],
  ]
  const studentSheet = XLSX.utils.aoa_to_sheet(studentRows)
  studentSheet['!cols'] = [{ wch: 18 }, { wch: 26 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, studentSheet, '学生名单')

  // 老师名单：第 1 行表头，第 2 行示例（姓名含“示例”，上传时跳过）
  const teacherRows: string[][] = [
    ['姓名', '学科（选填）'],
    ['王示例', '物理'],
  ]
  const teacherSheet = XLSX.utils.aoa_to_sheet(teacherRows)
  teacherSheet['!cols'] = [{ wch: 18 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, teacherSheet, '老师名单')

  XLSX.writeFile(wb, TEMPLATE_FILENAME)
}

// ---------------------------------------------------------------------------
// 名单导出（Excel）
// ---------------------------------------------------------------------------

/**
 * 把当前名单导出为与模板同构的 .xlsx（学生名单 / 老师名单 两个 Sheet），
 * 可直接再次上传导入，实现“导出备份 → 稍后/换机导入”的闭环。
 */
export function exportWorkbook(data: {
  title: string
  students: Array<{ name: string; university: string; city: string }>
  teachers: Array<{ name: string; subject: string }>
}): void {
  const wb = XLSX.utils.book_new()

  const studentRows: string[][] = [
    ['姓名', '大学', '城市（选填）'],
    ...data.students
      .filter((s) => s.name.trim() || s.university.trim() || s.city.trim())
      .map((s) => [s.name, s.university, s.city]),
  ]
  const studentSheet = XLSX.utils.aoa_to_sheet(studentRows)
  studentSheet['!cols'] = [{ wch: 18 }, { wch: 26 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, studentSheet, '学生名单')

  const teacherRows: string[][] = [
    ['姓名', '学科（选填）'],
    ...data.teachers
      .filter((t) => t.name.trim() || t.subject.trim())
      .map((t) => [t.name, t.subject]),
  ]
  const teacherSheet = XLSX.utils.aoa_to_sheet(teacherRows)
  teacherSheet['!cols'] = [{ wch: 18 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, teacherSheet, '老师名单')

  const base = data.title.trim().replace(/[\\/:*?"<>|\s]+/g, '-') || '蹭饭图名单'
  XLSX.writeFile(wb, `${base}.xlsx`)
  dbg(`已导出 Excel：${base}.xlsx（学生 ${studentRows.length - 1} 行、老师 ${teacherRows.length - 1} 行）`)
}

// ---------------------------------------------------------------------------
// 上传解析
// ---------------------------------------------------------------------------

/** 表头归一化：去空格/全角空格、小写、去掉括号备注（如“城市（选填）”→“城市”） */
function normHeader(cell: unknown): string {
  return String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[（(].*?[)）]/g, '')
}

const NAME_KEYS = ['姓名', '名字', 'name']
const UNIVERSITY_KEYS = ['大学', '学校', '院校', '高校', 'university', 'school', 'college']
const CITY_KEYS = ['城市', '所在城市', 'city']
const SUBJECT_KEYS = ['学科', '科目', '任教', 'subject']

type ColKind = 'name' | 'university' | 'city' | 'subject'

function matchCol(header: string): ColKind | null {
  if (NAME_KEYS.includes(header)) return 'name'
  if (UNIVERSITY_KEYS.includes(header)) return 'university'
  if (CITY_KEYS.includes(header)) return 'city'
  if (SUBJECT_KEYS.includes(header)) return 'subject'
  return null
}

interface SheetTable {
  /** 找到表头的行下标（在 rows 数组中） */
  headerRow: number
  /** 列下标 → 列含义 */
  cols: Map<number, ColKind>
}

/** 在前若干行内寻找含「姓名」列的表头行 */
function locateHeader(rows: unknown[][], needUniversity: boolean): SheetTable | null {
  const scanLimit = Math.min(rows.length, 10)
  for (let r = 0; r < scanLimit; r++) {
    const cols = new Map<number, ColKind>()
    const row = rows[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const kind = matchCol(normHeader(row[c]))
      if (kind && !cols.has(c)) cols.set(c, kind)
    }
    const kinds = new Set(cols.values())
    if (!kinds.has('name')) continue
    if (needUniversity && !kinds.has('university')) continue
    return { headerRow: r, cols }
  }
  return null
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

/** 是否整行皆空（尾部空行直接忽略，不计入 skipped） */
function isBlankRow(row: unknown[]): boolean {
  return row.every((v) => cellStr(v) === '')
}

function rowValues(row: unknown[], cols: Map<number, ColKind>): Record<ColKind, string> {
  const out: Record<ColKind, string> = { name: '', university: '', city: '', subject: '' }
  for (const [c, kind] of cols) {
    out[kind] = cellStr(row[c])
  }
  return out
}

/** 读取工作表为二维数组（保留空行，使数组下标 + 1 即 Excel 行号） */
function sheetToRows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    blankrows: true,
  })
}

function parseStudentSheet(
  ws: XLSX.WorkSheet,
  label: string,
  result: ParseResult,
): void {
  const rows = sheetToRows(ws)
  dbg(`「${label}」共 ${rows.length} 行（含表头与空行），正在定位表头…`)
  const table = locateHeader(rows, true)
  if (!table) {
    // 区分「完全没有姓名列」与「有姓名列但缺大学列」，给出更准确的指引
    if (locateHeader(rows, false)) {
      dbgWarn(`「${label}」找到「姓名」列但缺少「大学」列，解析中止。首行内容：`, rows[0])
      throw new Error(
        `「${label}」中缺少「大学」表头列，请下载模板后按格式填写`,
      )
    }
    dbgWarn(`「${label}」在前 10 行内找不到「姓名 / 大学」表头，解析中止。首行内容：`, rows[0])
    throw new Error(
      `「${label}」中找不到「姓名 / 大学」表头列，请下载模板后按格式填写`,
    )
  }
  dbg(
    `「${label}」表头在第 ${table.headerRow + 1} 行，列映射：`,
    Object.fromEntries([...table.cols].map(([c, k]) => [`第${c + 1}列`, k])),
  )
  for (let r = table.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (isBlankRow(row)) continue
    const { name, university, city } = rowValues(row, table.cols)
    const rowNo = r + 1
    // 跳过约定：姓名为空，或姓名含“示例”（模板说明行 / 示例数据行）
    if (!name) {
      result.skipped++
      dbg(`第${rowNo}行：姓名为空，跳过（原始内容：`, row, '）')
      continue
    }
    if (name.includes('示例')) {
      result.skipped++
      dbg(`第${rowNo}行：姓名「${name}」含“示例”二字，按模板约定跳过（若这是真实姓名，请换个写法或联系我们）`)
      continue
    }
    if (!university) {
      result.errors.push(`${label} 第${rowNo}行：缺少大学`)
      dbgWarn(`第${rowNo}行：姓名「${name}」缺少大学，未导入`)
      continue
    }
    // 城市为空时按大学名自动推断；推断不到则留空，由后续环节兜底
    const inferred = city ? null : inferCityFromUniversity(university)
    const finalCity = city || inferred || ''
    dbg(
      `第${rowNo}行：导入 ${name} / ${university}` +
        (city ? ` / 城市「${city}」（原样采用）` : inferred ? ` / 城市留空→按大学推断为「${inferred}」` : ' / 城市留空且无法按大学推断，待地图环节兜底'),
    )
    result.students.push({ name, university, city: finalCity })
  }
}

function parseTeacherSheet(
  ws: XLSX.WorkSheet,
  label: string,
  result: ParseResult,
): void {
  const rows = sheetToRows(ws)
  const table = locateHeader(rows, false)
  if (!table) {
    // 老师名单为可选项：整表为空（用户删光了老师 sheet）→ 静默跳过；
    // 有数据却找不到表头才提示，不中断学生导入
    if (rows.some((row) => !isBlankRow(row ?? []))) {
      result.errors.push(`${label}：有内容但找不到「姓名」表头列，老师名单未导入`)
      dbgWarn(`「${label}」有内容但找不到「姓名」表头列，老师名单未导入。首行内容：`, rows[0])
    } else {
      dbg(`「${label}」为空表，跳过`)
    }
    return
  }
  dbg(`「${label}」表头在第 ${table.headerRow + 1} 行`)
  for (let r = table.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    if (isBlankRow(row)) continue
    const { name, subject } = rowValues(row, table.cols)
    if (!name || name.includes('示例')) {
      result.skipped++
      dbg(`「${label}」第${r + 1}行：姓名为空或含“示例”，跳过`)
      continue
    }
    dbg(`「${label}」第${r + 1}行：导入 ${name}${subject ? ` / ${subject}` : ''}`)
    result.teachers.push({ name, subject })
  }
}

/** CSV 文本解码：先按 UTF-8（严格模式）解码，失败则回退 GBK，兼容 Windows 中文 Excel 导出的 CSV */
function decodeCsvText(buf: ArrayBuffer): { text: string; encoding: string } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'UTF-8' }
  } catch {
    return { text: new TextDecoder('gbk').decode(buf), encoding: 'GBK（UTF-8 解码失败后的回退）' }
  }
}

/**
 * 解析上传的 .xlsx / .xls / .csv 文件。
 * 文件损坏或表头不符时抛出带用户可读信息的 Error；
 * 行级问题（如缺大学）收集到 result.errors，不抛出。
 * 全程在控制台输出 [Excel调试] 日志（默认开启），便于用户排查与反馈。
 */
export async function parseWorkbook(file: File): Promise<ParseResult> {
  const result: ParseResult = { students: [], teachers: [], errors: [], skipped: 0 }
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  dbg(`开始解析：「${file.name}」，大小 ${(file.size / 1024).toFixed(1)} KB，格式 .${ext}`)

  let wb: XLSX.WorkBook
  try {
    if (ext === 'csv') {
      const buf = await file.arrayBuffer()
      const { text, encoding } = decodeCsvText(buf)
      dbg(`CSV 编码探测结果：${encoding}`)
      wb = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string' }) // 去除 BOM
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer()
      wb = XLSX.read(buf, { type: 'array' })
    } else {
      throw new Error('不支持的文件格式，请上传 .xlsx / .xls / .csv 文件')
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('不支持的文件格式')) {
      dbgWarn(e.message)
      throw e
    }
    dbgWarn('文件读取失败（可能已损坏或格式不正确）：', e)
    throw new Error('文件无法读取，可能已损坏或格式不正确')
  }

  if (wb.SheetNames.length === 0) {
    dbgWarn('文件中没有可用的工作表')
    throw new Error('文件中没有可用的工作表，请下载模板后按格式填写')
  }
  dbg(`工作表列表：${wb.SheetNames.join('、')}`)

  const studentSheetName =
    wb.SheetNames.find((n) => n.includes('学生')) ??
    // 未命名「学生」时，回退为第一个能找到「姓名 + 大学」表头的工作表，
    // 避免把「Sheet1 / Sheet2」这类默认命名误判为表头缺失
    wb.SheetNames.find((n) => locateHeader(sheetToRows(wb.Sheets[n]), true)) ??
    wb.SheetNames[0]
  dbg(`选定学生名单工作表：「${studentSheetName}」`)
  parseStudentSheet(wb.Sheets[studentSheetName], studentSheetName, result)

  // 老师名单为可选 Sheet（CSV 单表场景通常没有）
  const teacherSheetName = wb.SheetNames.find(
    (n) => n.includes('老师') || n.includes('教师'),
  )
  if (teacherSheetName) {
    dbg(`选定老师名单工作表：「${teacherSheetName}」`)
    parseTeacherSheet(wb.Sheets[teacherSheetName], teacherSheetName, result)
  } else {
    dbg('未找到老师名单工作表（可选项，跳过）')
  }

  dbg(
    `解析完成：学生 ${result.students.length} 人、老师 ${result.teachers.length} 人、跳过 ${result.skipped} 行、问题 ${result.errors.length} 处` +
      (result.students.length === 0 && result.skipped > 0
        ? '。注意：所有数据行都被跳过了——本模板约定姓名含“示例”的行视为示例数据自动跳过，请在模板中填写正式名单后再上传'
        : ''),
  )
  return result
}
