import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Bug,
  CheckCircle2,
  CircleDot,
  Lightbulb,
  MessageSquare,
  MessageSquareHeart,
  RefreshCw,
  Send,
} from 'lucide-react'
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
 * 问题反馈（GitHub Issues 式）：
 * - /feedback         反馈列表：状态图标 + 标题 + 标签 + 评论数，点击进入详情；
 * - /feedback?id=<id> 反馈详情：首帖 + 评论时间线 + 底部评论框，完完全全对照 GitHub issue 页面
 *   （用查询参数而非路径段：站点 base 为 ./，二级路径下相对资源会 404）；
 * - 任何人都可以评论（随机昵称署名）；创建反馈时服务端下发的一次性作者凭证保存在本机，
 *   带凭证的评论获得「作者」徽标（对应 GitHub Author badge），他人无法冒充；
 * - 用户名本机随机生成（用户 + 7 位数字），localStorage 持久化，可一键更换；
 * - 代码按需加载（App.tsx 中 React.lazy 独立 chunk），不进入首屏 bundle。
 */

const USER_KEY = 'cenfan-feedback-user'
const MAX_CONTENT = 1000
const MAX_COMMENT = 500

type FeedbackKind = 'bug' | 'suggestion' | 'experience'
type FeedbackStatus = 'open' | 'in_progress' | 'done' | 'shelved' | 'closed'

/** 对话流水单条：by=admin 管理员，by=user 访客/作者；author=true 经凭证验证的作者评论 */
interface ThreadEntry {
  by: 'admin' | 'user'
  text: string
  ts: number
  name?: string
  author?: boolean
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

/** 处理状态展示 */
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

/** GitHub 二元状态映射：done/closed 视为 Closed（紫），其余视为 Open（绿） */
function isClosedStatus(s?: FeedbackStatus): boolean {
  return s === 'done' || s === 'closed'
}

/** issue 标题：首帖第一行，≤ 80 字符 */
function issueTitle(content: string): string {
  const first = content.split('\n')[0] ?? content
  return first.length > 80 ? `${first.slice(0, 80)}…` : first
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

/** GitHub「Owner/Author」式徽标 */
function RoleBadge({ children, tone }: { children: string; tone: 'owner' | 'author' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-1.5 py-px text-[11px] leading-4',
        tone === 'owner' ? 'border-purple-300 text-purple-700' : 'border-stone-300 text-stone-500',
      )}
    >
      {children}
    </span>
  )
}

/** 单条评论卡片（GitHub issue comment 结构：头部条 + 正文） */
function CommentCard({
  who,
  ts,
  verb,
  badges,
  text,
  highlight,
}: {
  who: string
  ts: number
  verb: string
  badges?: React.ReactNode
  text: string
  highlight?: boolean
}) {
  return (
    <div className={cn('overflow-hidden rounded-md border', highlight ? 'border-amber-300' : 'border-stone-200')}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2 text-[13px]',
          highlight ? 'border-amber-200 bg-amber-50/70' : 'border-stone-200 bg-stone-50',
        )}
      >
        <span className="font-semibold text-stone-800">{who}</span>
        <span className="text-stone-400">
          {verb} · {format(new Date(ts), 'yyyy-MM-dd HH:mm')}
        </span>
        {badges}
      </div>
      <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6 text-stone-700">{text}</p>
    </div>
  )
}

/* ================= 列表页（GitHub Issues 列表） ================= */

