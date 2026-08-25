import { describe, it, expect } from 'vitest'
import { charWidth, textWidth, clampShotContent, pickShotMessages, wrapShotText, shotFilename } from './screenshot'

describe('charWidth / textWidth', () => {
  it('半角=1，CJK 全角=2', () => {
    expect(charWidth('a'.codePointAt(0)!)).toBe(1)
    expect(charWidth('猫'.codePointAt(0)!)).toBe(2)
    expect(charWidth('한'.codePointAt(0)!)).toBe(2)
    expect(textWidth('猫a')).toBe(3)
  })
})

describe('clampShotContent', () => {
  it('不超限原样返回', () => {
    expect(clampShotContent('你好', 10)).toBe('你好')
  })
  it('超限截断并加省略号，不在代理对中间断开', () => {
    const long = '喵'.repeat(200)
    const out = clampShotContent(long, 20)
    expect(textWidth(out)).toBeLessThanOrEqual(20)
    expect(out.endsWith('……')).toBe(true)
  })
})

describe('pickShotMessages', () => {
  const msgs = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '旅人你好呀' },
    { role: 'user', content: '   ' }, // 空白消息过滤
    { role: 'assistant', content: '想来点什么？' },
  ]
  it('过滤 system 与空白消息，保留顺序', () => {
    const out = pickShotMessages(msgs)
    expect(out.map(m => m.role)).toEqual(['user', 'assistant', 'assistant'])
  })
  it('只取最后 N 条', () => {
    const out = pickShotMessages(msgs, 2)
    expect(out).toHaveLength(2)
    expect(out[0].content).toBe('旅人你好呀')
  })
  it('空会话返回空数组', () => {
    expect(pickShotMessages([])).toEqual([])
  })
})

describe('wrapShotText', () => {
  it('按宽度单位换行（每汉字 2 单位）', () => {
    expect(wrapShotText('你好世界', 4)).toEqual(['你好', '世界'])
  })
  it('保留原始换行符', () => {
    expect(wrapShotText('ab\ncd', 10)).toEqual(['ab', 'cd'])
  })
  it('空文本返回单空行', () => {
    expect(wrapShotText('', 10)).toEqual([''])
  })
})

describe('shotFilename', () => {
  it('清洗非法字符并加扩展名', () => {
    expect(shotFilename('小猫/露娜 ✨')).toBe('fatitavern-小猫_露娜__.png')
  })
  it('空名称回退 chat', () => {
    expect(shotFilename('')).toBe('fatitavern-chat.png')
  })
})
