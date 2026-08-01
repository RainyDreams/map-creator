import { lazy, type ComponentType } from 'react'

/**
 * 带自愈能力的 React.lazy（v1.42.9）。
 *
 * 背景：动态分块拉取失败（Failed to fetch dynamically imported module）时，
 * 原生 React.lazy 会把错误抛给上层——没有 ErrorBoundary 就是整页白屏。
 * 失败绝大多数发生在两种场景：
 *   1. 版本更新瞬间：浏览器里还是旧 index.html，引用的旧分块已被新部署替换；
 *   2. 网络波动：分块请求中途失败。
 * 两种情况的解药都是「硬刷新一次拿到最新 index.html 与分块清单」。
 *
 * 策略：每个会话只自动硬刷新一次（sessionStorage 标记，应用成功挂载后清除），
 * 刷新后仍失败则把错误抛给 ErrorBoundary，由它展示可手动重试的界面。
 */

const RELOAD_FLAG = 'cenfan-lazy-reload'

/** 应用成功挂载后调用，重置自愈标记，允许下次失败再次自动刷新 */
export function clearLazyReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* 隐私模式等场景下忽略 */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (err) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1')
          window.location.reload()
          // 永不 resolve：保持当前界面直到浏览器完成刷新，避免白屏
          return new Promise<{ default: T }>(() => {})
        }
      } catch {
        /* sessionStorage 不可用时直接抛错 */
        
      }
      throw err
    }
  })
}
