/**
 * 剧情模式 slice——独立 store（与 lore/p2p slice 同模式）。
 * 打通「导入的世界书进入剧情」：lorebook → premise 浓缩（纯前端规则）
 * → Director-lite 续写场景+选项 → IndexedDB 断点续玩。
 * 模块边界：tavern.ts / story.ts / api.ts / db.ts → 本文件 → UI。
 * 不反向引用 store.ts：endpoint 由 UI 层传入（UI 可同时读两个 store）。
 */
import { create } from 'zustand'
import type { EndpointConfig } from '../../lib/api'
import { streamChat } from '../../lib/api'
import { WEBLLM_BASE, streamWebLLM, webllmSupported, modelBlocked, isMobile, setWebllmProgressHandler } from '../../lib/webllm'
import { bookToPremise } from '../../lib/tavern'
import { buildStoryPrompt, parseSceneOutput } from '../../lib/story'
import {
  dbGetStories, dbPutStory, dbDeleteStory, genId,
  type StoredLorebook, type StoredStory, type StoryScene,
} from '../../lib/db'
import { t, type Lang } from '../../lib/i18n'

// WebLLM 小模型（phone 档）JSON 输出不稳定 → 降级纯续写（无选项）
// 桌面端 4B+ 档保留 JSON 选项模式
function isPlainModeFor(endpoint: EndpointConfig): boolean {
  if (endpoint.baseUrl !== WEBLLM_BASE) return false
  if (isMobile()) return true
  const m = endpoint.model || ''
  return /0\.5B|1\.5B|1\.7B/i.test(m)
}

interface StorySliceState {
  stories: StoredStory[]
  activeStory: StoredStory | null
  sceneStreaming: boolean
  sceneBuffer: string // 流式中的原始输出（JSON 模式不直接展示）
  storyError: string | null
  plainMode: boolean
  storyProgress: string | null // WebLLM 模型准备进度

  initStories: () => Promise<void>
  openStory: (lb: StoredLorebook, endpoint: EndpointConfig, lang: Lang) => Promise<void>
  advanceStory: (userInput?: string) => Promise<void>
  stopStory: () => void
  restartStory: () => Promise<void>
  closeStory: () => void
  removeStoriesForLorebook: (lorebookId: string) => Promise<void>
}

let storyAbort: AbortController | null = null
// 进入剧情时由 openStory 暂存（advance 复用），纯内存不持久化
let storyEndpoint: EndpointConfig | null = null
let storyLang: Lang = 'zh'

export const useStoryStore = create<StorySliceState>((set, get) => ({
  stories: [],
  activeStory: null,
  sceneStreaming: false,
  sceneBuffer: '',
  storyError: null,
  plainMode: false,
  storyProgress: null,

  initStories: async () => {
    const stories = await dbGetStories()
    set({ stories })
  },

  openStory: async (lb, endpoint, lang) => {
    storyAbort?.abort()
    storyEndpoint = endpoint
    storyLang = lang
    // 断点续玩：同一本书优先恢复最近一次剧情
    const existing = get().stories.filter((s) => s.lorebookId === lb.id)
    if (existing.length > 0) {
      set({ activeStory: existing[0], storyError: null, plainMode: isPlainModeFor(endpoint), sceneBuffer: '' })
      return
    }
    const { title, premise } = bookToPremise(lb.book, lb.source || lb.book.name || 'Story')
    const story: StoredStory = {
      id: genId(),
      lorebookId: lb.id,
      title,
      premise,
      scenes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await dbPutStory(story)
    set((s) => ({
      stories: [story, ...s.stories],
      activeStory: story,
      storyError: null,
      plainMode: isPlainModeFor(endpoint),
      sceneBuffer: '',
    }))
  },

  advanceStory: async (userInput) => {
    const { activeStory, sceneStreaming } = get()
    if (!activeStory || sceneStreaming) return
    const endpoint = storyEndpoint
    if (!endpoint) return

    // WebLLM 档前置检查（与聊天同策略，给明确提示而不是静默失败）
    const useWebllm = endpoint.baseUrl === WEBLLM_BASE
    if (useWebllm) {
      if (!webllmSupported()) {
        set({ storyError: t(storyLang, 'webllm.unsupported') })
        return
      }
      const block = modelBlocked(endpoint.model || '')
      if (block.blocked) {
        set({ storyError: block.reason || t(storyLang, 'webllm.unsupported') })
        return
      }
      setWebllmProgressHandler((p) => set({ storyProgress: p.done ? null : p.text }))
    }

    storyAbort?.abort()
    storyAbort = new AbortController()
    const plain = get().plainMode
    set({ sceneStreaming: true, sceneBuffer: '', storyError: null })

    const { system, user } = buildStoryPrompt({
      title: activeStory.title,
      premise: activeStory.premise,
      scenes: activeStory.scenes,
      lang: storyLang === 'zh' ? 'zh' : 'en',
      plainMode: plain,
      userInput,
    })
    const apiMessages = [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ]
    const doStream = useWebllm ? streamWebLLM : streamChat

    try {
      let raw = ''
      await doStream(endpoint, apiMessages, storyAbort.signal, (delta) => {
        raw += delta
        // plain 模式直接展示流式正文；JSON 模式只更新缓冲（结束统一解析）
        if (plain) set({ sceneBuffer: raw })
      })
      const parsed = plain ? { text: raw.trim(), choices: [] as string[] } : parseSceneOutput(raw)
      if (!parsed.text) throw new Error('EMPTY_SCENE')
      const scene: StoryScene = {
        id: genId(),
        text: parsed.text,
        choices: parsed.choices,
        createdAt: Date.now(),
      }
      const updated: StoredStory = {
        ...activeStory,
        scenes: [...activeStory.scenes, scene],
        updatedAt: Date.now(),
      }
      await dbPutStory(updated)
      set((s) => ({
        sceneStreaming: false,
        sceneBuffer: '',
        storyProgress: null,
        activeStory: updated,
        stories: s.stories.map((x) => x.id === updated.id ? updated : x),
      }))
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        set({ sceneStreaming: false, sceneBuffer: '', storyProgress: null })
      } else {
        set({
          sceneStreaming: false, sceneBuffer: '', storyProgress: null,
          storyError: `${t(storyLang, 'story.fail')}: ${e?.message || t(storyLang, 'error.request')}`,
        })
      }
    }
  },

  stopStory: () => {
    storyAbort?.abort()
    set({ sceneStreaming: false, sceneBuffer: '', storyProgress: null })
  },

  restartStory: async () => {
    const { activeStory } = get()
    if (!activeStory) return
    storyAbort?.abort()
    await dbDeleteStory(activeStory.id)
    set((s) => ({
      stories: s.stories.filter((x) => x.id !== activeStory.id),
      activeStory: null,
      sceneStreaming: false,
      sceneBuffer: '',
      storyError: null,
    }))
    // UI 侦测 activeStory 置空且仍在剧情视图 → 引导用户重新进入
  },

  closeStory: () => {
    storyAbort?.abort()
    storyEndpoint = null
    set({ sceneStreaming: false, sceneBuffer: '', activeStory: null, storyError: null, storyProgress: null })
  },

  removeStoriesForLorebook: async (lorebookId) => {
    const doomed = get().stories.filter((s) => s.lorebookId === lorebookId)
    for (const s of doomed) await dbDeleteStory(s.id)
    set((s) => ({
      stories: s.stories.filter((x) => x.lorebookId !== lorebookId),
      activeStory: s.activeStory?.lorebookId === lorebookId ? null : s.activeStory,
    }))
  },
}))
