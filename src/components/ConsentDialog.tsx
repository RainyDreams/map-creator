import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { Map as MapIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const CONSENT_KEY = 'cenfan-consent-v1'

function hasConsented(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 首访欢迎与协议同意弹窗：
 * - 仅在第一次打开主创作页时出现一次，点击「开始使用」后记住选择、之后不再打扰
 * - 在《用户协议》《隐私政策》《关于》页面不弹出——用户还没读到协议内容就要求同意，
 *   逻辑上是倒置的；阅读协议本身不需要先同意
 * - 内容刻意精简：一句话软件介绍 + 协议链接 + 一个按钮
 */
/** 不弹同意窗的路径（阅读协议/隐私/关于不需要先同意协议） */
const CONSENT_FREE_PATHS = new Set(['/agreement', '/privacy', '/about'])

export function ConsentDialog() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState<boolean>(
    () => !hasConsented() && !CONSENT_FREE_PATHS.has(window.location.pathname),
  )

  // 用户先在协议页阅读、再进入主创作页时，补弹一次同意窗（已同意过则不再打扰）
  useEffect(() => {
    if (!hasConsented() && !CONSENT_FREE_PATHS.has(pathname)) setOpen(true)
  }, [pathname])

  const agree = () => {
    try {
      localStorage.setItem(CONSENT_KEY, '1')
    } catch {
      // 隐私模式写入失败则下次仍会提示，属可接受行为
    }
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // 只允许通过「开始使用」关闭，避免误点遮罩跳过同意
        if (!v) agree()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="rounded-2xl border-stone-200 bg-white sm:max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-stone-800">
            <MapIcon className="h-5 w-5 text-amber-600" />
            欢迎使用蹭饭图生成器
          </DialogTitle>
          <DialogDescription className="space-y-2 text-left leading-relaxed text-stone-500">
            <span className="block">
              为毕业班制作一张「大家都去了哪上大学」的中国地图：录入名单，
              自动生成高清蹭饭图，数据只保存在你自己的浏览器里。
            </span>
            <span className="block">
              继续使用前，请阅读并同意
              <a
                href="/agreement"
                target="_blank"
                rel="noreferrer"
                className="mx-1 text-amber-700 underline underline-offset-2 hover:text-amber-800"
              >
                《用户协议》
              </a>
              和
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="mx-1 text-amber-700 underline underline-offset-2 hover:text-amber-800"
              >
                《隐私政策》
              </a>
              （含 Cookie 使用说明）。
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            onClick={agree}
            className="w-full bg-stone-900 text-white hover:bg-stone-700"
          >
            我已阅读并同意，开始使用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
