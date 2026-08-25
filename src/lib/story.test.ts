// story.ts Director-lite 引擎回归测试
import { describe, it, expect } from 'vitest'
import { buildStoryPrompt, parseSceneOutput } from './story'

describe('buildStoryPrompt', () => {
  const base = {
    title: '迷雾港',
    premise: '一座常年被雾笼罩的港口城市。',
    scenes: [],
    lang: 'zh' as const,
    plainMode: false,
  }

  it('第一幕 user prompt 引导开场', () => {
    const { system, user } = buildStoryPrompt(base)
    expect(system).toContain('迷雾港')
    expect(system).toContain('港口城市')
    expect(system).toContain('JSON') // 非 plain 模式要求 JSON 输出
    expect(user).toContain('第一幕')
  })

  it('plainMode 不要求 JSON 输出', () => {
    const { system } = buildStoryPrompt({ ...base, plainMode: true })
    expect(system).not.toContain('choices')
  })

  it('续幕带上最近场景与玩家输入', () => {
    const { user } = buildStoryPrompt({
      ...base,
      scenes: [
        { id: '1', text: '你走进酒馆。', choices: [], createdAt: 1 },
      ],
      userInput: '点一杯麦酒',
    })
    expect(user).toContain('你走进酒馆')
    expect(user).toContain('点一杯麦酒')
  })

  it('最多只带最近 3 幕进 prompt', () => {
    const scenes = Array.from({ length: 6 }, (_, i) => ({
      id: String(i), text: `场景${i}`, choices: [], createdAt: i,
    }))
    const { user } = buildStoryPrompt({ ...base, scenes })
    expect(user).not.toContain('场景0')
    expect(user).not.toContain('场景2')
    expect(user).toContain('场景3')
    expect(user).toContain('场景5')
  })

  it('英文模式输出英文脚手架', () => {
    const { system } = buildStoryPrompt({ ...base, lang: 'en' })
    expect(system).toContain('World setting')
    expect(system).toContain('JSON')
  })
})

describe('parseSceneOutput 三级降级链', () => {
  it('合法 JSON → sceneText + choices', () => {
    const r = parseSceneOutput('{"sceneText":"夜色降临。","choices":["向左","向右"]}')
    expect(r.text).toBe('夜色降临。')
    expect(r.choices).toEqual(['向左', '向右'])
  })

  it('markdown 代码块包裹的 JSON', () => {
    const r = parseSceneOutput('```json\n{"sceneText":"你好","choices":["a"]}\n```')
    expect(r.text).toBe('你好')
    expect(r.choices).toEqual(['a'])
  })

  it('JSON 前后有解说文字 → 截取花括号区间', () => {
    const r = parseSceneOutput('好的，这是结果：{"sceneText":"正文","choices":["x"]} 希望满意！')
    expect(r.text).toBe('正文')
  })

  it('正文包含嵌套花括号时仍能提取完整 JSON', () => {
    const r = parseSceneOutput('开场 {"sceneText":"你看到 {发光的门}。","choices":["推门","后退"]} 结束')
    expect(r.text).toBe('你看到 {发光的门}。')
    expect(r.choices).toEqual(['推门', '后退'])
  })

  it('字符串内未闭合花括号不会截断 JSON', () => {
    const r = parseSceneOutput('{"sceneText":"她低声说：{\\"别动\\"}","choices":["停下"]}')
    expect(r.text).toBe('她低声说：{"别动"}')
    expect(r.choices).toEqual(['停下'])
  })

  it('未闭合 JSON 回退为纯文本', () => {
    const raw = '{"sceneText":"未闭合剧情","choices":["a"'
    const r = parseSceneOutput(raw)
    expect(r.text).toBe(raw)
    expect(r.choices).toEqual([])
  })

  it('纯文本 → 整段当正文、无选项', () => {
    const r = parseSceneOutput('你推开了那扇门，门后一片漆黑。')
    expect(r.text).toBe('你推开了那扇门，门后一片漆黑。')
    expect(r.choices).toEqual([])
  })

  it('空输出 → 空正文（UI 层会报错提示）', () => {
    expect(parseSceneOutput('   ').text).toBe('')
  })

  it('choices 超过 4 个时截断，非字符串项强转', () => {
    const r = parseSceneOutput('{"sceneText":"s","choices":["1","2","3","4","5",6]}')
    expect(r.choices).toHaveLength(4)
  })
})
