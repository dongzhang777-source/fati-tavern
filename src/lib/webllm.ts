/**
 * 免 Key 体验档——WebLLM 浏览器本地推理（v2 拍板的演示档）。
 * 懒加载：只有用户选中"免 Key 体验"预设并发送消息时才动态 import（约几百 KB）
 * 并下载模型（约 900MB，浏览器缓存后二次免下载）。
 * 需要 WebGPU；不支持时给出明确提示。
 */
import type { EndpointConfig } from './api'

/** 特殊 baseUrl 标记，store 据此分流到 WebLLM 而非 fetch */
export const WEBLLM_BASE = 'webllm'
/** 演示档模型：中英双语、900MB 级，是"能跑的最小可用角色扮演"档位 */
export const WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

export function webllmSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

// 模型下载/编译进度回调（由 store 注册，用于 UI 展示）
let progressHandler: ((text: string, done: boolean) => void) | null = null
export function setWebllmProgressHandler(fn: ((text: string, done: boolean) => void) | null) {
  progressHandler = fn
}

let enginePromise: Promise<any> | null = null

async function getEngine(): Promise<any> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
      const engine = await CreateMLCEngine(WEBLLM_MODEL, {
        initProgressCallback: (p: { text: string; progress: number }) => {
          progressHandler?.(p.text, p.progress >= 1)
        },
      })
      progressHandler?.('', true)
      return engine
    })()
    // 初始化失败允许重试
    enginePromise.catch(() => { enginePromise = null })
  }
  return enginePromise
}

/** 与 api.ts streamChat 同签名，store 可无缝切换 */
export async function streamWebLLM(
  endpoint: EndpointConfig,
  messages: { role: string; content: string }[],
  signal: AbortSignal,
  onChunk: (delta: string) => void,
): Promise<void> {
  if (!webllmSupported()) {
    throw new Error('WEBGPU_UNSUPPORTED')
  }
  const engine = await getEngine()
  const chunks = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: endpoint.temperature ?? 0.8,
    max_tokens: endpoint.maxTokens ?? 1024, // 端侧推理保守些
  })
  for await (const chunk of chunks) {
    if (signal.aborted) {
      engine.interruptGenerate()
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) onChunk(delta)
  }
}
