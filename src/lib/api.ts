/**
 * BYOK OpenAI-compatible 流式客户端（精简版）。
 * 无 daemon / 无 LAN token——纯前端直连用户自己的端点。
 * 已内置 thinking 抑制：请求参数 + 流式 <think> 标签剥离双保险。
 */
import { ThinkTagFilter } from './think-filter'

export interface EndpointConfig {
  baseUrl: string
  apiKey: string
  model: string
  temperature?: number // 默认 0.8
  maxTokens?: number   // 默认 2048——角色扮演常需长回复
  tier?: 'phone' | 'balanced' | 'high' // 设备档位，留空则自动检测
}

// ── 本地模型卡片（WebLLM 格式，借 fati MobileModelCatalog 思路） ──
// 每档一张卡片：用户点「下载并启用」即拉取该模型（浏览器 OPFS 缓存，离线可用）。
// model_id 必须是 WebLLM prebuiltAppConfig 里真实存在的 MLC ID，否则 404。
export interface WebLLMModelCard {
  id: string          // WebLLM model_id
  name: string        // 展示名
  desc: string        // 一句话说明
  tier: 'phone' | 'balanced' | 'high'
  sizeGB: number      // 下载体积（GB，估算）
  recommended?: boolean
}

export const WEBLLM_MODELS: WebLLMModelCard[] = [
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 1.5B',
    desc: '稳定可靠，手机/电脑均可流畅运行，角色扮演首选',
    tier: 'phone',
    sizeGB: 0.9,
    recommended: true,
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 0.5B',
    desc: '最轻量，极低内存设备可用，基础对话',
    tier: 'phone',
    sizeGB: 0.4,
  },
  {
    id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 7B',
    desc: '效果最好，但更慢更占内存，适合高性能设备',
    tier: 'high',
    sizeGB: 4.5,
  },
]

// 各档推荐默认模型
export const TIER_DEFAULT_MODEL: Record<string, string> = {
  phone: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  balanced: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  high: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
}

// 编辑推荐（下拉顶部标签）
export const EDIT_RECOMMENDED = [
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-7B-Instruct-q4f16_1-MLC',
]

export const PRESETS: { label: string; baseUrl: string; hint: string }[] = [
  // 免 Key 本地档：baseUrl 为特殊标记，store 分流到 WebLLM 浏览器本地推理
  { label: 'WebLLM', baseUrl: 'webllm', hint: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', hint: 'deepseek-chat' },
  { label: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1', hint: 'moonshot-v1-8k' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', hint: 'gpt-4o-mini' },
  { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', hint: 'loaded-model' },
  { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', hint: 'qwen3:8b' },
  { label: '自定义', baseUrl: '', hint: '' },
]

/**
 * 流式 POST /chat/completions。
 * 逐 chunk 回调 onChunk，支持 AbortSignal 取消。
 */
export async function streamChat(
  endpoint: EndpointConfig,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
  onChunk: (delta: string) => void,
): Promise<void> {
  const url = `${endpoint.baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (endpoint.apiKey && endpoint.apiKey !== 'not-needed') {
    headers['Authorization'] = `Bearer ${endpoint.apiKey}`
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: endpoint.model,
      messages,
      stream: true,
      temperature: endpoint.temperature ?? 0.8,
      max_tokens: endpoint.maxTokens ?? 2048,
      // 抑制推理过程输出（Qwen3 / DeepSeek 等支持此参数的模型）
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  if (!res.body) throw new Error('响应体为空')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const filter = new ThinkTagFilter()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') {
        const tail = filter.flush()
        if (tail) onChunk(tail)
        return
      }
      try {
        const json = JSON.parse(data)
        if (json.error) throw new Error(json.error.message || '模型返回错误')
        // 忽略 reasoning_content（部分模型单独字段输出推理）
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          const clean = filter.push(delta)
          if (clean) onChunk(clean)
        }
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e
      }
    }
  }
  // 流正常结束（无 [DONE]）时 flush 残余
  const tail = filter.flush()
  if (tail) onChunk(tail)
}

/** 获取可用模型列表 */
export async function fetchModels(endpoint: EndpointConfig): Promise<string[]> {
  const url = `${endpoint.baseUrl.replace(/\/$/, '')}/models`
  const headers: Record<string, string> = {}
  if (endpoint.apiKey && endpoint.apiKey !== 'not-needed') {
    headers['Authorization'] = `Bearer ${endpoint.apiKey}`
  }
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const list = Array.isArray(data?.data) ? data.data : []
  return list.filter((m: any) => m?.id).map((m: any) => String(m.id))
}

/**
 * 发送一条真实测试消息（非流式），验证 /chat/completions 全链路。
 * /models 通了不代表聊天接口能用——这才是产品信任的验证点。
 */
export async function testChat(endpoint: EndpointConfig): Promise<string> {
  const url = `${endpoint.baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (endpoint.apiKey && endpoint.apiKey !== 'not-needed') {
    headers['Authorization'] = `Bearer ${endpoint.apiKey}`
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: endpoint.model,
      messages: [{ role: 'user', content: 'Hi' }],
      stream: false,
      max_tokens: 8,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || '模型返回错误')
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new Error('响应格式异常')
  return text
}
