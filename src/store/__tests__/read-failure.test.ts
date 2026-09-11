// TV-05 回归（2026-09-11，批量导入计数契约 + 读路径 dbGet* 同族补强）
//
// 漏洞成因（TV-04 遗留①②）：
// ① importCard 写库失败已在 store 层接住不再抛 → App.tsx 批量导入按 try/catch 计数
//    会把失败卡计进成功数（toast 虚高）。修复：importCard 返回 boolean，按返回值计数。
// ② dbGet* 三处裸 await（init / openCharacter / bindLorebook 内置分支迁移前读）：
//    读失败即 unhandled rejection——init 白屏、点角色无反应、绑定流程中断。
// 修复：读失败降级继续（init 仅内置）、保持视图（openCharacter）、完成绑定（bindLorebook）。
//
// 本测试钉住：返回值契约 + 三处读保护 + 各自成功路径不被误伤（防过度保护）。
// 变异验证方式：把 store.ts 对应 catch / 返回值去掉 → 目标用例恰好变红。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/db')
  return {
    ...actual,
    dbGetCharacters: vi.fn(),
    dbGetConversations: vi.fn(),
    // init 会 void 触发 lore/story slice 的 init——置空避免碰真实 IndexedDB
    dbGetLorebooks: vi.fn(async () => []),
    dbGetStories: vi.fn(async () => []),
    dbPutConversation: vi.fn(),
    dbPutCharacter: vi.fn(),
    dbDeleteConversation: vi.fn(),
    dbDeleteCharacter: vi.fn(),
  }
})

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/api')
  return { ...actual, streamChat: vi.fn() }
})

// node 测试环境无 location：init 首步的分享链接解析 mock 为「无分享卡」
vi.mock('../../lib/share', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/share')
  return { ...actual, readSharedCard: vi.fn(async () => null) }
})

import {
  dbGetCharacters, dbGetConversations, dbPutCharacter, dbPutConversation,
  dbGetLorebooks, dbGetStories,
} from '../../lib/db'
import { BUILTIN_CHARACTERS } from '../../lib/catalog'
import { t } from '../../lib/i18n'
import { useStore } from '../../store'
import { useLoreStore } from '../slices/lore'
import { useStoryStore } from '../slices/story'

interface MockLike {
  mockReset: () => void
  mockClear: () => void
  mockRejectedValueOnce: (e: unknown) => void
  mockResolvedValueOnce: (v: unknown) => void
}

const mockGetChars = dbGetCharacters as unknown as MockLike
const mockGetConvs = dbGetConversations as unknown as MockLike
const mockPutChar = dbPutCharacter as unknown as MockLike
const mockPutConv = dbPutConversation as unknown as MockLike

// TavernCard 最小合法形态
const CARD = {
  name: 'T', description: '', personality: '', scenario: '', first_mes: '',
  mes_example: '', system_prompt: '', creator_notes: '', creator: '', tags: [],
}

const errOf = (key: string) => t(useStore.getState().lang, key)

describe('importCard 返回值契约（TV-05 遗留①）', () => {
  beforeEach(() => {
    mockGetChars.mockReset()
    mockGetConvs.mockReset()
    mockPutChar.mockReset()
    mockPutConv.mockReset()
    useStore.setState({ error: null })
  })

  it('importCard 成功 → 返回 true 且角色进列表', async () => {
    mockPutChar.mockResolvedValueOnce(undefined)
    useStore.setState({ characters: [] as never, error: null })

    const ok = await useStore.getState().importCard(CARD as never)

    expect(ok).toBe(true)
    expect(useStore.getState().characters.length).toBe(1)
    expect(useStore.getState().error).toBeNull()
  })

  it('importCard 写库失败 → 返回 false 且角色不进列表（契约：按此计数）', async () => {
    mockPutChar.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({ characters: [] as never, error: null })

    const ok = await useStore.getState().importCard(CARD as never)

    // 修复前（TV-04）：失败路径隐式 return undefined，App.tsx 无法区分成败
    expect(ok).toBe(false)
    expect(useStore.getState().characters.length).toBe(0)
    expect(useStore.getState().error).toBe(errOf('chat.characterSaveFailed'))
  })
})

describe('init 读失败降级（TV-05 遗留②）', () => {
  beforeEach(() => {
    mockGetChars.mockReset()
    mockGetConvs.mockReset()
    mockPutChar.mockReset()
    mockPutConv.mockReset()
    useStore.setState({ error: null })
  })

  it('init 角色库读取失败 → 仅内置角色继续启动 + error 置位（不白屏）', async () => {
    mockGetChars.mockRejectedValueOnce(new Error('openDB failed'))
    useStore.setState({ characters: [] as never, error: null })

    await useStore.getState().init()

    const chars = useStore.getState().characters
    expect(useStore.getState().error).toBe(errOf('chat.loadFailed'))
    // 不含 user 项：全部为内置，数量恰为内置目录数
    expect(chars.every((c) => c.builtin)).toBe(true)
    expect(chars.length).toBe(BUILTIN_CHARACTERS.length)
  })

  it('init 读取成功 → 用户角色在前、内置在后且无 error（防过度保护）', async () => {
    mockGetChars.mockResolvedValueOnce([{ id: 'u1', card: CARD, createdAt: 1 }])
    useStore.setState({ characters: [] as never, error: null })

    await useStore.getState().init()

    const chars = useStore.getState().characters
    expect(useStore.getState().error).toBeNull()
    expect(chars[0].id).toBe('u1')
    expect(chars.length).toBe(1 + BUILTIN_CHARACTERS.length)
  })
})

