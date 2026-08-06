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

// L-1：入站防护——成员列表硬上限 + 入站消息令牌桶限速（防恶意 relay/peer 灌帧）
const MAX_MEMBERS = 64
const INBOUND_RATE_PER_SEC = 60
let inboundCount = 0
let inboundWindowStart = Date.now()
function inboundAllowed(): boolean {
  const now = Date.now()
  if (now - inboundWindowStart >= 1000) { inboundWindowStart = now; inboundCount = 0 }
  return ++inboundCount <= INBOUND_RATE_PER_SEC
}

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
    // H-1 修正: sendChat 内部三态策略——有 groupKey 仅发密文，密钥未建立时排队，绝不降级明文
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
    // L-1：入站限速——超限帧静默丢弃（内部事件不受限，保障 UI 状态机）
    const internal = typeof msg.kind === 'string' && msg.kind.startsWith('_')
    if (!internal && !inboundAllowed()) return
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
      case '_send_failed': {
        // H-1：加密失败丢弃（不降级明文），通知用户消息未发出
        set({ p2pQueueWarning: t(detectLang(), 'p2pSendFailed') })
        return
      }
      case '_max_retries':
        set({ p2pError: 'reconnect_failed' })
        return
      case 'reject': {
        // L-5：reject reason 走白名单映射——恶意 relay 不得向 UI 注入任意文案（钓鱼面）
        const reason = String(msg.reason || '')
        const lang2 = detectLang()
        const mapped = /expired|过期/.test(reason) ? t(lang2, 'p2pRejectExpired')
          : /invalid|无效|篡改/.test(reason) ? t(lang2, 'p2pRejectInvalid')
          : /full|满/.test(reason) ? t(lang2, 'p2pRejectFull')
          : t(lang2, 'p2pRejectGeneric')
        set({ p2pError: mapped })
        return
      }
      case 'welcome':
        set({
          p2pPeerId: msg.peerId as string,
          // L-1：成员列表硬上限
          p2pMembers: ((msg.peers as P2PMember[]) || []).slice(0, MAX_MEMBERS),
          p2pError: null,
        })
        return
      case 'presence':
        set(s => {
          if (s.p2pMembers.some(m => m.id === msg.from)) return s
          // L-1：超限拒绝新成员
          if (s.p2pMembers.length >= MAX_MEMBERS) return s
          return { p2pMembers: [...s.p2pMembers, { id: msg.from as string, isCompute: !!msg.isCompute }] }
        })
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
