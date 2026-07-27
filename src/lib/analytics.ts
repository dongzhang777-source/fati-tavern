/**
 * 漏斗埋点——只记 4 个匿名事件：访问（pageview 自动）/ 导入成功 / 首条消息 / 第二轮对话。
 * 不含任何聊天内容、Key、角色卡数据；隐私声明在落地页明示。
 * 事件用 localStorage 去重（每设备一次），符合"漏斗按访客计数"的口径。
 */
import { track, inject } from '@vercel/analytics'

export function initAnalytics() {
  try {
    inject()
  } catch { /* 埋点失败不影响任何功能 */ }
}

/** 每设备只上报一次的漏斗事件 */
export function trackOnce(event: string) {
  try {
    const key = `tavern-evt-${event}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    track(event)
  } catch { /* ignore */ }
}
