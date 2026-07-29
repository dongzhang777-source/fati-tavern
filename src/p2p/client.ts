// P2P 客户端 —— 协议兼容 FATI relay（消息鉴别字段为 kind）
import { extractRelayUrlFromToken } from './token'
import {
  generateEcdhKeyPair, decryptGroupKeyFromPeer, encryptMessage, decryptMessage,
} from './crypto'
import type { EcdhKeyPair } from './crypto'

export type ClientState = 'connecting' | 'joined' | 'disconnected'

export interface P2PMessage { kind: string; [k: string]: unknown }

export interface P2PClientHandle {
  onMessage(cb: (msg: P2PMessage) => void): () => void
  sendChat(text: string): void
  requestCompute(prompt: string): string
  disconnect(): void
  getState(): ClientState
  getPeerId(): string | null
  isEncrypted(): boolean
}

const DEFAULT_RELAY = 'ws://127.0.0.1:8081'
const MAX_RETRIES = 5
const MAX_PENDING = 50

function randHex(bytes: number): string {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

export function createP2PClient(token: string, relayUrl?: string): P2PClientHandle {
  let ws: WebSocket | null = null
  let state: ClientState = 'connecting'
  let disposed = false
  let retryCount = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let peerId: string | null = null
  let groupKey: string | null = null
  let ecdhKp: EcdhKeyPair | null = null
  const listeners = new Set<(m: P2PMessage) => void>()
  const pending: string[] = []
  const pendingChat: Array<{ id: string; ts: number; text: string }> = []
  const url = relayUrl || extractRelayUrlFromToken(token) || DEFAULT_RELAY

  function emit(m: P2PMessage) { for (const cb of listeners) cb(m) }

  function setState(s: ClientState) {
    if (state === s) return
    state = s
    emit({ kind: '_state_change', state: s })
  }

  function flushPending() {
    while (pending.length && ws && ws.readyState === WebSocket.OPEN) ws.send(pending.shift()!)
  }

  async function flushPendingChat() {
    if (!groupKey) return
    while (pendingChat.length) {
      const item = pendingChat.shift()!
      try {
        const { data, iv } = await encryptMessage(groupKey, item.text)
        safeSend(JSON.stringify({ kind: 'chat', id: item.id, ts: item.ts, encrypted: true, data, iv }))
      } catch { /* ignore */ }
    }
  }

  function safeSend(json: string) {
    if (state === 'joined' && ws && ws.readyState === WebSocket.OPEN) ws.send(json)
    else if (pending.length < MAX_PENDING) pending.push(json)
  }

  async function handleMessage(msg: P2PMessage) {
    switch (msg.kind) {
      case 'welcome':
        peerId = msg.peerId as string
        retryCount = 0
        setState('joined')
        flushPending()
        emit(msg)
        return
      case 'ecdh_pub': {
        // 重连时复用已有密钥对
        if (!ecdhKp) ecdhKp = await generateEcdhKeyPair()
        if (ws && ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ kind: 'ecdh_pub', pub: ecdhKp.publicKeyB64 }))
        return // 握手消息不透传业务层
      }
      case 'group_key': {
        if (!ecdhKp) return
        try {
          groupKey = await decryptGroupKeyFromPeer(
            ecdhKp.privateKey, msg.serverPub as string,
            msg.encrypted as { data: string; iv: string })
          emit({ kind: '_e2e_ready' })
          void flushPendingChat()
        } catch { /* relay 是广播，这份密文不是发给我的 */ }
        return
      }
      case 'chat': {
        if (msg.encrypted === true && groupKey) {
          try {
            const body = await decryptMessage(groupKey, { data: msg.data as string, iv: msg.iv as string })
            emit({ ...msg, body })
            return
          } catch { /* 解密失败原样透传，UI 显示密文占位 */ }
        }
        emit(msg)
        return
      }
      default:
        emit(msg)
    }
  }

  function connect() {
    if (disposed) return
    setState('connecting')
    ws = new WebSocket(url)
    ws.onopen = () => { ws!.send(JSON.stringify({ kind: 'join', token })) }
    ws.onmessage = (ev) => {
      let msg: P2PMessage
      try { msg = JSON.parse(String(ev.data)) } catch { return }
      void handleMessage(msg)
    }
    ws.onerror = () => { /* 交给 onclose 处理 */ }
    ws.onclose = () => {
      if (disposed) return
      setState('disconnected')
      if (retryCount >= MAX_RETRIES) { emit({ kind: '_max_retries' }); return }
      const delay = Math.min(1000 * 2 ** retryCount, 16000)
      retryCount++
      retryTimer = setTimeout(connect, delay)
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible' && state !== 'joined' && !disposed) {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
      if (ws) {
        try { ws.onclose = null; ws.close() } catch { /* ignore */ }
        ws = null
      }
      retryCount = 0
      connect()
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  connect()

  return {
    onMessage(cb) { listeners.add(cb); return () => { listeners.delete(cb) } },
    sendChat(text) {
      const id = `m_${Date.now()}_${randHex(4)}`
      const ts = Date.now()
      if (groupKey) {
        void encryptMessage(groupKey, text).then(({ data, iv }) =>
          safeSend(JSON.stringify({ kind: 'chat', id, ts, encrypted: true, data, iv })))
      } else {
        if (pendingChat.length < MAX_PENDING) {
          pendingChat.push({ id, ts, text })
        }
      }
    },
    requestCompute(prompt) {
      const id = `c_${Date.now()}_${randHex(4)}`
      safeSend(JSON.stringify({ kind: 'compute_request', id, ts: Date.now(), body: prompt }))
      return id
    },
    disconnect() {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
      try { ws?.close() } catch { /* ignore */ }
      setState('disconnected')
    },
    getState: () => state,
    getPeerId: () => peerId,
    isEncrypted: () => groupKey !== null,
  }
}
