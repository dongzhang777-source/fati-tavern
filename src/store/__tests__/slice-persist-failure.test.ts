// TV-06 回归（2026-09-11，slice 层写/删库失败可见化）
//
// 漏洞成因：TV-04 的写/删保护只覆盖主 store；slices/lore.ts（importLorebook:70 /
// removeLorebook:76）与 slices/story.ts（openStory:94 / restartStory:193 /
// removeStoriesForLorebook:212）共 5 处写/删点仍是裸 await——IndexedDB 写入失败
// （配额耗尽/隐私模式/iOS Safari 驱逐存储/事务冲突）时 unhandled rejection 且用户
// 零反馈：「世界书看起来导进来了/删掉了」，刷新后并非如此。
//
// 本测试钉住 TV-06 修复：
//   ① 失败不再抛（importLorebook→null / removeLorebook→false / story 路径置 storyError）
//   ② 内存与库一致（TV-04 纪律）：写失败不进内存列表；删失败不移出内存列表、
//      不清 activeLorebookId / activeStory
//   ③ 批量删首败中断剩余、只提示一次、按实际删除成功与否过滤内存
//   ④ 反向用例：成功路径不误伤（防过度保护）+ 本批 i18n 五键四语齐全
//
// 变异验证方式：把 slice 里对应 try/catch 改回裸 await（或去掉 break）→ 目标用例恰好变红。
// mock 的是 IndexedDB 驱动层（lib/db），不是被测的 slice action 本身。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/db')
  return {
    ...actual,
    dbPutLorebook: vi.fn(),
    dbDeleteLorebook: vi.fn(),
    dbPutStory: vi.fn(),
    dbDeleteStory: vi.fn(),
  }
})

// advanceStory 用例需要：mock 流式驱动（BYOK 路径走 api.streamChat）
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/api')
  return { ...actual, streamChat: vi.fn() }
})

import {
  dbPutLorebook, dbDeleteLorebook, dbPutStory, dbDeleteStory,
  type StoredLorebook, type StoredStory, type StoryScene,
} from '../../lib/db'
import { streamChat } from '../../lib/api'
import type { TavernBook } from '../../lib/tavern'
import type { EndpointConfig } from '../../lib/api'
import { t, type Lang } from '../../lib/i18n'
import { useLoreStore } from '../slices/lore'
import { useStoryStore } from '../slices/story'

interface MockLike {
  mockReset: () => void
  mockClear: () => void
  mockRejectedValueOnce: (e: unknown) => void
  mockResolvedValueOnce: (v: unknown) => void
  mockImplementation: (fn: (...args: never[]) => unknown) => void
}

const mockPutBook = dbPutLorebook as unknown as MockLike
const mockDelBook = dbDeleteLorebook as unknown as MockLike
const mockPutStoryFn = dbPutStory as unknown as MockLike
const mockDelStory = dbDeleteStory as unknown as MockLike
const mockStream = streamChat as unknown as MockLike

const callsOf = (fn: unknown) => (fn as { mock: { calls: unknown[] } }).mock.calls

// TavernBook 最小合法形态（importLorebook 不做校验，直接落库）
const BOOK: TavernBook = { name: 'Test Book', entries: [] }
// StoredLorebook 夹具（列表内已存在的书）
const LB: StoredLorebook = { id: 'lb1', book: BOOK, source: 'test.json', imported: 1 }

function makeStory(id: string, lorebookId = 'lb1', scenes: StoryScene[] = []): StoredStory {
  return { id, lorebookId, title: 'T', premise: 'P', scenes, createdAt: 1, updatedAt: 1 }
}

const ENDPOINT = { baseUrl: 'https://example.com/v1', apiKey: 'k', model: 'm' } as EndpointConfig

// 本批新增的 6 个文案 key——四语缺一即 t() 回退返回 key 本身，断言变红
const NEW_KEYS = [
  'lore.saveFailed', 'lore.deleteFailed',
  'story.saveFailed', 'story.deleteFailed', 'story.batchDeleteFailed',
  'story.sceneSaveFailed',
] as const
const LANGS: Lang[] = ['zh', 'en', 'ja', 'ko']

