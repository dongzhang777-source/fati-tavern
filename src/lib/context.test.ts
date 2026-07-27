// context.ts 上下文窗口管理测试
import { describe, it, expect } from 'vitest'
import { trimMessages, DEFAULT_CHAR_BUDGET } from './context'
import type { ChatMessage } from '../store'

function msg(role: 'user' | 'assistant', content: string): ChatMessage {
  return { role, content }
}

describe('trimMessages', () => {
  it('预算内不截断', () => {
    const msgs = [msg('assistant', '开场白'), msg('user', '你好'), msg('assistant', '嗨')]
    expect(trimMessages(msgs)).toEqual(msgs)
  })

  it('超预算时保头保尾截中段', () => {
    const head = msg('assistant', '开场白'.repeat(10))
    const middle = Array.from({ length: 50 }, (_, i) => msg('user', `中段消息${i}`.repeat(100)))
    const last = msg('user', '最新消息')
    const result = trimMessages([head, ...middle, last], 2000)
    expect(result[0]).toBe(head)                          // 保头
    expect(result[result.length - 1]).toBe(last)          // 保尾
    expect(result.length).toBeLessThan(52)                // 截了中段
    const total = result.reduce((n, m) => n + m.content.length, 0)
    expect(total).toBeLessThanOrEqual(2000 + last.content.length) // 预算约束
  })

  it('极端情况：单条超预算也至少保住最新一条', () => {
    const head = msg('assistant', '开场白')
    const huge = msg('user', 'x'.repeat(50000))
    const result = trimMessages([head, msg('user', '旧'), huge], 100)
    expect(result[result.length - 1]).toBe(huge)
  })

  it('默认预算为 DEFAULT_CHAR_BUDGET', () => {
    const msgs = [msg('assistant', 'a'.repeat(DEFAULT_CHAR_BUDGET - 10)), msg('user', 'b')]
    expect(trimMessages(msgs)).toEqual(msgs) // 刚好在预算内 + 消息数 ≤2 不截
  })
})
