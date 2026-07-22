/**
 * 微信 JS-SDK 分享轻量封装。
 *
 * 仅在微信内置浏览器中按需加载 jweixin-1.3.2.js：向 /api/wechat/signature 换取签名后
 * 执行 wx.config，并在 wx.ready 中设置「发送给朋友」与「分享到朋友圈」的分享卡片。
 * 任何环节失败（非微信环境、签名接口 503/502、脚本加载失败、wx.config 校验失败）
 * 一律静默降级，不影响页面任何功能。
 */

interface WxConfigOptions {
  debug: boolean
  appId: string
  timestamp: number
  nonceStr: string
  signature: string
  jsApiList: string[]
}

interface WxShareData {
  title: string
  desc?: string
  link: string
  imgUrl: string
}

/** 微信全局对象 wx 的最小类型声明（仅覆盖本项目用到的 API） */
interface WxInstance {
  config: (options: WxConfigOptions) => void
  ready: (callback: () => void) => void
  error: (callback: (err: unknown) => void) => void
  updateAppMessageShareData: (data: WxShareData) => void
  updateTimelineShareData: (data: WxShareData) => void
}

declare global {
  interface Window {
    wx?: WxInstance
  }
}

/** 当前是否运行在微信内置浏览器中 */
export function isWeChatBrowser(): boolean {
  return (
    typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent)
  )
}

const JWEIXIN_URL = 'https://res.wx.qq.com/open/js/jweixin-1.3.2.js'

interface SignatureResponse {
  appId?: string
  timestamp?: number
  nonceStr?: string
  signature?: string
  error?: string
}

export interface WechatShareContent {
  /** 分享标题（发送给朋友 / 朋友圈共用） */
  title: string
  /** 分享描述（仅发送给朋友展示） */
  desc: string
  /** 分享链接，缺省为当前页 URL（不含 #） */
  link?: string
  /** 分享缩略图，缺省为本站 /icon.png 的绝对地址 */
  imgUrl?: string
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('script load failed'))
    document.head.appendChild(script)
  })
}

/** 初始化微信分享配置；任何失败均静默降级，永不抛出。 */
export async function initWechatShare(content: WechatShareContent): Promise<void> {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return
    // 仅微信内置浏览器需要 JS-SDK 分享配置，其他环境直接跳过，避免无谓的脚本与请求
    if (!/MicroMessenger/i.test(navigator.userAgent)) return

    const pageUrl = window.location.href.split('#')[0]
    const res = await fetch(`/api/wechat/signature?url=${encodeURIComponent(pageUrl)}`)
    if (!res.ok) return // 503 wechat_not_configured / 502 upstream 等情况，静默降级
    const data = (await res.json()) as SignatureResponse
    if (!data.appId || !data.timestamp || !data.nonceStr || !data.signature) return

    await loadScript(JWEIXIN_URL)
    const wx = window.wx
    if (!wx) return

    const link = content.link ?? pageUrl
    const imgUrl = content.imgUrl ?? new URL('/icon.png', window.location.origin).href

    wx.config({
      debug: false,
      appId: data.appId,
      timestamp: data.timestamp,
      nonceStr: data.nonceStr,
      signature: data.signature,
      jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
    })
    wx.ready(() => {
      wx.updateAppMessageShareData({
        title: content.title,
        desc: content.desc,
        link,
        imgUrl,
      })
      wx.updateTimelineShareData({
        title: content.title,
        link,
        imgUrl,
      })
    })
    wx.error(() => {
      // 签名校验失败等：静默降级，微信将回退到默认分享样式
    })
  } catch {
    // 静默降级
  }
}
