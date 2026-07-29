import { create } from 'zustand'
import type { TavernCard } from './lib/tavern'
import { cardToSystemPrompt, bookToContext, applyMacros, detectCardLanguage, personaLine } from './lib/tavern'
import type { EndpointConfig } from './lib/api'
import { streamChat } from './lib/api'
import { buildSuggestionsPrompt, buildSingleSuggestionPrompt, buildRefinePrompt, parseSuggestions, collectChat } from './lib/impersonate'
import { trimMessages } from './lib/context'
import { detectSelfHarm } from './lib/safety'
import { detectLang, saveLang, t, type Lang } from './lib/i18n'
import { trackOnce } from './lib/analytics'
import { WEBLLM_BASE, streamWebLLM, webllmSupported, modelBlocked, setWebllmProgressHandler, isMobile, isIOS, WEBLLM_MODEL_MOBILE } from './lib/webllm'
import { BUILTIN_CHARACTERS } from './lib/catalog'
import {
  dbGetCharacters, dbPutCharacter, dbDeleteCharacter,
  dbGetConversations, dbPutConversation, dbDeleteConversation,
  genId, extractAvatar,
  type StoredCharacter, type StoredConversation,
} from './lib/db'

export interface ChatMessage {
  id?: string // 流式占位消息按 id 定位，避免按位置盲写
  role: 'user' | 'assistant' | 'system'
  content: string
  ts?: number
}

export type View = 'gallery' | 'chat'

// 用户 persona（全局单个）：名字填 {{user}} 宏，描述拼入 system prompt
export interface UserPersona {
  name: string
  description: string
}

interface State {
  // 视图
  view: View

  // 角色库
  characters: StoredCharacter[]
  activeCharId: string | null

  // 多会话
  conversations: StoredConversation[]
  activeConvId: string | null

  // 聊天状态
  streaming: boolean
  error: string | null
  safetyNotice: boolean // 自伤关键词命中后显示危机资源提示
  webllmProgress: string | null // WebLLM 模型下载/编译进度文本

  // 语言
  lang: Lang

  // 用户 persona（我在故事里扮演谁）
  persona: UserPersona

  // 嘴替（帮我接话）：建议只供填入输入框，不入聊天记录
  impSuggestions: string[]
  impLoading: boolean
  impRefining: boolean
  impExpansion: number // 拓展度 0-1：低=顺着剧情，高=大胆推进

  // 端点配置
  endpoint: EndpointConfig

  // actions
  init: () => Promise<void>
  importCard: (card: TavernCard, file?: File) => Promise<void>
  removeCharacter: (id: string) => Promise<void>
  updateCharacter: (id: string, card: TavernCard) => Promise<void>
  openCharacter: (id: string) => Promise<void>
  backToGallery: () => void

  newConversation: () => Promise<void>
  selectConversation: (id: string) => void
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => void

  sendMessage: (text: string) => void
  stopStreaming: () => void
  clearChat: () => void
  setEndpoint: (cfg: Partial<EndpointConfig>) => void
  setLang: (lang: Lang) => void
  setPersona: (p: Partial<UserPersona>) => void
  dismissSafetyNotice: () => void

  // 嘴替 actions（仅用户点击触发，无任何自动/预生成路径）
  fetchImpersonate: () => Promise<void>
  refineImpersonate: (draft: string) => Promise<string>
  setImpExpansion: (v: number) => void
  clearImpersonate: () => void
}

const LS_KEY = 'tavern-endpoint'

function loadEndpoint(): EndpointConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  // 默认 WebLLM 浏览器本地推理，零配置即可聊天
  // iOS 默认 0.5B（1.5B 推理时会白屏），其他移动端 1.5B
  const model = isIOS() ? WEBLLM_MODEL_MOBILE
    : isMobile() ? 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
    : 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
  return { baseUrl: 'webllm', apiKey: 'not-needed', model }
}

function saveEndpoint(cfg: EndpointConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg))
}

const LS_PERSONA_KEY = 'tavern-persona'

function loadPersona(): UserPersona {
  try {
    const raw = localStorage.getItem(LS_PERSONA_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { name: typeof p.name === 'string' ? p.name : '', description: typeof p.description === 'string' ? p.description : '' }
    }
  } catch { /* ignore */ }
  return { name: '', description: '' }
}

