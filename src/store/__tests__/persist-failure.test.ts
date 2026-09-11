// TV 交付修复回归（2026-09-11，全库审查 P1-1/P1-2 + TV-04 同族补强）
//
// 漏洞成因：`store.ts` 里 `dbPutXxx(...)` / `dbDeleteXxx(...)` **会 reject**
// （`lib/db.ts` 的 openDB/tx reject），fire-and-forget 或 await 不接 →
// unhandled rejection，表现为「界面已变更、磁盘未落、刷新后回退/消失且无任何提示」。
//
// 本测试钉住修复：**写库/删库失败时必须给出用户可见的错误**（不是静默）。
// 变异验证方式：把 store.ts 里对应的 catch / 守卫去掉 → 本测试应变红。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/db')
  return {
    ...actual,
    dbPutConversation: vi.fn(),
    dbPutCharacter: vi.fn(),
    dbDeleteConversation: vi.fn(),
    dbDeleteCharacter: vi.fn(),
    dbGetConversations: vi.fn(),
  }
})

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/api')
  return { ...actual, streamChat: vi.fn() }
})

import {
  dbPutConversation, dbPutCharacter,
  dbDeleteConversation, dbDeleteCharacter, dbGetConversations,
} from '../../lib/db'
import { streamChat } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useStore } from '../../store'

interface MockLike {
  mockReset: () => void
  mockClear: () => void
  mockRejectedValueOnce: (e: unknown) => void
  mockResolvedValueOnce: (v: unknown) => void
}

const mockPutConv = dbPutConversation as unknown as MockLike
const mockPutChar = dbPutCharacter as unknown as MockLike
const mockDelConv = dbDeleteConversation as unknown as MockLike
const mockDelChar = dbDeleteCharacter as unknown as MockLike
const mockGetConvs = dbGetConversations as unknown as MockLike
const mockStream = streamChat as unknown as MockLike

// TavernCard 最小合法形态（sendMessage 会跑 cardToSystemPrompt 等纯字符串逻辑）
const CARD = {
  name: 'T', description: '', personality: '', scenario: '', first_mes: '',
  mes_example: '', system_prompt: '', creator_notes: '', creator: '', tags: [],
}

// 聊天主路径所需的最小 store 状态
function setupChat() {
  useStore.setState({
    activeCharId: 'ch1',
    activeConvId: 'c1',
    characters: [{ id: 'ch1', card: CARD, createdAt: 1 }] as never,
    conversations: [
      { id: 'c1', characterId: 'ch1', title: '', messages: [], createdAt: 0, updatedAt: 0 },
    ] as never,
    endpoint: { baseUrl: 'https://example.com/v1', apiKey: 'k', model: 'm' },
    streaming: false,
    error: null,
  })
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))
const errOf = (key: string) => t(useStore.getState().lang, key)

