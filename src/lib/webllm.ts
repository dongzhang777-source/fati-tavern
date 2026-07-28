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
/** 演示档模型：中英双语、稳定可靠的本地推理档位 */
export const WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
/** 移动端默认模型：iOS 用 0.5B（唯一安全档），其他移动端用 1.5B */
export const WEBLLM_MODEL_MOBILE = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'

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
 * iOS 上所有浏览器均使用 WebKit 引擎（苹果强制），
 * 单标签页内存上限约 1.5–2GB，超出后 GPU 进程被杀（闪退）。
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/**
 * 设备内存分档模型限制策略：
 * - iOS（任何浏览器）: 只开放 ≤1.5B（WebKit 单页内存硬限制）
 * - Android ≤4GB: 同 iOS
 * - Android 6-8GB: 开放到 1.7B
 * - Android ≥12GB: 开放到 4B
 * - 桌面端: 全部开放
 */

/** 模型内存等级（数字越大越吃内存） */
const MODEL_MEM_RANK: Record<string, number> = {
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': 1,
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': 2,
  'Qwen3-1.7B-q4f16_1-MLC': 3,
  'Qwen3-4B-q4f16_1-MLC': 4,
  'Qwen2.5-7B-Instruct-q4f16_1-MLC': 5,
  'Qwen3-8B-q4f16_1-MLC': 6,
}

/** 各平台允许的最大内存等级 */
function maxAllowedRank(): number {
  // iOS Safari 单页内存硬限制约 1.5GB，
  // 1.5B 模型加载能过但推理时 KV-cache 增长会突破上限→白屏，
  // 故 iOS 只安全开放 0.5B
  if (isIOS()) return 1
  if (isMobile()) {
    const mem = (navigator as any).deviceMemory || 4
    if (mem <= 4) return 2   // ≤4GB: ≤1.5B
    if (mem <= 8) return 3   // 6-8GB: ≤1.7B
    return 4                  // ≥12GB: ≤4B
  }
  return Infinity // 桌面端全部开放
}

export function modelBlocked(modelId: string): { blocked: boolean; reason?: string } {
  const rank = MODEL_MEM_RANK[modelId]
  // 未知模型不拦截（向前兼容）
  if (rank === undefined) return { blocked: false }
  const maxRank = maxAllowedRank()
  if (rank <= maxRank) return { blocked: false }

  // 生成友好提示
  if (isIOS()) {
    return { blocked: true, reason: 'iOS 内存受限，该模型会导致白屏崩溃，请用 0.5B' }
  }
  return { blocked: true, reason: '该设备内存不足，运行此模型可能闪退' }
}

/** @deprecated 兼容旧引用，内部已统一为 modelBlocked */
export const iosModelBlocked = modelBlocked

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
