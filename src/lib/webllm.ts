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
/** 演示档模型：中英双语、900MB 级，是“能跑的最小可用角色扮演”档位 */
export const WEBLLM_MODEL = 'Qwen3-1.7B-q4f16_1-MLC'
/** 移动端默认模型：内存受限设备使用更小档位避免 OOM 闪退 */
export const WEBLLM_MODEL_MOBILE = 'Qwen3-0.6B-q4f16_1-MLC'

export function webllmSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

/**
 * 是否为移动设备（小屏 / 低内存 / 低核心）。
 * 用于决定默认模型档位和推理参数保守程度。
 */
export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as any).deviceMemory || 4
  const smallScreen = typeof window !== 'undefined' && window.innerWidth <= 768
  return isIOS() || /Android|Mobile/i.test(navigator.userAgent) || (cores <= 4 && mem <= 4) || smallScreen
}

/**
 * 是否 iOS 设备（iPhone / iPad / iPod）。
 * 真机验证：1.7B 跑得稳，但 4B / 8B 在 iOS Safari 的
 * WebGPU 标签页内存上限下会 OOM 整页闪退（GPU 进程崩溃，JS 捕获不到）。
 * 故 iOS 上仅开放 0.6B / 1.7B 两档。
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** iOS 上允许运行的模型 id（内存受限，只放开最小两档） */
const IOS_ALLOWED = new Set(['Qwen3-0.6B-q4f16_1-MLC', 'Qwen3-1.7B-q4f16_1-MLC'])
/** 移动端通用允许档位（低内存 Android 同样受限） */
const MOBILE_ALLOWED = new Set(['Qwen3-0.6B-q4f16_1-MLC', 'Qwen3-1.7B-q4f16_1-MLC'])

export function iosModelBlocked(modelId: string): { blocked: boolean; reason?: string } {
  // iOS 严格限制
  if (isIOS()) {
    if (IOS_ALLOWED.has(modelId)) return { blocked: false }
    return { blocked: true, reason: 'iOS 设备内存有限，建议改用 1.7B 及以下档位' }
  }
  // 其他移动端（低内存 Android）也拦截大模型
  if (isMobile()) {
    const mem = (navigator as any).deviceMemory || 4
    if (mem <= 4 && !MOBILE_ALLOWED.has(modelId)) {
      return { blocked: true, reason: '设备内存不足，建议使用 1.7B 及以下档位避免闪退' }
    }
  }
  return { blocked: false }
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

/** 动态 import 重试（移动端网络不稳时 chunk 下载容易失败） */
async function importWithRetry<T>(loader: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: any
  for (let i = 0; i < retries; i++) {
    try {
      return await loader()
    } catch (e: any) {
      lastErr = e
      // “importing a module script failed” / TypeError 都是 chunk 加载失败，可重试
      const msg = String(e?.message || e)
      const retryable = /import|module|script|fetch|network|Failed to load/i.test(msg)
      if (!retryable || i === retries - 1) throw e
      // 指数退避：1s, 2s
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
    }
  }
  throw lastErr
}

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
    const { CreateMLCEngine } = await importWithRetry(() => import('@mlc-ai/web-llm'))
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
  // 移动端保守参数，降低推理时内存峰值避免 OOM 闪退
  const mobile = isMobile()
  const chunks = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: endpoint.temperature ?? 0.8,
    max_tokens: endpoint.maxTokens ?? (mobile ? 512 : 1024),
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
