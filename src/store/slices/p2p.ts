import { create } from 'zustand'
import { createP2PClient } from '../../p2p/client'
import type { P2PClientHandle, P2PMessage, ClientState } from '../../p2p/client'
import { loadOrCreateKeyPair, createInvite, verifyInvite, extractRelayUrlFromToken } from '../../p2p/token'
import { detectSelfHarm } from '../../lib/safety'
import { detectLang, t } from '../../lib/i18n'

export interface P2PMember { id: string; isCompute: boolean }
export interface P2PChatMsg { id: string; from: string; body: string; ts: number; encrypted: boolean; mine: boolean }
export interface P2PCompute { id: string; prompt: string; result: string; done: boolean; cancelled?: boolean }

const LS_RELAY_KEY = 'tavern-p2p-relay'
export const DEFAULT_RELAY = 'ws://127.0.0.1:8081'

export function loadRelayUrl(): string {
  try { return localStorage.getItem(LS_RELAY_KEY) || DEFAULT_RELAY } catch { return DEFAULT_RELAY }
}
export function saveRelayUrl(url: string) {
  try { localStorage.setItem(LS_RELAY_KEY, url.trim()) } catch { /* ignore */ }
}

// 模块级持有连接句柄（同 store.ts 的 abortController 模式，不进 store）
let client: P2PClientHandle | null = null
let unsub: (() => void) | null = null

interface P2PState {
  p2pState: ClientState | 'idle'
  p2pToken: string | null
  p2pError: string | null
  p2pEncrypted: boolean
  p2pPeerId: string | null
  p2pMembers: P2PMember[]
  p2pMessages: P2PChatMsg[]
  p2pComputes: P2PCompute[]
  p2pStreamingComputeId: string | null
  p2pSafetyNotice: boolean
  p2pQueueWarning: string | null
  dismissP2PSafetyNotice: () => void
  dismissP2PQueueWarning: () => void
  createInviteToken: (relayUrl?: string) => Promise<string>
  joinWithToken: (token: string, relayUrl?: string) => Promise<void>
  disconnectP2P: () => void
  sendP2PChat: (text: string) => void
  requestP2PCompute: (prompt: string) => void
  cancelP2PCompute: (id: string) => void
  p2pChatTab: 'solo' | 'group'
  setP2PChatTab: (tab: 'solo' | 'group') => void
  _handleP2PMessage: (msg: P2PMessage) => void
}

