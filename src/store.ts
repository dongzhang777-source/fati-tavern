import { create } from 'zustand'
import type { TavernCard } from './lib/tavern'
import { cardToSystemPrompt, bookToContext, applyMacros } from './lib/tavern'
import type { EndpointConfig } from './lib/api'
import { streamChat } from './lib/api'
import { trimMessages } from './lib/context'
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

  // 端点配置
  endpoint: EndpointConfig

  // actions
  init: () => Promise<void>
  importCard: (card: TavernCard, file?: File) => Promise<void>
  removeCharacter: (id: string) => Promise<void>
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
}

const LS_KEY = 'tavern-endpoint'

function loadEndpoint(): EndpointConfig {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat' }
}

function saveEndpoint(cfg: EndpointConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg))
}

let abortController: AbortController | null = null

export const useStore = create<State>((set, get) => ({
  view: 'gallery',
  characters: [],
  activeCharId: null,
  conversations: [],
  activeConvId: null,
  streaming: false,
  error: null,
  endpoint: loadEndpoint(),

  init: async () => {
    const characters = await dbGetCharacters()
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
  },

  removeCharacter: async (id) => {
    await dbDeleteCharacter(id)
    set((s) => ({
      characters: s.characters.filter((c) => c.id !== id),
      activeCharId: s.activeCharId === id ? null : s.activeCharId,
      view: s.activeCharId === id ? 'gallery' : s.view,
    }))
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

  backToGallery: () => set({ view: 'gallery', activeCharId: null, activeConvId: null, conversations: [] }),

  newConversation: async () => {
    const { activeCharId, characters } = get()
    if (!activeCharId) return
    const char = characters.find((c) => c.id === activeCharId)
    // 开场白替换 {{char}}/{{user}} 宏后再展示
    const firstMsg = char?.card.first_mes ? applyMacros(char.card.first_mes, char.card.name) : undefined
    const conv: StoredConversation = {
      id: genId(),
      characterId: activeCharId,
      title: `新对话`,
      messages: firstMsg ? [{ role: 'assistant', content: firstMsg, ts: Date.now() }] : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await dbPutConversation(conv)
    set((s) => ({ conversations: [conv, ...s.conversations], activeConvId: conv.id, error: null }))
  },

  selectConversation: (id) => set({ activeConvId: id, error: null }),

  deleteConversation: async (id) => {
    // 正在流式输出的会话被删除时先中断请求
    const s0 = get()
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
    const { endpoint, characters, activeCharId, conversations, activeConvId } = get()
    const char = characters.find((c) => c.id === activeCharId)
    const conv = conversations.find((c) => c.id === activeConvId)
    if (!char || !conv) return

    if (!endpoint.baseUrl) {
      set({ error: '请先在设置中配置 API 端点' })
      return
    }

    const userMsg: ChatMessage = { role: 'user', content: text, ts: Date.now() }
    const updatedMessages = [...conv.messages, userMsg]

    // 更新会话消息
    const updatedConv = { ...conv, messages: updatedMessages, updatedAt: Date.now() }
    if (conv.title === '新对话' && text.length > 0) {
      updatedConv.title = text.slice(0, 20) + (text.length > 20 ? '…' : '')
    }
    set((s) => ({
      conversations: s.conversations.map((c) => c.id === conv.id ? updatedConv : c),
      streaming: true,
      error: null,
    }))

    // 构建 system prompt
    let sys = cardToSystemPrompt(char.card)
    if (char.card.character_book) {
      const ctx = bookToContext(char.card.character_book, char.card.name)
      if (ctx) sys = ctx + '\n\n' + sys
    }

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

    streamChat(endpoint, apiMessages, abortController!.signal, (delta) => {
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
      set({ streaming: false })
      const final = get().conversations.find((c) => c.id === conv.id)
      if (final) dbPutConversation(final)
    }).catch((e: any) => {
      if (e.name === 'AbortError') {
        set({ streaming: false })
      } else {
        set({ streaming: false, error: e.message || '请求失败' })
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
    const { conversations, activeConvId, characters, activeCharId, streaming } = get()
    const conv = conversations.find((c) => c.id === activeConvId)
    if (!conv) return
    // 流式中清空先中断请求，避免旧回复继续写入
    if (streaming) {
      abortController?.abort()
      set({ streaming: false })
    }
    const char = characters.find((c) => c.id === activeCharId)
    const firstMsg = char?.card.first_mes ? applyMacros(char.card.first_mes, char.card.name) : undefined
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
}))
