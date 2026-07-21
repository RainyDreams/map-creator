import { useEffect } from 'react'
import { initWechatShare } from '@/utils/wechat'

/**
 * 应用级微信分享配置 hook：挂载时执行一次，配置「发送给朋友 / 分享到朋友圈」卡片。
 * 非微信环境或未配置微信 secret 时自动静默降级，不产生任何副作用。
 */
export function useWechatShare(): void {
  useEffect(() => {
    void initWechatShare({
      title: '蹭饭图生成器',
      desc: '毕业班蹭饭图在线制作：录入同学老师去向，一键在中国地图上生成蹭饭图并导出图片。',
    })
  }, [])
}
