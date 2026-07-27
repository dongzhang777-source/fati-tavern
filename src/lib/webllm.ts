/**
 * 免 Key 体验档——WebLLM 浏览器本地推理（v2 拍板的演示档）。
 * 懒加载：只有用户选中"免 Key 体验"预设并发送消息时才动态 import（约几百 KB）
 * 并下载模型（约 900MB，浏览器缓存后二次免下载）。
 * 需要 WebGPU；不支持时给出明确提示。
 */
import type { EndpointConfig } from './api'
import { ThinkTagFilter } from './think-filter'

/** 特殊 baseUrl 标记，store 据此分流到 WebLLM 而非 fetch */
export const WEBLLM_BASE = 'webllm'
/** 演示档模型：中英双语、900MB 级，是"能跑的最小可用角色扮演"档位 */
export const WEBLLM_MODEL = 'Qwen3-1.7B-q4f16_1-MLC'

export function webllmSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

// 模型下载/编译进度回调（由 store 注册，用于 UI 展示）
export interface WebLLMProgress {
  text: string
  done: boolean
}
let progressHandler: ((p: WebLLMProgress) => void) | null = null
export function setWebllmProgressHandler(fn: ((p: WebLLMProgress) => void) | null) {
  progressHandler = fn
}

let enginePromise: Promise<any> | null = null
let engineModelId: string | null = null

/**
 * 加载（首次会下载）指定 WebLLM 模型。
 * 借 fati MobileEngine.download 的进度语义：pct 0-100 + 阶段文字。
 * 下载缓存在浏览器 OPFS，二次免下载。
 * @param modelId WebLLM prebuiltAppConfig 里的 model_id
 * @param onProgress 进度回调（pct 0-100，text 阶段说明）
 */
export async function loadWebLLMModel(
  modelId: string,
  onProgress?: (pct: number, text: string) => void,
): Promise<any> {
  if (!webllmSupported()) throw new Error('WEBGPU_UNSUPPORTED')
  // 同一模型已加载则直接复用
  if (enginePromise && engineModelId === modelId) return enginePromise

  engineModelId = modelId
  enginePromise = (async () => {
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
    const engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (p: { text: string; progress: number }) => {
        const pct = Math.round((p.progress ?? 0) * 100)
        onProgress?.(pct, p.text || '')
        progressHandler?.({ text: p.text || '', done: p.progress >= 1 })
      },
    })
    progressHandler?.({ text: '', done: true })
    return engine
  })()
  // 初始化失败允许重试
  enginePromise.catch(() => { enginePromise = null; engineModelId = null })
  return enginePromise
}

export function loadedWebLLMModel(): string | null {
  return engineModelId
}

/** 与 api.ts streamChat 同签名，store 可无缝切换 */
export async function streamWebLLM(
  endpoint: EndpointConfig,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
  onChunk: (delta: string) => void,
): Promise<void> {
  const engine = await loadWebLLMModel(endpoint.model || WEBLLM_MODEL)
  const chunks = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: endpoint.temperature ?? 0.8,
    max_tokens: endpoint.maxTokens ?? 1024, // 端侧推理保守些
  })
  const filter = new ThinkTagFilter()
  for await (const chunk of chunks) {
    if (signal.aborted) {
      engine.interruptGenerate()
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) {
      const clean = filter.push(delta)
      if (clean) onChunk(clean)
    }
  }
  const tail = filter.flush()
  if (tail) onChunk(tail)
}