describe('lore slice 写/删失败可见化（TV-06）', () => {
  beforeEach(() => {
    mockPutBook.mockReset()
    mockDelBook.mockReset()
    useLoreStore.setState({ lorebooks: [], activeLorebookId: null, loreError: null })
  })

  it('importLorebook 写库失败 → 返回 null、不进内存列表、loreError 置位', async () => {
    mockPutBook.mockRejectedValueOnce(new Error('QuotaExceededError'))

    const r = await useLoreStore.getState().importLorebook(BOOK, 'a.json')

    // 修复前：裸 await 抛出（调用方 App.tsx 靠异常兜底）；修复后：返回 null 走计数失败分支
    expect(r).toBeNull()
    expect(useLoreStore.getState().lorebooks).toHaveLength(0)
    expect(useLoreStore.getState().loreError).toBe('lore.saveFailed')
  })

  it('removeLorebook 删库失败 → 返回 false、书仍在内存列表、激活态不被清（内存与库一致）', async () => {
    mockDelBook.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useLoreStore.setState({ lorebooks: [LB], activeLorebookId: 'lb1', loreError: null })

    const ok = await useLoreStore.getState().removeLorebook('lb1')

    // 修复前：裸 await 抛出；修复后：返回 false 且不部分清 state
    //（dbDeleteLorebook 内部级联删除衍生剧情，删失败绝不能把内存清掉）
    expect(ok).toBe(false)
    expect(useLoreStore.getState().lorebooks.some((l) => l.id === 'lb1')).toBe(true)
    expect(useLoreStore.getState().activeLorebookId).toBe('lb1')
    expect(useLoreStore.getState().loreError).toBe('lore.deleteFailed')
  })

  it('importLorebook 成功 → 返回 stored 且进列表、无 loreError（防过度保护）', async () => {
    mockPutBook.mockResolvedValueOnce(undefined)

    const r = await useLoreStore.getState().importLorebook(BOOK, 'a.json')

    expect(r).not.toBeNull()
    expect(r!.book.name).toBe('Test Book')
    expect(useLoreStore.getState().lorebooks).toHaveLength(1)
    expect(useLoreStore.getState().loreError).toBeNull()
  })

  it('removeLorebook 成功 → 返回 true 且移出列表、激活态清空（原有行为不变）', async () => {
    mockDelBook.mockResolvedValueOnce(undefined)
    useLoreStore.setState({ lorebooks: [LB], activeLorebookId: 'lb1', loreError: null })

    const ok = await useLoreStore.getState().removeLorebook('lb1')

    expect(ok).toBe(true)
    expect(useLoreStore.getState().lorebooks).toHaveLength(0)
    expect(useLoreStore.getState().activeLorebookId).toBeNull()
    expect(useLoreStore.getState().loreError).toBeNull()
  })

  it('clearLoreError 清除横幅（关闭按钮契约）', () => {
    useLoreStore.setState({ loreError: 'lore.saveFailed' })
    useLoreStore.getState().clearLoreError()
    expect(useLoreStore.getState().loreError).toBeNull()
  })
})

