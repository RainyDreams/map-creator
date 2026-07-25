import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Bug, Lightbulb, MessageSquareHeart, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getSessionLog } from '@/utils/sessionLog'
import { track } from '@/utils/analytics'
import { APP_VERSION } from '@/version'

/**
 * 问题反馈页（/feedback）：
 * - 公开反馈板：所有人可见最新 50 条反馈，人人可提交；
 * - 用户名本机随机生成（用户 + 7 位数字），localStorage 持久化，可一键更换；
 * - 代码按需加载（App.tsx 中 React.lazy 独立 chunk），不进入首屏 bundle。
 */

const USER_KEY = 'cenfan-feedback-user'
const MAX_CONTENT = 1000

type FeedbackKind = 'bug' | 'suggestion' | 'experience'

interface FeedbackItem {
  id: string
  name: string
  kind: FeedbackKind
  content: string
  ts: number
}

const KIND_META: Record<FeedbackKind, { label: string; icon: typeof Bug; badge: string }> = {
  bug: { label: 'Bug 反馈', icon: Bug, badge: 'bg-rose-100 text-rose-700' },
  suggestion: { label: '功能建议', icon: Lightbulb, badge: 'bg-amber-100 text-amber-700' },
  experience: { label: '使用体验', icon: MessageSquareHeart, badge: 'bg-emerald-100 text-emerald-700' },
}

function genName(): string {
  return `用户${1000000 + Math.floor(Math.random() * 9000000)}`
}

function loadName(): string {
  try {
    const v = localStorage.getItem(USER_KEY)
    if (v && v.startsWith('用户')) return v
  } catch {
    // 忽略
  }
  const n = genName()
  try {
    localStorage.setItem(USER_KEY, n)
  } catch {
    // 忽略
  }
  return n
}