function savePersona(p: UserPersona) {
  localStorage.setItem(LS_PERSONA_KEY, JSON.stringify(p))
}

// {{user}} 宏的实际替换值：persona 名字为空时回退 'User'
export function personaUserName(p: UserPersona): string {
  return p.name.trim() || 'User'
}

const LS_IMP_EXPANSION_KEY = 'tavern-imp-expansion'

function loadImpExpansion(): number {
  try {
    const v = parseFloat(localStorage.getItem(LS_IMP_EXPANSION_KEY) || '')
    if (!Number.isNaN(v) && v >= 0 && v <= 1) return v
  } catch { /* ignore */ }
  return 0.3
}

let abortController: AbortController | null = null
// 嘴替独立 abort：不与聊天流式互相干扰
let impAbort: AbortController | null = null

export const useStore = create<State>((set, get) => ({
  view: 'gallery',
  characters: [],
  activeCharId: null,
  conversations: [],
  activeConvId: null,
  streaming: false,
  error: null,
  safetyNotice: false,
  webllmProgress: null,
  lang: detectLang(),
  endpoint: loadEndpoint(),
  persona: loadPersona(),
  impSuggestions: [],
  impLoading: false,
  impRefining: false,
  impExpansion: loadImpExpansion(),

  init: async () => {
    // 加载用户导入的角色（IndexedDB）
    const userChars = await dbGetCharacters()
    // 加载内置角色目录（不写 IndexedDB，标记 builtin: true）
    const builtinChars: StoredCharacter[] = BUILTIN_CHARACTERS.map((c) => ({
      id: c._id,
      card: c,
      createdAt: 0, // 内置角色时间戳为 0，排在用户角色后面
      builtin: true,
    }))
    // 合并：用户角色在前，内置角色在后
    const characters = [...userChars, ...builtinChars]
    set({ characters })
  },

  importCard: async (card, file) => {
    const avatarUrl = file?.name.toLowerCase().endsWith('.png')
      ? await extractAvatar(file)
      : undefined
    const stored: StoredCharacter = {
      id: genId(),
      card,
      avatarUrl,
      createdAt: Date.now(),
    }
    await dbPutCharacter(stored)
    set((s) => ({ characters: [stored, ...s.characters] }))
    trackOnce('import_success') // 漏斗事件②：导入成功（每设备一次）
  },

  removeCharacter: async (id) => {
    // 内置角色只从内存移除，不写 IndexedDB
    if (id.startsWith('builtin-')) {
      set((s) => ({
        characters: s.characters.filter((c) => c.id !== id),
        activeCharId: s.activeCharId === id ? null : s.activeCharId,
        view: s.activeCharId === id ? 'gallery' : s.view,
      }))
      return
    }
    await dbDeleteCharacter(id)
    set((s) => ({
      characters: s.characters.filter((c) => c.id !== id),
      activeCharId: s.activeCharId === id ? null : s.activeCharId,
      view: s.activeCharId === id ? 'gallery' : s.view,
    }))
  },

  updateCharacter: async (id, card) => {
    const existing = get().characters.find((c) => c.id === id)
    if (!existing) return

    if (existing.builtin) {
      // 内置角色：创建用户副本
      const newId = genId()
      const stored: StoredCharacter = {
        id: newId,
        card,
        avatarUrl: existing.avatarUrl,
        createdAt: Date.now(),
        // 不设置 builtin 标记，成为用户角色
      }
      await dbPutCharacter(stored)
      set((s) => ({
        characters: [stored, ...s.characters], // 添加到列表顶部
      }))
      trackOnce('character_edit')
    } else {
      // 用户角色：直接更新
      const updated = { ...existing, card }
      await dbPutCharacter(updated)
      set((s) => ({
        characters: s.characters.map((c) => c.id === id ? updated : c),
      }))
    }
  },

  openCharacter: async (id) => {
    const convs = await dbGetConversations(id)
    set({ activeCharId: id, conversations: convs, view: 'chat' })
    // 自动选中最近的会话，或创建新的
    if (convs.length > 0) {
      set({ activeConvId: convs[0].id })
    } else {
      await get().newConversation()
    }
  },

  backToGallery: () => {
    get().clearImpersonate()
    set({ view: 'gallery', activeCharId: null, activeConvId: null, conversations: [] })
  },

  newConversation: async () => {
    const { activeCharId, characters, lang, persona } = get()
    if (!activeCharId) return
    get().clearImpersonate() // 新会话：旧建议已不属于新上下文
    const char = characters.find((c) => c.id === activeCharId)
    // 开场白替换 {{char}}/{{user}} 宏后再展示
    const firstMsg = char?.card.first_mes ? applyMacros(char.card.first_mes, char.card.name, personaUserName(persona)) : undefined
    const conv: StoredConversation = {
      id: genId(),
      characterId: activeCharId,
      title: t(lang, 'chat.newConvTitle'),
      messages: firstMsg ? [{ role: 'assistant', content: firstMsg, ts: Date.now() }] : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await dbPutConversation(conv)
    set((s) => ({ conversations: [conv, ...s.conversations], activeConvId: conv.id, error: null }))
  },

  selectConversation: (id) => {
    get().clearImpersonate() // 切会话：旧建议已不属于新上下文
    set({ activeConvId: id, error: null })
  },

  deleteConversation: async (id) => {
    // 正在流式输出的会话被删除时先中断请求
    const s0 = get()
    if (s0.activeConvId === id) get().clearImpersonate()
    if (s0.streaming && s0.activeConvId === id) {
      abortController?.abort()
      set({ streaming: false })
    }
    await dbDeleteConversation(id)
    set((s) => {
      const convs = s.conversations.filter((c) => c.id !== id)
      return {
        conversations: convs,
        activeConvId: s.activeConvId === id ? (convs[0]?.id ?? null) : s.activeConvId,
      }
    })
  },

  renameConversation: (id, title) => {
    // 先构造好对象，再分别写状态和库——不依赖 set 的同步性
    const conv = get().conversations.find((c) => c.id === id)
    if (!conv) return
    const renamed = { ...conv, title }
    set((s) => ({
      conversations: s.conversations.map((c) => c.id === id ? renamed : c),
    }))
    dbPutConversation(renamed)
  },

  sendMessage: (text) => {
    const { endpoint, characters, activeCharId, conversations, activeConvId, lang, persona } = get()
    const char = characters.find((c) => c.id === activeCharId)
    const conv = conversations.find((c) => c.id === activeConvId)
    if (!char || !conv) return

    if (!endpoint.baseUrl) {
      set({ error: t(lang, 'error.noEndpoint') })
      return
    }

    // 自伤/自杀意念兜底：本地关键词识别，命中弹危机资源提示（不阻断消息）
    if (detectSelfHarm(text)) {
      set({ safetyNotice: true })
    }

    // WebLLM 档需要 WebGPU，提前拦截给明确提示
    const useWebllm = endpoint.baseUrl === WEBLLM_BASE
    if (useWebllm && !webllmSupported()) {
      set({ error: t(lang, 'webllm.unsupported') })
      return
    }
    // iOS 上若之前存过 4B/8B 大模型配置，发送前拦截，避免 WebGPU OOM 整页闪退
    if (useWebllm) {
      const iosBlock = modelBlocked(endpoint.model || '')
      if (iosBlock.blocked) {
        set({ error: iosBlock.reason || t(lang, 'webllm.unsupported') })
        return
      }
    }

    const userMsg: ChatMessage = { role: 'user', content: text, ts: Date.now() }
    const updatedMessages = [...conv.messages, userMsg]

    // 漏斗事件③④：首条消息 / 第二轮对话（每设备一次）
    trackOnce('first_message')
    if (updatedMessages.filter((m) => m.role === 'user').length >= 2) {
      trackOnce('second_round')
    }

    // 更新会话消息
    const updatedConv = { ...conv, messages: updatedMessages, updatedAt: Date.now() }
    // 默认标题（两种语言）都视为未命名，首条消息自动命名
    if ((conv.title === '新对话' || conv.title === 'New chat') && text.length > 0) {
      updatedConv.title = text.slice(0, 20) + (text.length > 20 ? '…' : '')
    }
    set((s) => ({
      conversations: s.conversations.map((c) => c.id === conv.id ? updatedConv : c),
      streaming: true,
      error: null,
    }))

    // 构建 system prompt（persona 名字填 {{user}}，扮演描述拼尾部）
    const userName = personaUserName(persona)
    let sys = cardToSystemPrompt(char.card, userName)
    if (char.card.character_book) {
      const ctx = bookToContext(char.card.character_book, char.card.name, userName)
      if (ctx) sys = ctx + '\n\n' + sys
    }
    const pLine = personaLine(persona.description, detectCardLanguage(char.card))
    if (pLine) sys = sys + '\n\n' + pLine

    const apiMessages = [
      { role: 'system', content: sys },
      // 超预算时保头保尾截中段，长对话不再撞 token 上限
      ...trimMessages(updatedMessages).filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })),
    ]

    abortController = new AbortController()
    let assistantText = ''

    // 追加带 id 的空 assistant 占位消息——流式回调按 id 定位，
    // 用户清空/切换会话后不会串写到别的消息上
    const placeholderId = genId()
    const withAssistant = [...updatedMessages, { id: placeholderId, role: 'assistant' as const, content: '', ts: Date.now() }]
    set((s) => ({
      conversations: s.conversations.map((c) => c.id === conv.id ? { ...c, messages: withAssistant } : c),
    }))

    // WebLLM 档：注册进度回调（模型下载/编译状态展示）并分流
    if (useWebllm) {
      setWebllmProgressHandler((p) => {
        set({ webllmProgress: p.done ? null : p.text })
      })
    }
    const doStream = useWebllm ? streamWebLLM : streamChat

    doStream(endpoint, apiMessages, abortController!.signal, (delta) => {
      assistantText += delta
      set((s) => ({
        conversations: s.conversations.map((c) => {
          if (c.id !== conv.id) return c
          return {
            ...c,
            messages: c.messages.map((m) => m.id === placeholderId ? { ...m, content: assistantText, ts: Date.now() } : m),
          }
        }),
      }))
    }).then(() => {
      set({ streaming: false, webllmProgress: null })
      const final = get().conversations.find((c) => c.id === conv.id)
      if (final) dbPutConversation(final)
    }).catch((e: any) => {
      if (e.name === 'AbortError') {
        set({ streaming: false, webllmProgress: null })
      } else {
        const msg = e.message === 'WEBGPU_UNSUPPORTED'
          ? t(get().lang, 'webllm.unsupported')
          : (e.message || t(get().lang, 'error.request'))
        set({ streaming: false, webllmProgress: null, error: msg })
      }
      const final = get().conversations.find((c) => c.id === conv.id)
      if (final) dbPutConversation(final)
    })
  },

  stopStreaming: () => {
    abortController?.abort()
    set({ streaming: false })
  },

  clearChat: () => {
    const { conversations, activeConvId, characters, activeCharId, streaming, persona } = get()
    const conv = conversations.find((c) => c.id === activeConvId)
    if (!conv) return
    // 流式中清空先中断请求，避免旧回复继续写入
    if (streaming) {
      abortController?.abort()
      set({ streaming: false })
    }
    const char = characters.find((c) => c.id === activeCharId)
    const firstMsg = char?.card.first_mes ? applyMacros(char.card.first_mes, char.card.name, personaUserName(persona)) : undefined
    const cleared: StoredConversation = {
      ...conv,
      messages: firstMsg ? [{ role: 'assistant', content: firstMsg, ts: Date.now() }] : [],
      updatedAt: Date.now(),
    }
    dbPutConversation(cleared)
    set((s) => ({
      conversations: s.conversations.map((c) => c.id === conv.id ? cleared : c),
      error: null,
    }))
  },

  setEndpoint: (cfg) => set((s) => {
    const next = { ...s.endpoint, ...cfg }
    saveEndpoint(next)
    return { endpoint: next }
  }),

  setLang: (lang) => {
    saveLang(lang)
    set({ lang })
  },

  setPersona: (p) => set((s) => {
    const next = { ...s.persona, ...p }
    savePersona(next)
    return { persona: next }
  }),

  dismissSafetyNotice: () => set({ safetyNotice: false }),

  // ─── 嘴替（帮我接话）──────────────────────────────────

  fetchImpersonate: async () => {
    const { endpoint, characters, activeCharId, conversations, activeConvId, lang, persona, impExpansion, streaming, impLoading } = get()
    // WebLLM 单引擎不能并发； BYOK 也保持一致行为
    if (streaming || impLoading) return
    const char = characters.find((c) => c.id === activeCharId)
    const conv = conversations.find((c) => c.id === activeConvId)
    if (!char || !conv) return
    if (!endpoint.baseUrl) {
      set({ error: t(lang, 'error.noEndpoint') })
      return
    }
    const useWebllm = endpoint.baseUrl === WEBLLM_BASE
    if (useWebllm) {
      if (!webllmSupported()) {
        set({ error: t(lang, 'webllm.unsupported') })
        return
      }
      const block = modelBlocked(endpoint.model || '')
      if (block.blocked) {
        set({ error: block.reason || t(lang, 'webllm.unsupported') })
        return
      }
      setWebllmProgressHandler((p) => {
        set({ webllmProgress: p.done ? null : p.text })
      })
    }

    impAbort?.abort()
    impAbort = new AbortController()
    set({ impLoading: true, impSuggestions: [], error: null })
    try {
      const ctx = {
        card: char.card,
        persona,
        recent: conv.messages.map((m) => ({ role: m.role, content: m.content })),
        expansion: impExpansion,
        lang: detectCardLanguage(char.card),
      }
      let options: string[]
      if (useWebllm && isMobile()) {
        // 仅移动端降级单条（热预算 + 小模型 JSON 不可靠）；桌面 WebLLM 照常 3 选项
        const text = await collectChat(endpoint, buildSingleSuggestionPrompt(ctx), impAbort.signal)
        options = text ? [text] : []
      } else {
        const raw = await collectChat(endpoint, buildSuggestionsPrompt(ctx), impAbort.signal)
        options = parseSuggestions(raw)
      }
      set({ impSuggestions: options, impLoading: false, webllmProgress: null })
    } catch (e: any) {
      if (e.name === 'AbortError') {
        set({ impLoading: false, webllmProgress: null })
      } else {
        set({ impLoading: false, webllmProgress: null, error: `${t(get().lang, 'imp.fail')}: ${e.message || t(get().lang, 'error.request')}` })
      }
    }
  },

  refineImpersonate: async (draft) => {
    const { endpoint, characters, activeCharId, conversations, activeConvId, lang, persona, impExpansion, streaming, impRefining } = get()
    if (streaming || impRefining || !draft.trim()) return ''
    const char = characters.find((c) => c.id === activeCharId)
    const conv = conversations.find((c) => c.id === activeConvId)
    if (!char || !conv) return ''
    if (!endpoint.baseUrl) {
      set({ error: t(lang, 'error.noEndpoint') })
      return ''
    }
    if (endpoint.baseUrl === WEBLLM_BASE && !webllmSupported()) {
      set({ error: t(lang, 'webllm.unsupported') })
      return ''
    }

    impAbort?.abort()
    impAbort = new AbortController()
    set({ impRefining: true, error: null })
    try {
      const ctx = {
        card: char.card,
        persona,
        recent: conv.messages.map((m) => ({ role: m.role, content: m.content })),
        expansion: impExpansion,
        lang: detectCardLanguage(char.card),
      }
      const refined = await collectChat(endpoint, buildRefinePrompt(ctx, draft), impAbort.signal)
      set({ impRefining: false })
      return refined
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        set({ error: `${t(get().lang, 'imp.fail')}: ${e.message || t(get().lang, 'error.request')}` })
      }
      set({ impRefining: false })
      return ''
    }
  },

  setImpExpansion: (v) => {
    const clamped = Math.min(1, Math.max(0, v))
    try { localStorage.setItem(LS_IMP_EXPANSION_KEY, String(clamped)) } catch { /* ignore */ }
    set({ impExpansion: clamped })
  },

  clearImpersonate: () => {
    impAbort?.abort()
    impAbort = null
    set({ impSuggestions: [], impLoading: false, impRefining: false })
  },
}))

export { useP2PStore, loadRelayUrl, saveRelayUrl } from './store/slices/p2p'
