/**
 * 反馈跳转对话框（全局单例，App 挂载）：
 * 点击「问题反馈」不直接外链，先在这里选择是否附带使用日志——
 * 日志只在本站（map）的浏览器会话里，必须先经用户授权上传到 /api/logs，
 * 再把日志 ID 带到反馈平台，跨域链路才能闭合。
 *
 * 触发方式：openFeedbackJump()（页脚、导出失败提示条等任意入口）。
 */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { FEEDBACK_JUMP_EVENT, buildFeedbackUrl, uploadSessionLog } from '@/utils/feedbackJump'
import { breadcrumb } from '@/utils/sessionLog'

export default function FeedbackJumpDialog() {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(FEEDBACK_JUMP_EVENT, onOpen)
    return () => window.removeEventListener(FEEDBACK_JUMP_EVENT, onOpen)
  }, [])

  /** 附带日志：先上传拿 ID，再带参跳转；上传失败也继续跳转（不堵反馈入口） */
  const goWithLog = async () => {
    setUploading(true)
    breadcrumb('前往问题反馈（选择附带使用日志）')
    const logId = await uploadSessionLog()
    window.location.href = buildFeedbackUrl(logId)
  }

  const goPlain = () => {
    breadcrumb('前往问题反馈（不附带日志）')
    window.location.href = buildFeedbackUrl()
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => !uploading && setOpen(v)}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>前往问题反馈</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left text-sm leading-6">
              <p>
                反馈板在统一平台 feedback.linkbrain.top。为了让开发者更快定位问题，
                可以选择<strong className="text-stone-700">附带你的使用日志</strong>：
                只包含页面操作与报错记录，<strong className="text-stone-700">不包含你的名单数据</strong>，
                服务端仅保留 7 天。
              </p>
              <p className="text-xs text-stone-400">
                不附带日志时，仅携带匿名会话标识（用于必要时对照访问统计）。
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Button onClick={goWithLog} disabled={uploading} className="w-full">
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {uploading ? '正在上传日志…' : '附带使用日志并前往'}
          </Button>
          <Button variant="outline" onClick={goPlain} disabled={uploading} className="w-full">
            直接前往
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