function IssueList({
  items,
  loadError,
  onRetry,
}: {
  items: FeedbackItem[] | null
  loadError: boolean
  onRetry: () => void
}) {
  const navigate = useNavigate()
  if (loadError) {
    return (
      <div className="rounded-md border border-stone-200 bg-white p-6 text-center">
        <p className="text-stone-500">反馈列表加载失败</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          重新加载
        </Button>
      </div>
    )
  }
  if (items === null) {
    return (
      <div className="animate-pulse rounded-md border border-stone-200">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn('bg-white/60 p-4', i > 0 && 'border-t border-stone-200/70')}>
            <div className="h-3.5 w-2/3 rounded bg-stone-200" />
            <div className="mt-2 h-3 w-40 rounded bg-stone-200/70" />
          </div>
        ))}
      </div>
    )
  }

  const openCount = items.filter((it) => !isClosedStatus(it.status)).length
  const closedCount = items.length - openCount

  return (
    <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
      {/* 列表头：Open/Closed 计数（GitHub issues 工具条） */}
      <div className="flex items-center gap-4 border-b border-stone-200 bg-stone-50 px-4 py-2.5 text-[13px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-stone-700">
          <CircleDot className="h-4 w-4 text-emerald-600" />
          {openCount} 进行中
        </span>
        <span className="inline-flex items-center gap-1.5 text-stone-500">
          <CheckCircle2 className="h-4 w-4 text-purple-600" />
          {closedCount} 已完结
        </span>
      </div>
      {items.length === 0 && (
        <div className="p-10 text-center text-sm text-stone-400">还没有反馈，来抢沙发</div>
      )}
      <ul>
        {items.map((it) => {
          const closed = isClosedStatus(it.status)
          const meta = KIND_META[it.kind] ?? KIND_META.suggestion
          const st = STATUS_META[it.status ?? 'open'] ?? STATUS_META.open
          const comments = (it.thread ?? []).length
          const short = it.id.slice(-6)
          return (
            <li key={it.id} className="border-t border-stone-200/80 first:border-t-0">
              <button
                type="button"
                onClick={() => navigate(`/feedback?id=${encodeURIComponent(it.id)}`)}
                className="block w-full px-4 py-3 text-left transition-colors hover:bg-stone-50"
              >
                <div className="flex items-start gap-2.5">
                  {closed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
                  ) : (
                    <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold text-stone-800 hover:text-sky-700">
                        {issueTitle(it.content)}
                      </span>
                      <span
                        className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px]', meta.badge)}
                      >
                        {meta.label}
                      </span>
                      <span
                        className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px]', st.badge)}
                      >
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-stone-400">
                      #{short} · {it.name} 提出于 {format(new Date(it.ts), 'yyyy-MM-dd HH:mm')}
                    </p>
                  </div>
                  {comments > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-stone-400">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {comments}
                    </span>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ================= 详情页（GitHub issue 页面） ================= */

function IssueDetail({ id, name }: { id: string; name: string }) {
  const [item, setItem] = useState<FeedbackItem | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await fetch(`/api/feedback?id=${encodeURIComponent(id)}`)
      if (res.status === 404) {
        setError('这条反馈不存在或已被删除')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { item: FeedbackItem }
      setItem(data.item)
      markRepliesSeen([data.item])
    } catch {
      setError('加载失败，请检查网络后重试')
    }
  }, [id])

  useEffect(() => {
    setItem(null)
    load()
  }, [load])

  const canComment = draft.trim().length > 0 && draft.length <= MAX_COMMENT && !sending
  const submitComment = async () => {
    if (!canComment || !item) return
    setSending(true)
    try {
      const key = myFeedbackKey(item.id)
      const res = await fetch('/api/feedback/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, ...(key !== '' ? { key } : {}), name, text: draft.trim() }),
      })
      if (res.status === 429) {
        toast.error('评论太频繁了，请过一分钟再试')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { ok: boolean; entry: ThreadEntry; status?: FeedbackStatus }
      setItem((prev) =>
        prev === null
          ? prev
          : { ...prev, thread: [...(prev.thread ?? []), data.entry], ...(data.status ? { status: data.status } : {}) },
      )
      setDraft('')
      toast.success('评论已发表')
    } catch {
      toast.error('评论失败，请检查网络后重试')
    } finally {
      setSending(false)
    }
  }

  if (error !== '') {
    return (
      <div className="rounded-md border border-stone-200 bg-white p-8 text-center text-stone-500">
        {error}
        <div className="mt-4">
          <Link to="/feedback" className="text-sm text-sky-700 hover:underline">
            ← 返回反馈列表
          </Link>
        </div>
      </div>
    )
  }
  if (item === null) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-7 w-2/3 rounded bg-stone-200" />
        <div className="h-4 w-52 rounded bg-stone-200/70" />
        <div className="h-32 rounded-md bg-stone-200/50" />
        <div className="h-24 rounded-md bg-stone-200/40" />
      </div>
    )
  }

  const closed = isClosedStatus(item.status)
  const meta = KIND_META[item.kind] ?? KIND_META.suggestion
  const st = STATUS_META[item.status ?? 'open'] ?? STATUS_META.open
  const thread = item.thread ?? []
  const commentTotal = thread.length + 1
  /** 首帖作者昵称：流水里老数据（无 name）的用户条目也归属首帖作者 */
  const authorName = item.name

  return (
    <div className="space-y-4">
      <Link
        to="/feedback"
        className="inline-flex items-center gap-1 text-sm text-stone-400 transition-colors hover:text-stone-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回反馈列表
      </Link>

      {/* issue 头部：标题 + 状态徽标（GitHub issue header） */}
      <div className="space-y-2 border-b border-stone-200 pb-4">
        <h2 className="text-xl leading-8 font-semibold break-words text-stone-900">
          {issueTitle(item.content)}
          <span className="ml-2 font-normal text-stone-400">#{item.id.slice(-6)}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-white',
              closed ? 'bg-purple-600' : 'bg-emerald-600',
            )}
          >
            {closed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
            {closed ? '已完结' : '进行中'}
          </span>
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px]', meta.badge)}>
            {meta.label}
          </span>
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px]', st.badge)}>
            {st.label}
          </span>
          <span className="text-stone-500">
            <span className="font-medium text-stone-700">{item.name}</span> 于{' '}
            {format(new Date(item.ts), 'yyyy-MM-dd HH:mm')} 提出 · {commentTotal} 条评论
          </span>
        </div>
      </div>

      {/* 评论时间线：首帖 + 逐条评论（GitHub issue timeline） */}
      <div className="space-y-3">
        <CommentCard
          who={item.name}
          ts={item.ts}
          verb="提出了这条反馈"
          badges={<RoleBadge tone="author">作者</RoleBadge>}
          text={item.content}
        />
        {thread.map((e, i) =>
          e.by === 'admin' ? (
            <CommentCard
              key={i}
              who="管理员"
              ts={e.ts}
              verb="回复"
              badges={<RoleBadge tone="owner">站主</RoleBadge>}
              text={e.text}
              highlight
            />
          ) : (
            <CommentCard
              key={i}
              who={e.name ?? authorName}
              ts={e.ts}
              verb="评论"
              badges={e.author || !e.name ? <RoleBadge tone="author">作者</RoleBadge> : undefined}
              text={e.text}
            />
          ),
        )}
      </div>

      {/* 评论框（GitHub issue composer：任何人可评论） */}
      <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
        <div className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-[13px] text-stone-500">
          添加评论 · 以 <span className="font-medium text-stone-700">{name}</span> 的身份发表
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          maxLength={MAX_COMMENT + 100}
          placeholder="补充信息、回复讨论…（公开可见，请勿填写个人信息）"
          className="w-full resize-y px-4 py-3 text-sm leading-6 text-stone-700 placeholder:text-stone-400 focus:outline-none"
        />
        <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2.5">
          <span className={cn('text-xs', draft.length > MAX_COMMENT ? 'text-rose-600' : 'text-stone-400')}>
            {draft.length}/{MAX_COMMENT}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!canComment}
            onClick={submitComment}
            className="bg-emerald-700 text-white hover:bg-emerald-600"
          >
            <Send className="size-3.5" />
            {sending ? '发表中…' : '评论'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ================= 页面主体 ================= */

export default function FeedbackPage() {
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')
  const navigate = useNavigate()
  const [name, setName] = useState<string>(loadName)
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [items, setItems] = useState<FeedbackItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  /** 附带我的使用日志（反馈 Bug 时默认勾选；日志仅保留 48 小时） */
  const [attachLog, setAttachLog] = useState(true)

  // 切到 Bug 反馈时默认带上日志（用户可手动取消），切走时不打扰用户的选择
  useEffect(() => {
    if (kind === 'bug') setAttachLog(true)
  }, [kind])

  // 把随机昵称设为 Clarity 自定义用户标识：管理员可按昵称在 Clarity 后台找到对应会话录屏
  useEffect(() => {
    try {
      Clarity.identify(name)
    } catch {
      // Clarity 未就绪不影响反馈功能
    }
  }, [name])

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
    if (!id) fetchList()
  }, [fetchList, id])

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
      // 记住「我的反馈」id + 作者凭证：管理员回复后页脚红点提醒；凭证用于「作者」徽标与追问重开
      rememberMyFeedback(data.item.id, data.key ?? '')
      setContent('')
      track('feedback')
      toast.success(logId !== '' ? '已提交（含使用日志），感谢反馈' : '已提交，感谢反馈')
      // GitHub 式：提交后进入这条反馈的详情页
      navigate(`/feedback?id=${encodeURIComponent(data.item.id)}`)
    } catch {
      toast.error('提交失败，请检查网络后重试')
    } finally {
      setSending(false)
    }
  }

  const formSection = useMemo(
    () => (
      <section className="space-y-3 rounded-md border border-stone-200 bg-white p-4 sm:p-5">
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
            className="w-full resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-6 text-stone-700 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none"
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
              className="bg-emerald-700 text-white hover:bg-emerald-600"
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ),
    [name, kind, content, remaining, canSubmit, sending, attachLog],
  )

  return (
    <StaticPageLayout title="问题反馈">
      {!id && (
        <>
          <p className="rounded-xl border border-amber-200/70 bg-white/70 p-4 text-stone-600">
            这里是一块公开的反馈板（形式类似 GitHub Issues）：遇到的 Bug、想要的功能、使用感受都可以写，
            每条反馈下人人都可以评论讨论。内容<strong className="text-stone-700">所有人可见</strong>，
            请勿填写姓名、联系方式等个人信息。
          </p>
          <p className="rounded-xl border border-stone-200/70 bg-white/60 p-4 text-sm leading-6 text-stone-500">
            这个小站由一个人开发和维护，目前不计成本地免费开放给大家使用——
            权当是为社会添一块砖、加一片瓦。你的每一条反馈我都会认真看，
            好的建议会尽量排进后续版本。
          </p>
          {formSection}
          <section className="space-y-3">
            <SectionTitle>大家的反馈</SectionTitle>
            <IssueList items={items} loadError={loadError} onRetry={fetchList} />
          </section>
        </>
      )}
      {id && <IssueDetail id={id} name={name} />}
    </StaticPageLayout>
  )
}
