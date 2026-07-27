import { describe, it, expect } from 'vitest'
import { ThinkTagFilter } from './think-filter'

describe('ThinkTagFilter', () => {
  it('正常文本原样输出', () => {
    const f = new ThinkTagFilter()
    expect(f.push('你好，世界！')).toBe('你好，世界！')
    expect(f.flush()).toBe('')
  })

  it('完整 <think>...</think> 块被剥离', () => {
    const f = new ThinkTagFilter()
    const out = f.push('你好<think>这是推理</think>世界')
    expect(out).toBe('你好世界')
  })

  it('跨 chunk 的 <think> 标签', () => {
    const f = new ThinkTagFilter()
    expect(f.push('A<thi')).toBe('A')
    expect(f.push('nk>推理中')).toBe('')
    expect(f.push('</thi')).toBe('')
    expect(f.push('nk>B')).toBe('B')
    expect(f.flush()).toBe('')
  })

  it('只有 think 块，输出为空', () => {
    const f = new ThinkTagFilter()
    expect(f.push('<think>全部是推理</think>')).toBe('')
  })

  it('未闭合的 think 块——流结束时丢弃', () => {
    const f = new ThinkTagFilter()
    expect(f.push('前文<think>推理中...')).toBe('前文')
    expect(f.flush()).toBe('') // thinking 状态，pending 丢弃
  })

  it('正常文本含 < 但不是 think 标签', () => {
    const f = new ThinkTagFilter()
    expect(f.push('a < b && c > d')).toBe('a < b && c > d')
  })

  it('flush 输出 normal 状态残余缓冲', () => {
    const f = new ThinkTagFilter()
    // '<th' 是 '<think>' 的前缀，会被缓冲
    expect(f.push('结尾<th')).toBe('结尾')
    expect(f.flush()).toBe('<th') // 流结束，不是完整标签，输出
  })

  it('多个 think 块', () => {
    const f = new ThinkTagFilter()
    const out = f.push('<think>A</think>可见<think>B</think>尾部')
    expect(out).toBe('可见尾部')
  })

  it('reset 后可复用', () => {
    const f = new ThinkTagFilter()
    f.push('<think>半截')
    f.reset()
    expect(f.push('干净文本')).toBe('干净文本')
  })
})