describe('openCharacter 读失败不切视图（TV-05 遗留②）', () => {
  beforeEach(() => {
    mockGetChars.mockReset()
    mockGetConvs.mockReset()
    mockPutChar.mockReset()
    mockPutConv.mockReset()
    useStore.setState({ error: null })
  })

  it('会话读取失败 → error 置位且 view / activeCharId 不变（不抛到事件边界）', async () => {
    mockGetConvs.mockRejectedValueOnce(new Error('openDB failed'))
    useStore.setState({
      view: 'gallery',
      activeCharId: null,
      conversations: [] as never,
      error: null,
    })

    await useStore.getState().openCharacter('ch1')

    expect(useStore.getState().error).toBe(errOf('chat.convLoadFailed'))
    expect(useStore.getState().view).toBe('gallery')
    expect(useStore.getState().activeCharId).toBeNull()
    // 读失败不触发写路径兜底（early return 跳过 newConversation）：无新会话产生
    expect(useStore.getState().conversations.length).toBe(0)
  })

  it('会话读取成功 → 照常切 chat 并选中最近会话（防过度保护）', async () => {
    mockGetConvs.mockResolvedValueOnce([
      { id: 'c1', characterId: 'ch1', title: '', messages: [], createdAt: 0, updatedAt: 0 },
    ])
    useStore.setState({ view: 'gallery', activeCharId: null, error: null })

    await useStore.getState().openCharacter('ch1')

    expect(useStore.getState().view).toBe('chat')
    expect(useStore.getState().activeCharId).toBe('ch1')
    expect(useStore.getState().activeConvId).toBe('c1')
    expect(useStore.getState().error).toBeNull()
  })
})

describe('bindLorebookToCharacter 内置分支：迁移前读失败仍完成绑定（TV-05 遗留②）', () => {
  beforeEach(() => {
    mockGetChars.mockReset()
    mockGetConvs.mockReset()
    mockPutChar.mockReset()
    mockPutConv.mockReset()
    useStore.setState({ error: null })
  })

  it('迁移前读取失败 → error 置位且副本已建成（+1，不回滚）', async () => {
    mockPutChar.mockResolvedValueOnce(undefined)
    mockGetConvs.mockRejectedValueOnce(new Error('openDB failed'))
    useStore.setState({
      activeCharId: null,
      characters: [{ id: 'builtin-x', builtin: true, card: CARD, createdAt: 0 }] as never,
      error: null,
    })

    await useStore.getState().bindLorebookToCharacter('builtin-x', 'lb1')

    // 语义：副本本体已落库可用；历史会话迁移跳过，可重新绑定获得
    expect(useStore.getState().error).toBe(errOf('chat.migrateSaveFailed'))
    expect(useStore.getState().characters.length).toBe(2)
  })

  it('迁移前读取成功 → 无 error 且副本建成（防过度保护）', async () => {
    mockPutChar.mockResolvedValueOnce(undefined)
    mockGetConvs.mockResolvedValueOnce([])
    useStore.setState({
      activeCharId: null,
      characters: [{ id: 'builtin-x', builtin: true, card: CARD, createdAt: 0 }] as never,
      error: null,
    })

    await useStore.getState().bindLorebookToCharacter('builtin-x', 'lb1')

    expect(useStore.getState().error).toBeNull()
    expect(useStore.getState().characters.length).toBe(2)
  })
})

describe('slice 读路径降级（TV-05 总管自修：initLore / initStories）', () => {
  const mockGetBooks = dbGetLorebooks as unknown as MockLike
  const mockGetStoryList = dbGetStories as unknown as MockLike

  beforeEach(() => {
    mockGetBooks.mockReset()
    mockGetStoryList.mockReset()
  })

  it('initLore 读取失败 → 不抛出且仅内置样本世界书（降级可用）', async () => {
    mockGetBooks.mockRejectedValueOnce(new Error('QuotaExceededError'))
    await expect(useLoreStore.getState().initLore()).resolves.toBeUndefined()
    expect(useLoreStore.getState().lorebooks.length).toBeGreaterThan(0)
    expect(useLoreStore.getState().lorebooks.every((l) => l.builtin)).toBe(true)
  })

  it('initLore 读取成功 → 用户书在前、内置在后（防过度保护）', async () => {
    mockGetBooks.mockResolvedValueOnce([{ id: 'u1', book: { name: 'U' }, imported: 1 }] as never)
    await useLoreStore.getState().initLore()
    expect(useLoreStore.getState().lorebooks[0].id).toBe('u1')
  })

  it('initStories 读取失败 → 不抛出且列表为空（断点续玩失效但不崩溃）', async () => {
    useStoryStore.setState({ stories: [{ id: 's0' }] as never })
    mockGetStoryList.mockRejectedValueOnce(new Error('QuotaExceededError'))
    await expect(useStoryStore.getState().initStories()).resolves.toBeUndefined()
    expect(useStoryStore.getState().stories).toEqual([])
  })
})
