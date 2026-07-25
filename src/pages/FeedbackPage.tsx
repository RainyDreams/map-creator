import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Bug, Lightbulb, MessageSquareHeart, RefreshCw, Send } from 'lucide-react'
import Clarity from '@microsoft/clarity'
import { toast } from 'sonner'
import StaticPageLayout, { SectionTitle } from '@/components/layout/StaticPageLayout'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getSessionLog, clearSessionLog } from '@/utils/sessionLog'
import { rememberMyFeedback, markRepliesSeen, myFeedbackKey } from '@/utils/replyNotify'
import { track } from '@/utils/analytics'
import { APP_VERSION } from '@/version'

/**
 * 问题反馈页（/feedback）：
 * - 公开反馈板：所有人可见最新 50 条反馈，人人可提交；
 * - 用户名本机随机生成（用户 + 7 位数字），localStorage 持久化，可一键更换；
 * - 管理员回复后，作者可凭本机保存的一次性凭证追加回复（追问），形成对话流水；
 * - 进入本页会把随机昵称设为 Clarity 自定义用户标识，日志上传附带 Clarity 用户/会话 ID，
 *   便于管理员在 Clarity 后台定位该用户的会话录屏（仅反馈场景，不含名单数据）；
 * - 代码按需加载（App.tsx 中 React.lazy 独立 chunk），不进入首屏 bundle。
 */

const USER_KEY = 'cenfan-feedback-user'
const MAX_CONTENT = 1000

type FeedbackKind = 'bug' | 'suggestion' | 'experience'

/** 对话流水单条：by=admin 管理员回复，by=user 作者追问 */
interface ThreadEntry {
  by: 'admin' | 'user'
  text: string
  ts: number
}

interface FeedbackItem {
  id: string
  name: string
  kind: FeedbackKind
  content: string
  ts: number
  status?: FeedbackStatus
  reply?: string
  replyTs?: number
  thread?: ThreadEntry[]
}

type FeedbackStatus = 'open' | 'in_progress' | 'done' | 'shelved' | 'closed'

/** 处理状态展示（GitHub issue 式）：公开板只读展示，管理端负责流转 */
const STATUS_META: Record<FeedbackStatus, { label: string; badge: string }> = {
  open: { label: '待处理', badge: 'bg-stone-100 text-stone-500' },
  in_progress: { label: '进行中', badge: 'bg-sky-100 text-sky-700' },
  done: { label: '已完成', badge: 'bg-emerald-100 text-emerald-700' },
  shelved: { label: '暂不处理', badge: 'bg-amber-100 text-amber-700' },
  closed: { label: '已关闭', badge: 'bg-stone-200 text-stone-500' },
}

const KIND_META: Record<FeedbackKind, { label: string; icon: typeof Bug; badge: string }> = {
  bug: { label: 'Bug 反馈', icon: Bug, badge: 'bg-rose-100 text-rose-700' },
  suggestion: { label: '功能建议', icon: Lightbulb, badge: 'bg-amber-100 text-amber-700' },
  experience: { label: '使用体验', icon: MessageSquareHeart, badge: 'bg-emerald-100 text-emerald-700' },
}

function genName(): string {
  return `用户${1000000 + Math.floor(Math.random() * 9000000)}`
}

