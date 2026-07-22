/**
 * 微信内置浏览器首次打开引导（非强制）：
 * 检测到微信 UA 且未展示过时，建议用户通过右上角「···」选择「在浏览器打开」——
 * 微信里无法直接下载生成的图片（只能长按保存），完整体验建议在系统浏览器中使用。
 * 用户可选择继续使用微信，记住选择后不再打扰。
 *
 * 为避免与首次使用协议弹窗叠加，本弹窗会等协议弹窗确认后再出现。
 */
import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { isWeChatBrowser } from '@/utils/wechat'

const GUIDE_KEY = 'cenfan-wechat-guide-v1'
const CONSENT_KEY = 'cenfan-consent-v1'

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function WeChatGuideDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isWeChatBrowser()) return
    if (lsGet(GUIDE_KEY) === '1') return
    // 等协议弹窗确认后再展示，避免两个弹窗叠加；每 800ms 检查一次
    const timer = setInterval(() => {
      if (lsGet(CONSENT_KEY) === '1') {
        clearInterval(timer)
        setOpen(true)
      }
    }, 800)
    return () => clearInterval(timer)
  }, [])

  const dismiss = () => {
    try {
      localStorage.setItem(GUIDE_KEY, '1')
    } catch {
      // 写入失败则本次关闭即可
    }
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) dismiss()
      }}
    >
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-stone-500" />
            建议在浏览器中打开
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-left leading-6">
              <p>你正在微信中访问本工具。</p>
              <p>
                微信里<strong>无法直接下载生成的图片</strong>（只能长按保存），
                部分体验也会受限。建议点击右上角「···」，选择
                <strong>「在浏览器打开」</strong>，体验更完整。
              </p>
              <p className="text-stone-400">当然，你也可以继续使用微信，我们不强制。</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            onClick={dismiss}
            className="w-full bg-stone-900 text-white hover:bg-stone-700"
          >
            我知道了，继续使用微信
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
