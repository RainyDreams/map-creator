/**
 * 反馈跳转加载遮罩（全局单例，App 挂载）：
 * 点击「问题反馈」后自动执行——先把累积使用日志上传到 /api/logs 拿编号，
 * 再带参（log/cu/cs）跳转统一反馈平台；全程只展示「反馈页面正在加载」动画，
 * 页面跳走后遮罩自然消失。
 *
 * 设计约束：
 * - 默认上传日志（没有日志无法排查 Bug）；日志只含操作与报错记录，不含名单数据；
 * - 上传失败或超时（8s）也照常跳转，不堵反馈入口；
 * - 触发方式：openFeedbackJump()（页脚、导出失败提示条等任意入口）。
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { FEEDBACK_JUMP_EVENT, buildFeedbackUrl, uploadSessionLog } from '@/utils/feedbackJump'
import { breadcrumb } from '@/utils/sessionLog'

/** 上传最长等待时间：超时直接跳转，不让用户干等 */
const UPLOAD_TIMEOUT_MS = 8000

export default function FeedbackJumpDialog() {
  const [show, setShow] = useState(false)
  /** 防止重复触发（连点/多入口同时触发） */
  const running = useRef(false)

  useEffect(() => {
    const onOpen = () => {
      if (running.current) return
      running.current = true
      setShow(true)
      breadcrumb('前往问题反馈（自动上传使用日志）')
      const timer = window.setTimeout(() => {
        window.location.href = buildFeedbackUrl()
      }, UPLOAD_TIMEOUT_MS)
      uploadSessionLog()
        .then((logId) => {
          window.clearTimeout(timer)
          window.location.href = buildFeedbackUrl(logId)
        })
        .catch(() => {
          window.clearTimeout(timer)
          window.location.href = buildFeedbackUrl()
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
