/**
 * 旧浏览器兼容垫片（必须在所有业务模块之前加载）。
 * Array.prototype.at 是 ES2022 特性，旧 WebView/旧浏览器（如部分国产浏览器、
 * iOS < 16.4）缺失；依赖库（recharts 等）用到 .at() 会直接抛
 * "t.entries.at is not a function"（线上错误上报实锤，2026-07-30）。
 */

if (typeof Array.prototype.at !== 'function') {
  Array.prototype.at = function at<T>(this: T[], n: number): T | undefined {
    const len = this.length
    const i = Math.trunc(n) || 0
    const idx = i >= 0 ? i : len + i
    return idx >= 0 && idx < len ? this[idx] : undefined
  }
}

export {}
