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
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 0.5B',
    desc: '最轻量，极低内存设备可用，基础对话',
    tier: 'phone',
    sizeGB: 0.4,
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 1.5B',
    desc: '稳定可靠，手机/电脑均可流畅运行，角色扮演首选',
    tier: 'phone',
    sizeGB: 0.9,
    recommended: true,
  },
  {
    id: 'Qwen3-1.7B-q4f16_1-MLC',
    name: 'Qwen3 1.7B',
    desc: '新一代轻量档，响应快、质量高，需 6GB+ 内存',
    tier: 'balanced',
    sizeGB: 1.1,
    recommended: true,
  },
  {
    id: 'Qwen3-4B-q4f16_1-MLC',
    name: 'Qwen3 4B',
    desc: '质量与速度均衡，普通电脑/高端手机推荐',
    tier: 'balanced',
    sizeGB: 2.6,
    recommended: true,
  },
  {
    id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 7B',
    desc: '效果最好，但更慢更占内存，适合高性能设备',
    tier: 'high',
    sizeGB: 4.5,
  },
  {
    id: 'Qwen3-8B-q4f16_1-MLC',
    name: 'Qwen3 8B',
    desc: '旗舰体验，需要大内存高性能设备',
    tier: 'high',
    sizeGB: 5.0,
  },
]

// 各档推荐默认模型
export const TIER_DEFAULT_MODEL: Record<string, string> = {
  phone: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  balanced: 'Qwen3-1.7B-q4f16_1-MLC',
  high: 'Qwen3-8B-q4f16_1-MLC',
}

// 编辑推荐（下拉顶部标签）
export const EDIT_RECOMMENDED = [
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Qwen3-1.7B-q4f16_1-MLC',
  'Qwen3-4B-q4f16_1-MLC',
  'Qwen3-8B-q4f16_1-MLC',
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

// ── L-6/L-8/L-9 安全加固 ─────────────────────────────────
/** L-6：baseUrl 校验——仅 http/https，拒绝 URL 内嵌凭据与非法协议（file:// 等） */
export function validateBaseUrl(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '仅支持 http/https 端点'
    if (u.username || u.password) return '端点地址不得内嵌账号密码'
    return null
  } catch {
    return '端点地址格式无效'
  }
}

/** L-9：错误文本脱敏——部分提供商/代理会在错误体回显 Authorization 头，防截屏外泄 key */
export function sanitizeErrorText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer ***')
    .replace(/\bsk-[A-Za-z0-9_\-]{8,}/g, 'sk-***')
}

// L-8：请求超时常量
const REQUEST_TIMEOUT_MS = 120_000   // 整体兑底
const STREAM_IDLE_TIMEOUT_MS = 60_000 // 流式阶段：最后一个 chunk 后 60s 无数据
const MAX_SSE_BUFFER = 1_000_000     // L-7：SSE 未切行 buffer 上限（正常单事件远小于此）

/** 组合用户 signal 与整体超时 */
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

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
  // L-6：协议/凭据校验
  const invalid = validateBaseUrl(endpoint.baseUrl)
  if (invalid) throw new Error(invalid)
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
    // L-8：整体超时兑底（半开连接不再永久挂起）
    signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // L-9：错误体脱敏后再抛出
    throw new Error(`HTTP ${res.status}: ${sanitizeErrorText(text.slice(0, 200))}`)
  }
  if (!res.body) throw new Error('响应体为空')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const filter = new ThinkTagFilter()
  let buffer = ''

  // L-8：流式 idle 超时辅助——60s 无新 chunk 视为端点挂死
  const idleRead = (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    let timer: ReturnType<typeof setTimeout>
    return Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('流式读取超时（60s 无新数据）')), STREAM_IDLE_TIMEOUT_MS)
      }),
    ]).finally(() => clearTimeout(timer!)) as Promise<ReadableStreamReadResult<Uint8Array>>
  }

  while (true) {
    const { done, value } = await idleRead()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // L-7：buffer 上界——无换行长流不再无限吃内存
    if (buffer.length > MAX_SSE_BUFFER) throw new Error('响应格式异常（单事件过大）')
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
        if (json.error) throw new Error(sanitizeErrorText(String(json.error.message || '模型返回错误')))
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
export async function fetchModels(endpoint: EndpointConfig, signal?: AbortSignal): Promise<string[]> {
  const invalid = validateBaseUrl(endpoint.baseUrl)
  if (invalid) throw new Error(invalid)
  const url = `${endpoint.baseUrl.replace(/\/$/, '')}/models`
  const headers: Record<string, string> = {}
  if (endpoint.apiKey && endpoint.apiKey !== 'not-needed') {
    headers['Authorization'] = `Bearer ${endpoint.apiKey}`
  }
  // L-8：补超时与可取消 signal
  const res = await fetch(url, { headers, signal: withTimeout(signal, REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const list = Array.isArray(data?.data) ? data.data : []
  return list.filter((m: any) => m?.id).map((m: any) => String(m.id))
}

/**
 * 发送一条真实测试消息（非流式），验证 /chat/completions 全链路。
 * /models 通了不代表聊天接口能用——这才是产品信任的验证点。
 */
export async function testChat(endpoint: EndpointConfig, signal?: AbortSignal): Promise<string> {
  const invalid = validateBaseUrl(endpoint.baseUrl)
  if (invalid) throw new Error(invalid)
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
      // 256：思考型模型（如 Ollama 上的 qwen3:8b）思考段常 >8 token，
      // 原 max_tokens:8 会把额度全烧在思考上致 content 读空（M13-1/M9-3 根因之一）
      max_tokens: 256,
      // 抑制推理输出（与 streamChat 同款双保险）：vLLM/Qwen-native 服务器生效；
      // Ollama OpenAI-compat 层忽略此键（其原生 /api/chat 用 think:false），属无害兜底
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false },
    }),
    // L-8：补超时与可取消 signal
    signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // L-9：错误体脱敏
    throw new Error(`HTTP ${res.status}: ${sanitizeErrorText(text.slice(0, 200))}`)
  }
  const data = await res.json()
  if (data.error) throw new Error(sanitizeErrorText(String(data.error.message || '模型返回错误')))
  const raw = data.choices?.[0]?.message?.content
  if (typeof raw !== 'string') throw new Error('响应格式异常')
  // 兜底剥离可能残留的 <think> 块（与流式路径同款过滤器，批量喂入）
  const filter = new ThinkTagFilter()
  const reply = (filter.push(raw) + filter.flush()).trim()
  // P1-4：剥离后仍空串（极端全-think 场景）视为失败，不让 UI 误报「测试成功」
  if (!reply) throw new Error('模型返回空内容（可能为思考型模型消耗了全部 token）')
  return reply
}
