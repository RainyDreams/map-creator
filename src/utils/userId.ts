/**
 * 全站统一的匿名用户标识（持久化在本机）：
 * - 应用启动即生成/读取，并立刻通过 Clarity.identify() 传给 Clarity——
 *   管理员在 Clarity 后台按这个 ID 即可检索到该用户的全部会话录屏；
 * - 反馈表单用它当昵称（「用户5916489」式），反馈记录、会话日志、Clarity 三方贯通：
 *   看到一条反馈/日志，就能用同一个 ID 去 Clarity 拉出完整操作回放；
 * - 与旧版反馈昵称共用同一个 localStorage 键，老用户 ID 不变。
 */

const USER_KEY = 'cenfan-feedback-user'

function genName(): string {
  return `用户${1000000 + Math.floor(Math.random() * 9000000)}`
}

/** 取本机持久用户 ID（不存在则生成并写入；任何存储异常都回退为临时 ID，不影响功能） */
export function getUserId(): string {
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

/** 重新生成用户 ID（反馈页「换一个昵称」用）。
    注意：换 ID 后 Clarity 里新旧两段会话需要用各自 ID 分别检索 */
export function resetUserId(): string {
  const n = genName()
  try {
    localStorage.setItem(USER_KEY, n)
  } catch {
    // 忽略
  }
  return n
}
