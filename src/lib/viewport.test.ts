import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeVvHeight, isStandaloneApp } from '../App'

describe('computeVvHeight 视口高度收缩计算', () => {
  it('键盘未弹起（整屏高）时不设 --vv-height，返回 null', () => {
    expect(computeVvHeight(844, 844)).toBeNull()
  })

  it('iOS standalone 底部安全区微小偏差（差值 < 100px）返回 null，防止底部漏黑条', () => {
    expect(computeVvHeight(760, 844)).toBeNull()
    expect(computeVvHeight(745, 844)).toBeNull()
  })

  it('键盘明显弹起（差值 >= 100px）时返回四舍五入后的像素高度', () => {
    expect(computeVvHeight(500, 844)).toBe(500)
    expect(computeVvHeight(450.4, 844)).toBe(450)
    expect(computeVvHeight(450.6, 844)).toBe(451)
  })
})

describe('isStandaloneApp 独立应用环境探测', () => {
  const originalWindow = globalThis.window
  const originalNavStandalone = (globalThis.navigator as unknown as { standalone?: boolean })?.standalone

  beforeEach(() => {
    // @ts-expect-error mock window
    globalThis.window = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    }
    try {
      Object.defineProperty(globalThis.navigator, 'standalone', {
        value: false,
        configurable: true,
        writable: true,
      })
    } catch { /* ignore */ }
  })

  afterEach(() => {
    globalThis.window = originalWindow
    try {
      Object.defineProperty(globalThis.navigator, 'standalone', {
        value: originalNavStandalone,
        configurable: true,
        writable: true,
      })
    } catch { /* ignore */ }
  })

  it('普通浏览器返回 false', () => {
    expect(isStandaloneApp()).toBe(false)
  })

  it('display-mode: standalone 媒体查询命中时返回 true', () => {
    // @ts-expect-error mock matchMedia
    globalThis.window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    expect(isStandaloneApp()).toBe(true)
  })

  it('iOS Safari navigator.standalone 为 true 时返回 true', () => {
    Object.defineProperty(globalThis.navigator, 'standalone', {
      value: true,
      configurable: true,
    })
    expect(isStandaloneApp()).toBe(true)
  })

  it('Capacitor iOS 原生壳注入 window.Capacitor 时返回 true', () => {
    // @ts-expect-error mock Capacitor
    globalThis.window.Capacitor = { isNativePlatform: () => true }
    expect(isStandaloneApp()).toBe(true)
  })
})
