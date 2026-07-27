// safety.ts 自伤关键词识别测试
import { describe, it, expect } from 'vitest'
import { detectSelfHarm } from './safety'

describe('detectSelfHarm', () => {
  it('识别中文自伤/自杀意念表述', () => {
    expect(detectSelfHarm('我真的不想活了')).toBe(true)
    expect(detectSelfHarm('有时候想自杀')).toBe(true)
    expect(detectSelfHarm('感觉活着没意思')).toBe(true)
  })

  it('识别英文表述', () => {
    expect(detectSelfHarm('I want to kill myself')).toBe(true)
    expect(detectSelfHarm('thinking about suicide')).toBe(true)
    expect(detectSelfHarm('I want to end my life')).toBe(true)
  })

  it('普通对话不误报', () => {
    expect(detectSelfHarm('今天天气不错，我们去冒险吧')).toBe(false)
    expect(detectSelfHarm('这个boss好难打，我死了三次')).toBe(false)
    expect(detectSelfHarm('The dragon killed my character')).toBe(false)
  })
})