export const useP2PStore = create<P2PState>((set, get) => ({
  p2pState: 'idle',
  p2pToken: null,
  p2pError: null,
  p2pEncrypted: false,
  p2pPeerId: null,
  p2pMembers: [],
  p2pMessages: [],
  p2pComputes: [],
  p2pStreamingComputeId: null,
  p2pSafetyNotice: false,
  p2pQueueWarning: null,
  dismissP2PSafetyNotice: () => set({ p2pSafetyNotice: false }),
  dismissP2PQueueWarning: () => set({ p2pQueueWarning: null }),
  p2pChatTab: 'solo',
  setP2PChatTab: (tab) => set({ p2pChatTab: tab }),

  createInviteToken: async (relayUrl) => {
    const kp = await loadOrCreateKeyPair()
    const base = (relayUrl || loadRelayUrl()).replace(/\/+$/, '')
    // 房间 id 由 relay 从 pk 派生，ep 的 /p2p/<room> 段仅为格式占位
    const token = await createInvite(kp, { endpoint: `${base}/p2p/tavern` })
    return token
  },

  joinWithToken: async (token, relayUrl) => {
    const trimmed = token.trim()
    const r = await verifyInvite(trimmed)
    if (!r.ok) { set({ p2pError: r.reason || 'invalid_token' }); return }
    const url = relayUrl || extractRelayUrlFromToken(trimmed)
    if (!url) { set({ p2pError: 'invalid_relay' }); return }
    get().disconnectP2P()
    set({
      p2pError: null, p2pToken: trimmed, p2pState: 'connecting', p2pEncrypted: false,
      p2pPeerId: null, p2pMembers: [], p2pMessages: [],
    })
    client = createP2PClient(trimmed, url)
    unsub = client.onMessage(m => get()._handleP2PMessage(m))
  },

  disconnectP2P: () => {
    unsub?.(); unsub = null
    client?.disconnect(); client = null
    set({ p2pState: 'idle', p2pEncrypted: false, p2pPeerId: null, p2pMembers: [], p2pStreamingComputeId: null })
  },

  sendP2PChat: (text) => {
    const body = text.trim()
    if (!body || !client) return
    if (detectSelfHarm(body)) {
      set({ p2pSafetyNotice: true })
    }
    // N-B1 修正: sendChat 加密 + body 明文并存，加密失败时 .catch() 降级为明文
    // QNEW-1: encryptMessage 的 .catch() 已在 client 层处理，失败时自动降级
    client.sendChat(body)
    const me = get().p2pPeerId || 'me'
    set(s => ({
      p2pMessages: [...s.p2pMessages, {
        id: `local_${Date.now()}`, from: me, body, ts: Date.now(),
        encrypted: s.p2pEncrypted, mine: true,
      }].slice(-200),
    }))
  },

  requestP2PCompute: (prompt) => {
    const p = prompt.trim()
    if (!p || !client) return
    const id = client.requestCompute(p)
    set(s => ({
      p2pComputes: [...s.p2pComputes, { id, prompt: p, result: '', done: false }],
      p2pStreamingComputeId: id,
    }))
  },

  cancelP2PCompute: (id) => {
    // 协议无取消消息：仅本地标记，后续帧到达时丢弃
    set(s => ({
      p2pComputes: s.p2pComputes.map(c => c.id === id ? { ...c, done: true, cancelled: true } : c),
      p2pStreamingComputeId: s.p2pStreamingComputeId === id ? null : s.p2pStreamingComputeId,
    }))
  },

  _handleP2PMessage: (msg) => {
    switch (msg.kind) {
      case '_state_change':
        set({ p2pState: msg.state as ClientState })
        return
      case '_e2e_ready':
        set({ p2pEncrypted: true })
        return
      case '_queue_overflow': {
        // N-C5: 硬编码中文收进 i18n dict
        const lang = detectLang()
        const queue = String(msg.queue || '')
        const key = queue === 'chat' ? 'p2pQueueOverflowChat'
          : queue === 'compute' ? 'p2pQueueOverflowCompute'
          : 'p2pQueueOverflowDefault'
        set({ p2pQueueWarning: t(lang, key) })
        return
      }
      case '_max_retries':
        set({ p2pError: 'reconnect_failed' })
        return
      case 'reject':
        set({ p2pError: String(msg.reason || 'rejected') })
        return
      case 'welcome':
        set({
          p2pPeerId: msg.peerId as string,
          p2pMembers: (msg.peers as P2PMember[]) || [],
          p2pError: null,
        })
        return
      case 'presence':
        set(s => s.p2pMembers.some(m => m.id === msg.from)
          ? s
          : { p2pMembers: [...s.p2pMembers, { id: msg.from as string, isCompute: !!msg.isCompute }] })
        return
      case 'leave':
        set(s => ({ p2pMembers: s.p2pMembers.filter(m => m.id !== msg.from) }))
        return
      case 'chat': {
        // N-C5: 硬编码中文收进 i18n dict
        const lang = detectLang()
        const body = typeof msg.body === 'string' ? msg.body : t(lang, 'p2pUndecryptable')
        if (detectSelfHarm(body)) {
          set({ p2pSafetyNotice: true })
        }
        const msgId = String(msg.id || `r_${Date.now()}`)
        set(s => {
          if (s.p2pMessages.some(m => m.id === msgId)) return s
          return {
            p2pMessages: [...s.p2pMessages, {
              id: msgId, from: String(msg.from || '?'),
              body, ts: Number(msg.ts) || Date.now(),
              encrypted: msg.encrypted === true, mine: false,
            }].slice(-200),
          }
        })
        return
      }
      case 'compute_result': {
        const reqId = String(msg.reqId)
        set(s => {
          const target = s.p2pComputes.find(c => c.id === reqId)
          if (!target || target.cancelled) return s // 别人的流或已取消：丢弃
          const done = msg.done === true
          return {
            p2pComputes: s.p2pComputes.map(c => c.id === reqId
              ? { ...c, result: c.result + String(msg.body || ''), done }
              : c),
            p2pStreamingComputeId: done && s.p2pStreamingComputeId === reqId ? null : s.p2pStreamingComputeId,
          }
        })
        return
      }
      // QNEW-2: 算力请求超时处理
      case '_compute_timeout': {
        const lang = detectLang()
        const id = String(msg.id || '')
        set(s => ({
          p2pComputes: s.p2pComputes.map(c => c.id === id ? { ...c, done: true, cancelled: true } : c),
          p2pStreamingComputeId: s.p2pStreamingComputeId === id ? null : s.p2pStreamingComputeId,
          p2pQueueWarning: t(lang, 'p2pComputeTimeout'),
        }))
        return
      }
    }
  },
}))