/** 读取 Clarity Cookie 标识（_clck=匿名用户 ID，_clsk=会话 ID；分隔符新版为 ^ 旧版为 |，取主体部分） */
function clarityCookie(key: '_clck' | '_clsk'): string {
  try {
    for (const part of document.cookie.split(';')) {
      const t = part.trim()
      if (t.startsWith(`${key}=`)) {
        const v = decodeURIComponent(t.slice(key.length + 1))
        const cut = v.search(/[|^]/)
        return (cut >= 0 ? v.slice(0, cut) : v).slice(0, 40)
      }
    }
  } catch {
    // 忽略
  }
  return ''
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
  /** 附带我的使用日志（反馈 Bug 时默认勾选；日志仅保留 48 小时） */
  const [attachLog, setAttachLog] = useState(true)
  /** 追加回复（追问）：当前展开输入框的反馈 id 与草稿 */
  const [followOpenId, setFollowOpenId] = useState<string | null>(null)
  const [followDraft, setFollowDraft] = useState('')
  const [followSending, setFollowSending] = useState(false)

  // 把随机昵称设为 Clarity 自定义用户标识：管理员可按昵称在 Clarity 后台找到对应会话录屏
  useEffect(() => {
    try {
      Clarity.identify(name)
    } catch {
      // Clarity 未就绪不影响反馈功能
    }
  }, [name])

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
      // 列表加载成功即视为已读：把「我的反馈」当前回复时间记下，页脚红点消除
      markRepliesSeen(data.items)
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
                  clarityUser: clarityCookie('_clck'),
                  claritySession: clarityCookie('_clsk'),
                },
              }),
            })
            if (lr.ok) {
              const lj = (await lr.json()) as { ok: boolean; id?: string }
              logId = lj.id ?? ''
              if (logId !== '') {
                track('log')
                // Clarity 会话打上 logId 标签：日志 ↔ 录屏双向可对照
                try {
                  Clarity.setTag('logId', logId)
                } catch {
                  // 忽略
                }
                // 上传成功 = 新记录周期的起点：清空本机累积（「从上次上传完开始」语义）
                clearSessionLog()
              }
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
      const data = (await res.json()) as { ok: boolean; item: FeedbackItem; key?: string }
      setItems((prev) => (prev === null ? [data.item] : [data.item, ...prev].slice(0, 50)))
      // 记住「我的反馈」id + 作者凭证：管理员回复后页脚红点提醒；凭证用于追加回复时证明身份
      rememberMyFeedback(data.item.id, data.key ?? '')
      setContent('')
      track('feedback')
      toast.success(logId !== '' ? '已提交（含会话日志），感谢反馈' : '已提交，感谢反馈')
    } catch {
      toast.error('提交失败，请检查网络后重试')
    } finally {
      setSending(false)
    }
  }

  /** 追加回复（追问）：凭本机保存的作者凭证调用 /api/feedback/reply，写入对话流水 */
  const submitFollow = async (it: FeedbackItem) => {
    const key = myFeedbackKey(it.id)
    const text = followDraft.trim()
    if (key === '' || text === '' || followSending) return
    setFollowSending(true)
    try {
      const res = await fetch('/api/feedback/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: it.id, key, text }),
      })
      if (res.status === 403) {
        toast.error('无法验证作者身份（这条反馈可能来自旧版本）')
        return
      }
      if (res.status === 429) {
        toast.error('回复太频繁了，请过一分钟再试')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { ok: boolean; entry: ThreadEntry; status?: FeedbackStatus }
      setItems((prev) =>
        prev === null
          ? prev
          : prev.map((x) =>
              x.id === it.id
                ? { ...x, thread: [...(x.thread ?? []), data.entry], ...(data.status ? { status: data.status } : {}) }
                : x,
            ),
      )
      setFollowDraft('')
      setFollowOpenId(null)
      toast.success('已追加回复')
    } catch {
      toast.error('回复失败，请检查网络后重试')
    } finally {
      setFollowSending(false)
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
          const st = STATUS_META[it.status ?? 'open'] ?? STATUS_META.open
          const thread = it.thread ?? []
          /** 本机有这条反馈的作者凭证 = 是我提交的，可追加回复 */
          const mine = myFeedbackKey(it.id) !== ''
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
                <span
                  className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px]', st.badge)}
                >
                  {st.label}
                </span>
                <span className="text-xs text-stone-400">
                  {format(new Date(it.ts), 'yyyy-MM-dd HH:mm')}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words leading-6 text-stone-600">
                {it.content}
              </p>
              {thread.length > 0 ? (
                <div className="mt-2.5 space-y-1.5">
                  {thread.map((e, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-r-lg border-l-[3px] px-3 py-2',
                        e.by === 'admin' ? 'border-stone-300 bg-stone-50' : 'border-amber-300 bg-amber-50/60',
                      )}
                    >
                      <p className="text-[11px] text-stone-400">
                        {e.by === 'admin' ? '作者回复' : mine ? '我（追问）' : `${it.name}（追问）`}
                        {` · ${format(new Date(e.ts), 'yyyy-MM-dd HH:mm')}`}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">
                        {e.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                it.reply && (
                  <div className="mt-2.5 rounded-r-lg border-l-[3px] border-stone-300 bg-stone-50 px-3 py-2">
                    <p className="text-[11px] text-stone-400">
                      作者回复{it.replyTs ? ` · ${format(new Date(it.replyTs), 'yyyy-MM-dd HH:mm')}` : ''}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">
                      {it.reply}
                    </p>
                  </div>
                )
              )}
              {mine && (
                <div className="mt-2.5">
                  {followOpenId === it.id ? (
                    <div className="space-y-1.5">
                      <textarea
                        value={followDraft}
                        onChange={(e) => setFollowDraft(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="补充说明或回复作者…（公开可见，500 字以内）"
                        autoFocus
                        className="w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm leading-6 text-stone-700 placeholder:text-stone-400 focus:border-amber-400 focus:outline-none"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFollowOpenId(null)
                            setFollowDraft('')
                          }}
                          className="rounded-md px-2 py-1 text-xs text-stone-400 transition-colors hover:bg-stone-100"
                        >
                          取消
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={followDraft.trim() === '' || followSending}
                          onClick={() => void submitFollow(it)}
                          className="bg-stone-900 text-white hover:bg-stone-700"
                        >
                          <Send className="size-3.5" />
                          {followSending ? '发送中…' : '发送'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setFollowOpenId(it.id)
                        setFollowDraft('')
                      }}
                      className="rounded-md px-2 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-50"
                    >
                      追加回复
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }, [items, loadError, fetchList, followOpenId, followDraft, followSending])

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
              附带我的使用日志（仅保留 48 小时）：包含自上次上传以来（从未上传过则自首次访问以来）
              的控制台记录、页面报错与关键操作足迹，帮助我们定位问题；上传后本机记录清空、重新开始；
              不包含你的名单数据
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
