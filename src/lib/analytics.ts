/**
 * 漏斗埋点——只记 4 个匿名事件：访问 / 导入成功 / 首条消息 / 第二轮对话。
 * 不含任何聊天内容、Key、角色卡数据；隐私声明在落地页明示。
 *
 * 双通道：
 * - Vercel Analytics：pageview（Hobby 档仅支持 pageview）
 * - PostHog（免费档支持自定义事件）：纯 fetch 直连 capture API，不引 SDK；
 *   key 走 VITE_POSTHOG_KEY 环境变量，未配置时静默降级为无操作
 */
import { inject } from '@vercel/analytics'

const PH_KEY: string | undefined = import.meta.env.VITE_POSTHOG_KEY
const PH_HOST: string = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

// 匿名设备 id（随机生成，只用于漏斗去重，不关联任何身份）
function distinctId(): string {
  const KEY = 'tavern-did'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(KEY, id)
  }
  return id
}

function phCapture(event: string) {
  if (!PH_KEY) return
  fetch(`${PH_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: PH_KEY,
      event,
      distinct_id: distinctId(),
      properties: { $current_url: location.origin }, // 只报域名，不报具体路径参数
    }),
  }).catch(() => { /* 埋点失败不影响任何功能 */ })
}

export function initAnalytics() {
  try {
    inject()
    phCapture('$pageview') // 漏斗事件①：访问
  } catch { /* ignore */ }
}

/** 每设备只上报一次的漏斗事件 */
export function trackOnce(event: string) {
  try {
    const key = `tavern-evt-${event}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    phCapture(event)
  } catch { /* ignore */ }
}