export default function FeedbackPage() {
  const [name, setName] = useState<string>(loadName)
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [items, setItems] = useState<FeedbackItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  /** 附带本次会话日志（反馈 Bug 时默认勾选；日志仅保留 48 小时） */
  const [attachLog, setAttachLog] = useState(true)

  // 切到 Bug 反馈时默认带上日志（用户可手动取消），切走时不打扰用户的选择
  useEffect(() => {
    if (kind === 'bug') setAttachLog(true)
  }, [kind])

  const fetchList = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await fetch('/api/feedback')
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { items: FeedbackItem[] }
      setItems(data.items)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const changeName = () => {
    const n = genName()
    setName(n)
    try {
      localStorage.setItem(USER_KEY, n)
    } catch {
      // 忽略
    }
  }

  const remaining = MAX_CONTENT - content.length
  const canSubmit = content.trim().length > 0 && remaining >= 0 && !sending

  const submit = async () => {
    if (!canSubmit) return
    setSending(true)
    try {
      // 勾选「附带会话日志」时先上传日志（失败不阻塞反馈提交）；无日志内容则跳过
      let logId = ''
      if (attachLog) {
        try {
          const entries = getSessionLog()
          if (entries.length > 0) {
            const lr = await fetch('/api/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entries,
                meta: {
                  version: APP_VERSION,
                  ua: navigator.userAgent,
                  page: location.pathname,
                  viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}x`,
                  lang: navigator.language,
                  net: (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? '',
                },
              }),
            })
            if (lr.ok) {
              const lj = (await lr.json()) as { ok: boolean; id?: string }
              logId = lj.id ?? ''
              if (logId !== '') track('log')
            }
          }
        } catch {
          // 日志上传失败静默降级为不带日志提交
        }
      }
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, kind, content: content.trim(), ...(logId !== '' ? { logId } : {}) }),
      })
      if (res.status === 429) {
        toast.error('提交太频繁了，请过一分钟再试')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { ok: boolean; item: FeedbackItem }
      setItems((prev) => (prev === null ? [data.item] : [data.item, ...prev].slice(0, 50)))
      setContent('')
      track('feedback')
      toast.success(logId !== '' ? '已提交（含会话日志），感谢反馈' : '已提交，感谢反馈')
    } catch {
      toast.error('提交失败，请检查网络后重试')
    } finally {
      setSending(false)
    }
  }

  const listBody = useMemo(() => {
    if (loadError) {
      return (
        <div className="rounded-xl border border-stone-200 bg-white/70 p-6 text-center">
          <p className="text-stone-500">反馈列表加载失败</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setItems(null)
              fetchList()
            }}
          >
            <RefreshCw className="size-3.5" />
            重新加载
          </Button>
        </div>
      )
    }
    if (items === null) {
      return (
        <div className="animate-pulse space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-stone-200/70 bg-white/60 p-4">
              <div className="h-3.5 w-32 rounded bg-stone-200" />
              <div className="mt-2.5 h-3 w-full rounded bg-stone-200/80" />
              <div className="mt-1.5 h-3 w-2/3 rounded bg-stone-200/60" />
            </div>
          ))}
        </div>
      )
    }
    if (items.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white/50 p-8 text-center text-stone-400">
          还没有反馈，来抢沙发
        </div>
      )
    }
    return (
      <ul className="space-y-3">
        {items.map((it) => {
          const meta = KIND_META[it.kind] ?? KIND_META.suggestion
          const Icon = meta.icon
          return (
            <li key={it.id} className="rounded-xl border border-stone-200/80 bg-white/80 p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-stone-700">{it.name}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
                    meta.badge,
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
                <span className="text-xs text-stone-400">
                  {format(new Date(it.ts), 'yyyy-MM-dd HH:mm')}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words leading-6 text-stone-600">
                {it.content}
              </p>
            </li>
          )
        })}
      </ul>
    )
  }, [items, loadError, fetchList])

  return (
    <StaticPageLayout title="问题反馈">
      <p className="rounded-xl border border-amber-200/70 bg-white/70 p-4 text-stone-600">
        这里是一块公开的反馈板：遇到的 Bug、想要的功能、使用感受都可以写。
        反馈内容<strong className="text-stone-700">所有人可见</strong>，请勿填写姓名、联系方式等个人信息。
      </p>
      <p className="rounded-xl border border-stone-200/70 bg-white/60 p-4 text-sm leading-6 text-stone-500">
        这个小站由一个人开发和维护，目前不计成本地免费开放给大家使用——
        权当是为社会添一块砖、加一片瓦。你的每一条反馈我都会认真看，
        好的建议会尽量排进后续版本。
      </p>

      <section className="space-y-3 rounded-xl border border-stone-200/80 bg-white/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>我要反馈</SectionTitle>
          <div className="flex items-center gap-1.5 text-xs text-stone-400">
            <span>
              随机昵称：<span className="font-medium text-stone-600">{name}</span>
            </span>
            <button
              type="button"
              onClick={changeName}
              className="rounded-md px-1.5 py-0.5 text-amber-700 transition-colors hover:bg-amber-50"
            >
              换一个
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND_META) as FeedbackKind[]).map((k) => {
            const meta = KIND_META[k]
            const Icon = meta.icon
            const active = kind === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
                  active
                    ? 'border-stone-800 bg-stone-800 text-white'
                    : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
              </button>
            )
          })}
        </div>

        <div className="space-y-1.5">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={MAX_CONTENT + 200}
            placeholder="描述一下你遇到的问题或想法…（请勿填写个人信息）"
            className="w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm leading-6 text-stone-700 placeholder:text-stone-400 focus:border-amber-400 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className={cn('text-xs', remaining < 0 ? 'text-rose-600' : 'text-stone-400')}>
              {content.length}/{MAX_CONTENT}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={!canSubmit}
              onClick={submit}
              className="bg-stone-900 text-white hover:bg-stone-700"
            >
              <Send className="size-3.5" />
              {sending ? '提交中…' : '提交反馈'}
            </Button>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-4 text-stone-400 md:text-xs">
            <input
              type="checkbox"
              checked={attachLog}
              onChange={(e) => setAttachLog(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-stone-800"
            />
            <span>
              附带本次会话日志（仅保留 48 小时）：只记录本次打开页面后的控制台记录，
              帮助我们定位问题；不包含你的名单数据
            </span>
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>大家的反馈</SectionTitle>
        {listBody}
      </section>
    </StaticPageLayout>
  )
}
