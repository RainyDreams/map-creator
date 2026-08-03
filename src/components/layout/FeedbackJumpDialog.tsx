/**
 * 反馈跳转加载遮罩（全局单例，App 挂载）：
 * 点击「问题反馈」后的完整流程——
 *   1. 点击瞬间同步打开一个空白新标签页（window.open 必须在用户手势内调用，
 *      等日志异步上传完再开会被浏览器弹窗拦截）；
 *   2. 当前页展示「反馈页面正在加载」动画，后台上传使用日志到 /api/logs；
 *   3. 上传完成后把新标签页指向带参（log/cu/cs）的反馈平台地址，
 *      随后关闭当前页遮罩——遮罩一定在新标签页打开之后才消失；
 *   4. 新标签页被拦截时退化为当前页跳转（遮罩随页面卸载消失）。
 *
 * 设计约束：
 * - 默认上传日志（没有日志无法排查 Bug）；日志只含操作与报错记录，不含名单数据；
 * - 上传失败或超时（8s）也照常跳转，不堵反馈入口；
 * - 触发方式：openFeedbackJump()（页脚、导出失败提示条等任意入口）。
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  FEEDBACK_JUMP_EVENT,
  FEEDBACK_ORIGIN,
  ackPendingLogIds,
  buildFeedbackUrl,
  getPendingLogIds,
  uploadSessionLog,
} from '@/utils/feedbackJump'
import { breadcrumb } from '@/utils/sessionLog'

/** 上传最长等待时间：超时直接跳转，不让用户干等 */
const UPLOAD_TIMEOUT_MS = 8000

export default function FeedbackJumpDialog() {
  const [show, setShow] = useState(false)
  /** 防止重复触发（连点/多入口同时触发） */
  const running = useRef(false)

  useEffect(() => {
    /** 反馈提交成功回执：反馈页 postMessage 通知，把这批日志 ID 从本地累积中清除 */
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== FEEDBACK_ORIGIN) return
      const d = e.data as { type?: unknown; logIds?: unknown } | null
      if (d && d.type === 'cenfan:feedback-submitted' && Array.isArray(d.logIds)) {
        ackPendingLogIds(d.logIds.filter((v): v is string => typeof v === 'string'))
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    const onOpen = () => {
      if (running.current) return
      running.current = true
      // 第 1 步：手势内同步打开空白新标签页；被拦截则记 null 走当前页兜底
      const tab = window.open('about:blank', '_blank')
      setShow(true)
      breadcrumb('前往问题反馈（自动上传使用日志）')

      let done = false
      /** 第 3 步：新标签页指向正式地址（携带全部累积日志 ID），然后关闭遮罩 */
      const go = () => {
        if (done) return
        done = true
        const url = buildFeedbackUrl(getPendingLogIds().join(','))
        if (tab) {
          try {
            tab.location.href = url
          } catch {
            window.location.href = url
            return
          }
          // 新标签页已接管：关闭遮罩并复位
          setShow(false)
          running.current = false
        } else {
          // 弹窗被拦截：当前页跳转，遮罩随卸载消失
          window.location.href = url
        }
      }

      const timer = window.setTimeout(go, UPLOAD_TIMEOUT_MS)
      uploadSessionLog()
        .then(() => {
          window.clearTimeout(timer)
          go()
        })
        .catch(() => {
          window.clearTimeout(timer)
          go()
        })
    }
    window.addEventListener(FEEDBACK_JUMP_EVENT, onOpen)
    return () => window.removeEventListener(FEEDBACK_JUMP_EVENT, onOpen)
  }, [])

  if (!show) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-900/40 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white px-8 py-6 shadow-xl">
        <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
        <p className="text-sm text-stone-600">反馈页面正在加载…</p>
        <p className="text-xs text-stone-400">正在附带你的使用日志（不含名单数据），以便开发者定位问题</p>
      </div>
    </div>
  )
}
