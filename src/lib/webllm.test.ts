import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  modelBlocked,
  WEBLLM_BASE,
  WEBLLM_MODEL,
  WEBLLM_MODEL_MOBILE,
  webllmSupported,
  isIOS,
  isMobile,
} from './webllm'

function setNavigator(nav: any) {
  vi.stubGlobal('navigator', nav)
}
afterEach(() => vi.unstubAllGlobals())

// 模型内存等级：0.5B=1, 1.5B=2, 1.7B=3, 4B=4, 7B=5, 8B=6
describe('modelBlocked 设备分档拦截', () => {
  it('iOS 仅放行 0.5B（防白屏崩溃）', () => {
    setNavigator({ userAgent: 'iPhone', hardwareConcurrency: 6, deviceMemory: 4 })
    expect(modelBlocked('Qwen2.5-0.5B-Instruct-q4f16_1-MLC').blocked).toBe(false)
    // Qwen3-0.6B 与 0.5B 同档试点开放（真机长对话烧机验证中）
    expect(modelBlocked('Qwen3-0.6B-q4f16_1-MLC').blocked).toBe(false)
    const r = modelBlocked('Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
    expect(r.blocked).toBe(true)
    expect(r.reason).toMatch(/iOS/)
    expect(r.reason).toMatch(/0\.5B/)
  })

  it('Android ≤4GB 放行到 1.5B', () => {
    setNavigator({ userAgent: 'Android', hardwareConcurrency: 8, deviceMemory: 4 })
    expect(modelBlocked('Qwen2.5-1.5B-Instruct-q4f16_1-MLC').blocked).toBe(false)
    expect(modelBlocked('Qwen3-1.7B-q4f16_1-MLC').blocked).toBe(true)
  })

  it('Android 6-8GB 放行到 1.7B', () => {
    setNavigator({ userAgent: 'Android', hardwareConcurrency: 8, deviceMemory: 8 })
    expect(modelBlocked('Qwen3-1.7B-q4f16_1-MLC').blocked).toBe(false)
    expect(modelBlocked('Qwen3-4B-q4f16_1-MLC').blocked).toBe(true)
  })

  it('Android ≥12GB 放行到 4B', () => {
    setNavigator({ userAgent: 'Android', hardwareConcurrency: 8, deviceMemory: 12 })
    expect(modelBlocked('Qwen3-4B-q4f16_1-MLC').blocked).toBe(false)
    expect(modelBlocked('Qwen2.5-7B-Instruct-q4f16_1-MLC').blocked).toBe(true)
  })

  it('桌面端全部开放', () => {
    setNavigator({ userAgent: 'Mozilla/5.0 (Macintosh)', hardwareConcurrency: 16, deviceMemory: 16 })
    for (const id of [
      'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
      'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
      'Qwen3-1.7B-q4f16_1-MLC',
      'Qwen3-4B-q4f16_1-MLC',
      'Qwen2.5-7B-Instruct-q4f16_1-MLC',
      'Qwen3-8B-q4f16_1-MLC',
    ]) {
      expect(modelBlocked(id).blocked).toBe(false)
    }
  })

  it('未知模型不拦截（向前兼容）', () => {
    setNavigator({ userAgent: 'Mozilla/5.0 (Macintosh)', hardwareConcurrency: 16, deviceMemory: 16 })
    expect(modelBlocked('some-unknown-model-id').blocked).toBe(false)
  })
})

describe('WebLLM 常量', () => {
  it('baseUrl 标记与默认模型', () => {
    expect(WEBLLM_BASE).toBe('webllm')
    expect(WEBLLM_MODEL).toBe('Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
    expect(WEBLLM_MODEL_MOBILE).toBe('Qwen2.5-0.5B-Instruct-q4f16_1-MLC')
  })
})

describe('M7-1 支持性探测', () => {
  it('webllmSupported 取决于 navigator.gpu', () => {
    setNavigator({ gpu: {} })
    expect(webllmSupported()).toBe(true)
    setNavigator({})
    expect(webllmSupported()).toBe(false)
  })
  it('isIOS 识别', () => {
    setNavigator({ userAgent: 'iPhone' })
    expect(isIOS()).toBe(true)
    setNavigator({ userAgent: 'Android' })
    expect(isIOS()).toBe(false)
  })
  it('isMobile 识别（桌面大内存为 false，低配为 true）', () => {
    setNavigator({ userAgent: 'Android' })
    expect(isMobile()).toBe(true)
    setNavigator({ userAgent: 'Mozilla/5.0 (Macintosh)', hardwareConcurrency: 16, deviceMemory: 16 })
    expect(isMobile()).toBe(false)
    setNavigator({ userAgent: 'Mozilla/5.0', hardwareConcurrency: 2, deviceMemory: 2 })
    expect(isMobile()).toBe(true)
  })
})
