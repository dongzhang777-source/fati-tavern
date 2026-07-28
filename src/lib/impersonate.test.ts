// 嘴替核心库测试：双模板、角色边界、JSON 容错、collectChat 累积/abort
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildSuggestionsPrompt, buildSingleSuggestionPrompt, buildRefinePrompt,
  parseSuggestions, collectChat, type ImpersonateContext,
} from './impersonate'
import type { TavernCard } from './tavern'
import * as api from './api'
import * as webllm from './webllm'

function makeCard(over: Partial<TavernCard> = {}): TavernCard {
  return {
    name: 'Alice', description: 'a curious wanderer', personality: 'kind',
    scenario: 'a tavern at dusk', first_mes: '', mes_example: '', system_prompt: '',
    creator_notes: '', creator: '', tags: [], ...over,
  }
}

function ctx(over: Partial<ImpersonateContext> = {}): ImpersonateContext {
  return {
    card: makeCard(),
    persona: { name: '旅人', description: '一名年轻冒险者' },
    recent: [
      { role: 'assistant', content: '欢迎来到酒馆，陌生人。' },
      { role: 'user', content: '你好。' },
    ],
    expansion: 0.3,
    lang: 'zh',
    ...over,
  }
}

// ─── 双模板：语言隔离 ──────────────────────────────────────

describe('prompt 双模板', () => {
  it('zh 模板不含英文指令、en 模板不含中文指令', () => {
    const zh = buildSuggestionsPrompt(ctx({ lang: 'zh' }))
    // en 用例改用英文内容，确保断言检验的是模板本身而非注入的用户内容
    const en = buildSuggestionsPrompt(ctx({
      lang: 'en',
      persona: { name: 'Traveler', description: 'a young adventurer' },
      recent: [
        { role: 'assistant', content: 'Welcome to the tavern, stranger.' },
        { role: 'user', content: 'Hello.' },
      ],
    }))
    const zhText = zh.map((m) => m.content).join('\n')
    const enText = en.map((m) => m.content).join('\n')
    expect(zhText).toContain('以旅人的身份')
    expect(zhText).not.toMatch(/Only write what/)
    expect(enText).toContain("what the user says next")
    expect(enText).not.toMatch(/[\u4e00-\u9fff]/) // 英文模板不含任何中文字符
  })
})

// ─── 角色边界红线 ──────────────────────────────────────────

describe('角色边界', () => {
  it('system prompt 明确以用户身份代笔、禁止替角色发言', () => {
    const zh = buildSuggestionsPrompt(ctx({ lang: 'zh' }))[0].content
    expect(zh).toContain('代笔')
    expect(zh).toContain('不要替Alice发言')
    // 不得出现聊天 system prompt 的「你就是角色本人」式措辞
    expect(zh).not.toContain('你就是Alice')
    expect(zh).not.toMatch(/你不是AI助手/)

    const en = buildSuggestionsPrompt(ctx({ lang: 'en' }))[0].content
    expect(en).toContain('ghostwriter')
    expect(en).toContain('Never speak as Alice')
    expect(en).not.toContain('you ARE Alice')
  })

  it('单条建议与润色 prompt 同样带边界 system', () => {
    expect(buildSingleSuggestionPrompt(ctx())[0].content).toContain('代笔')
    expect(buildRefinePrompt(ctx(), '我有点担心你')[0].content).toContain('代笔')
  })

  it('润色 prompt 带入用户草稿', () => {
    const p = buildRefinePrompt(ctx(), '我有点担心你')
    expect(p[1].content).toContain('我有点担心你')
  })

  it('三条路径均带防重复指令（实际反馈：建议不断复述双方台词）', () => {
    expect(buildSuggestionsPrompt(ctx())[1].content).toContain('不要重复')
    expect(buildSingleSuggestionPrompt(ctx())[1].content).toContain('不要重复')
    expect(buildRefinePrompt(ctx(), '嗯')[1].content).toContain('不要重复')
    expect(buildSuggestionsPrompt(ctx({ lang: 'en' }))[1].content).toContain('never repeat')
    expect(buildSingleSuggestionPrompt(ctx({ lang: 'en' }))[1].content).toContain('Never repeat')
    expect(buildRefinePrompt(ctx({ lang: 'en' }), 'hmm')[1].content).toContain('Do not repeat')
  })
})

// ─── 拓展度措辞 ────────────────────────────────────────────

describe('拓展度', () => {
  it('低/高拓展度给出不同指令', () => {
    const low = buildSuggestionsPrompt(ctx({ expansion: 0.1 }))[1].content
    const high = buildSuggestionsPrompt(ctx({ expansion: 0.9 }))[1].content
    expect(low).toContain('稳妥')
    expect(high).toContain('大胆')
  })
})

// ─── JSON 容错 ─────────────────────────────────────────────

describe('parseSuggestions', () => {
  it('标准 JSON 提取 options', () => {
    expect(parseSuggestions('{"options":["a","b","c"]}')).toEqual(['a', 'b', 'c'])
  })

  it('带 markdown 代码围栏', () => {
    expect(parseSuggestions('```json\n{"options":["x","y"]}\n```')).toEqual(['x', 'y'])
  })

  it('前后有杂散文字时截取首个 JSON 对象', () => {
    expect(parseSuggestions('好的：\n{"options":["嗯"]}\n希望有帮助')).toEqual(['嗯'])
  })

  it('最多返回 3 条', () => {
    expect(parseSuggestions('{"options":["1","2","3","4"]}')).toHaveLength(3)
  })

  it('畸形输出回退为整段单条建议', () => {
    expect(parseSuggestions('我觉得你应该直接告诉他真相。')).toEqual(['我觉得你应该直接告诉他真相。'])
  })

  it('空字符串返回空数组', () => {
    expect(parseSuggestions('   ')).toEqual([])
  })

  it('options 全为空白时回退单条', () => {
    expect(parseSuggestions('{"options":["  ",""]}')).toEqual(['{"options":["  ",""]}'])
  })
})

// ─── collectChat 累积与 abort ──────────────────────────────

describe('collectChat', () => {
  afterEach(() => vi.restoreAllMocks())

  it('BYOK 档累积 streamChat 的 chunk 为完整文本', async () => {
    vi.spyOn(api, 'streamChat').mockImplementation(async (_e, _m, _s, onChunk) => {
      onChunk('你好')
      onChunk('，旅人')
    })
    const ep = { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'k', model: 'deepseek-chat' }
    const out = await collectChat(ep, [{ role: 'user', content: 'x' }], new AbortController().signal)
    expect(out).toBe('你好，旅人')
  })

  it('WebLLM 档走 streamWebLLM', async () => {
    const spy = vi.spyOn(webllm, 'streamWebLLM').mockImplementation(async (_e, _m, _s, onChunk) => {
      onChunk('local reply')
    })
    const ep = { baseUrl: 'webllm', apiKey: 'not-needed', model: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' }
    const out = await collectChat(ep, [{ role: 'user', content: 'x' }], new AbortController().signal)
    expect(out).toBe('local reply')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('底层抛 AbortError 时向上传播', async () => {
    vi.spyOn(api, 'streamChat').mockImplementation(async () => {
      const err = new Error('aborted'); err.name = 'AbortError'; throw err
    })
    const ep = { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'k', model: 'deepseek-chat' }
    const ac = new AbortController()
    await expect(collectChat(ep, [{ role: 'user', content: 'x' }], ac.signal)).rejects.toThrow('aborted')
  })
})