describe('story slice 写/删失败可见化（TV-06）', () => {
  beforeEach(() => {
    mockPutStoryFn.mockReset()
    mockDelStory.mockReset()
    mockStream.mockReset()
    useStoryStore.setState({ stories: [], activeStory: null, storyError: null, sceneStreaming: false, plainMode: true })
  })

  it('openStory 创建剧情写库失败 → storyError 置位、activeStory 未被设为新对象', async () => {
    mockPutStoryFn.mockRejectedValueOnce(new Error('QuotaExceededError'))

    await useStoryStore.getState().openStory(LB, ENDPOINT, 'zh')

    // 修复前：裸 await 抛出（LorebookPanel 的 fire-and-forget 链变 unhandled rejection）；
    // 修复后：置 storyError，且不把 story 塞进内存、不设 activeStory
    expect(useStoryStore.getState().activeStory).toBeNull()
    expect(useStoryStore.getState().stories).toHaveLength(0)
    expect(useStoryStore.getState().storyError).toBe(t('zh', 'story.saveFailed'))
  })

  it('restartStory 删库失败 → storyError 置位、activeStory 未被清空（原进度保留）', async () => {
    const scene: StoryScene = { id: 'sc1', text: '第一幕', choices: [], createdAt: 1 }
    const s1 = makeStory('s1', 'lb1', [scene])
    mockDelStory.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStoryStore.setState({ stories: [s1], activeStory: s1, storyError: null })

    await useStoryStore.getState().restartStory()

    // 同一引用——未被清空；列表也不移除
    expect(useStoryStore.getState().activeStory).toBe(s1)
    expect(useStoryStore.getState().stories).toHaveLength(1)
    expect(useStoryStore.getState().storyError).toBe(t('zh', 'story.deleteFailed'))
  })

  it('removeStoriesForLorebook 首条删除失败 → 中断剩余删除、只提示一次、未删项全保留', async () => {
    const s1 = makeStory('s1')
    const s2 = makeStory('s2')
    const s3 = makeStory('s3')
    const other = makeStory('s4', 'lb-other')
    mockDelStory.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStoryStore.setState({ stories: [s1, s2, s3, other], activeStory: null, storyError: null })

    await useStoryStore.getState().removeStoriesForLorebook('lb1')

    // 首败中断：只尝试了第一条（修复前裸 await 会抛且无从谈起）
    expect(callsOf(dbDeleteStory)).toHaveLength(1)
    expect(callsOf(dbDeleteStory)[0][0]).toBe('s1')
    // 只提示一次：storyError 恰为批量删除文案（不是循环里多次 set 叠加的别的值）
    expect(useStoryStore.getState().storyError).toBe(t('zh', 'story.batchDeleteFailed'))
    // 未删项全保留（含同书 3 条），他书不受影响
    expect(useStoryStore.getState().stories.map((x) => x.id).sort()).toEqual(['s1', 's2', 's3', 's4'])
  })

  it('removeStoriesForLorebook 第二条失败 → 已删成功的从内存移除、未删的保留（按删除成功与否过滤）', async () => {
    const s1 = makeStory('s1')
    const s2 = makeStory('s2')
    const s3 = makeStory('s3')
    mockDelStory.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStoryStore.setState({ stories: [s1, s2, s3], activeStory: s1, storyError: null })

    await useStoryStore.getState().removeStoriesForLorebook('lb1')

    expect(callsOf(dbDeleteStory)).toHaveLength(2)
    // s1 已删成功 → 内存移除；s2 失败、s3 未尝试 → 保留
    expect(useStoryStore.getState().stories.map((x) => x.id)).toEqual(['s2', 's3'])
    // activeStory 是 s1 且删除成功 → 清空
    expect(useStoryStore.getState().activeStory).toBeNull()
    expect(useStoryStore.getState().storyError).toBe(t('zh', 'story.batchDeleteFailed'))
  })

  it('advanceStory 本幕落库失败 → storyError 为保存失败文案（非误导的「剧情生成失败」）、本幕不进内存（TV-06 坑点 2）', async () => {
    // resume 路径建立模块级 storyEndpoint（不触发写库）
    const s1 = makeStory('s1')
    useStoryStore.setState({ stories: [s1], activeStory: null, storyError: null, plainMode: true })
    await useStoryStore.getState().openStory(LB, ENDPOINT, 'zh')
    expect(useStoryStore.getState().activeStory).toBe(s1)

    // 流式成功产出一幕文本；随后 dbPutStory 才失败（生成成功、保存失败的精确否例）
    mockStream.mockImplementation(async (_ep: unknown, _msgs: unknown, _sig: unknown, onDelta: (d: string) => void) => {
      onDelta('第一幕正文')
    })
    mockPutStoryFn.mockRejectedValueOnce(new Error('QuotaExceededError'))

    await useStoryStore.getState().advanceStory()

    // 修复前：共用外层 catch → storyError 是「剧情生成失败: …」（误导）；修复后：保存失败文案
    expect(useStoryStore.getState().storyError).toBe(t('zh', 'story.sceneSaveFailed'))
    // 内存与库一致：写失败本幕不进内存
    expect(useStoryStore.getState().activeStory!.scenes).toHaveLength(0)
    expect(useStoryStore.getState().sceneStreaming).toBe(false)
  })

  it('openStory 成功 → activeStory 置位、无 storyError（防过度保护）', async () => {
    mockPutStoryFn.mockResolvedValueOnce(undefined)

    await useStoryStore.getState().openStory(LB, ENDPOINT, 'zh')

    expect(useStoryStore.getState().activeStory).not.toBeNull()
    expect(useStoryStore.getState().stories).toHaveLength(1)
    expect(useStoryStore.getState().storyError).toBeNull()
  })

  it('restartStory 成功 → activeStory 清空、无 storyError（原有行为不变）', async () => {
    const s1 = makeStory('s1')
    mockDelStory.mockResolvedValueOnce(undefined)
    useStoryStore.setState({ stories: [s1], activeStory: s1, storyError: null })

    await useStoryStore.getState().restartStory()

    expect(useStoryStore.getState().activeStory).toBeNull()
    expect(useStoryStore.getState().stories).toHaveLength(0)
    expect(useStoryStore.getState().storyError).toBeNull()
  })

  it('removeStoriesForLorebook 全部成功 → 整组移除、无 storyError（防过度保护）', async () => {    const s1 = makeStory('s1')
    const s2 = makeStory('s2')
    const other = makeStory('s3', 'lb-other')
    mockDelStory.mockResolvedValue(undefined)
    useStoryStore.setState({ stories: [s1, s2, other], activeStory: s1, storyError: null })

    await useStoryStore.getState().removeStoriesForLorebook('lb1')

    expect(callsOf(dbDeleteStory)).toHaveLength(2)
    expect(useStoryStore.getState().stories.map((x) => x.id)).toEqual(['s3'])
    expect(useStoryStore.getState().activeStory).toBeNull()
    expect(useStoryStore.getState().storyError).toBeNull()
  })
})

describe('TV-06 新增文案四语齐全', () => {
  it('5 个新 key 在 zh/en/ja/ko 均有翻译（缺失时 t() 回退返回 key 本身）', () => {
    for (const key of NEW_KEYS) {
      for (const lang of LANGS) {
        expect(t(lang, key), `${key} @ ${lang}`).not.toBe(key)
      }
    }
  })
})