describe('落库失败必须可见（P1-1/P1-2）', () => {
  beforeEach(() => {
    mockPutConv.mockReset()
    mockPutChar.mockReset()
    mockDelConv.mockReset()
    mockDelChar.mockReset()
    mockGetConvs.mockReset()
    mockStream.mockReset()
    mockStream.mockResolvedValue(undefined)
    useStore.setState({ error: null, streaming: false })
  })

  it('renameConversation 落库失败 → 设置 error，不再静默回退', async () => {
    mockPutConv.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({
      conversations: [
        { id: 'c1', characterId: 'ch1', title: '旧标题', messages: [], updatedAt: 0 },
      ] as never,
    })

    useStore.getState().renameConversation('c1', '新标题')
    await flush()

    // 修复前：error 为 null（静默）；修复后：必须有可见提示
    expect(useStore.getState().error).toBe(errOf('chat.renameSaveFailed'))
  })

  it('sendMessage 成功收尾落库失败 → 设置 error（P1-1 回归）', async () => {
    mockPutConv.mockRejectedValueOnce(new Error('QuotaExceededError'))
    setupChat()

    useStore.getState().sendMessage('你好')
    await flush()

    expect(useStore.getState().error).toBe(errOf('chat.saveFailed'))
  })

  it('sendMessage 失败收尾（流式报错后）落库失败 → 设置 error 而非流式错误信息（P1-1 回归）', async () => {
    mockStream.mockRejectedValueOnce(Object.assign(new Error('boom'), { name: 'ApiError' }))
    mockPutConv.mockRejectedValueOnce(new Error('QuotaExceededError'))
    setupChat()

    useStore.getState().sendMessage('你好')
    await flush()

    // 若落库 catch 缺失，error 会停留在流式错误的 'boom'——精确断言区分两条路径
    expect(useStore.getState().error).toBe(errOf('chat.saveFailed'))
  })

  it('clearChat 落库失败 → 设置 error（TV-04）', async () => {
    mockPutConv.mockRejectedValueOnce(new Error('QuotaExceededError'))
    setupChat()

    useStore.getState().clearChat()
    await flush()

    expect(useStore.getState().error).toBe(errOf('chat.clearSaveFailed'))
  })

  it('newConversation 落库失败 → 设置 error 且新会话不进列表（TV-04）', async () => {
    mockPutConv.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({
      activeCharId: 'ch1',
      characters: [{ id: 'ch1', card: CARD, createdAt: 1 }] as never,
      conversations: [] as never,
      error: null,
    })

    await useStore.getState().newConversation()

    expect(useStore.getState().error).toBe(errOf('chat.newConvSaveFailed'))
    expect(useStore.getState().conversations.length).toBe(0)
  })

  it('importCard 落库失败 → 设置 error 且角色不进列表（TV-04）', async () => {
    mockPutChar.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({ characters: [] as never, error: null })

    await useStore.getState().importCard(CARD as never)

    expect(useStore.getState().error).toBe(errOf('chat.characterSaveFailed'))
    expect(useStore.getState().characters.length).toBe(0)
  })

  it('updateCharacter（用户角色）落库失败 → 设置 error 且内存不更新（TV-04）', async () => {
    mockPutChar.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({
      characters: [{ id: 'ch1', card: CARD, createdAt: 1 }] as never,
      error: null,
    })

    const r = await useStore.getState().updateCharacter('ch1', { ...CARD, name: 'X' } as never)

    expect(r).toBeUndefined()
    expect(useStore.getState().error).toBe(errOf('chat.characterSaveFailed'))
    expect(useStore.getState().characters[0].card.name).toBe('T')
  })

  it('updateCharacter（内置角色副本）落库失败 → 设置 error 且无副本产生（TV-04）', async () => {
    mockPutChar.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({
      characters: [{ id: 'builtin-x', builtin: true, card: CARD, createdAt: 0 }] as never,
      error: null,
    })

    const r = await useStore.getState().updateCharacter('builtin-x', { ...CARD, name: 'X' } as never)

    expect(r).toBeUndefined()
    expect(useStore.getState().error).toBe(errOf('chat.characterSaveFailed'))
    expect(useStore.getState().characters.length).toBe(1)
  })

  it('removeCharacter 落库失败 → 设置 error 且角色不被移除（TV-04）', async () => {
    mockDelChar.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({
      characters: [{ id: 'ch1', card: CARD, createdAt: 1 }] as never,
      error: null,
    })

    await useStore.getState().removeCharacter('ch1')

    expect(useStore.getState().error).toBe(errOf('chat.characterDeleteFailed'))
    expect(useStore.getState().characters.length).toBe(1)
  })

  it('deleteConversation 落库失败 → 设置 error 且会话不被移除（TV-04）', async () => {
    mockDelConv.mockRejectedValueOnce(new Error('QuotaExceededError'))
    setupChat()

    await useStore.getState().deleteConversation('c1')

    expect(useStore.getState().error).toBe(errOf('chat.convDeleteFailed'))
    expect(useStore.getState().conversations.length).toBe(1)
  })

  it('bindLorebookToCharacter（内置角色）副本落库失败 → 设置 error 且无副本产生（TV-04）', async () => {
    mockPutChar.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({
      characters: [{ id: 'builtin-x', builtin: true, card: CARD, createdAt: 0 }] as never,
      error: null,
    })

    await useStore.getState().bindLorebookToCharacter('builtin-x', 'lb1')

    expect(useStore.getState().error).toBe(errOf('chat.characterSaveFailed'))
    expect(useStore.getState().characters.length).toBe(1)
  })

  it('bindLorebookToCharacter（用户角色）绑定落库失败 → 设置 error 且内存不更新（TV-04）', async () => {
    mockPutChar.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({
      characters: [{ id: 'ch1', card: CARD, createdAt: 1 }] as never,
      error: null,
    })

    await useStore.getState().bindLorebookToCharacter('ch1', 'lb1')

    expect(useStore.getState().error).toBe(errOf('chat.characterSaveFailed'))
    expect(useStore.getState().characters[0].boundLorebookId).toBeUndefined()
  })

  it('bindLorebookToCharacter（内置角色）迁移中断 → 设置 error 且副本本体仍建成可用（TV-04）', async () => {
    mockGetConvs.mockResolvedValueOnce([
      { id: 'c1', characterId: 'builtin-x', title: '', messages: [], createdAt: 0, updatedAt: 0 },
    ])
    mockPutChar.mockResolvedValueOnce(undefined)
    mockPutConv.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({
      activeCharId: 'builtin-x',
      characters: [{ id: 'builtin-x', builtin: true, card: CARD, createdAt: 0 }] as never,
      error: null,
    })

    await useStore.getState().bindLorebookToCharacter('builtin-x', 'lb1')

    expect(useStore.getState().error).toBe(errOf('chat.migrateSaveFailed'))
    // 语义：首败中断迁移只提示一次，但副本本体已建成——不回滚
    expect(useStore.getState().characters.length).toBe(2)
  })

  it('streaming 中 sendMessage 重入 → 不追加消息、不触发发送（TV-04 守卫）', async () => {
    setupChat()
    useStore.setState({ streaming: true })
    mockStream.mockClear()

    useStore.getState().sendMessage('第二次')
    await flush()

    const streamFn = streamChat as unknown as { mock: { calls: unknown[] } }
    expect(streamFn.mock.calls.length).toBe(0)
    expect(useStore.getState().conversations[0].messages.length).toBe(0)
    expect(useStore.getState().streaming).toBe(true)
  })
})
