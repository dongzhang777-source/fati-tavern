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
const MAX_WS_MESSAGE_SIZE = 256 * 1024 // 256KB — 超过此大小的帧直接丢弃并关闭连接
const RATE_LIMIT_TOKENS = 10 // 令牌桶容量
const RATE_LIMIT_REFILL_MS = 100 // 每 100ms 补充 1 个令牌 → 10 msg/s
const COMPUTE_TIMEOUT_MS = 30_000 // 算力请求超时 30s

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
  // 保留 pending 队列以兼容 group_key 握手路径；重连时清空（QNEW-5）
  const pendingChat: Array<{ id: string; ts: number; text: string }> = []
  const pendingCompute: Array<{ id: string; ts: number; prompt: string }> = []
  let rateTokens = RATE_LIMIT_TOKENS
  let rateLastRefill = Date.now()
  const url = relayUrl || extractRelayUrlFromToken(token) || DEFAULT_RELAY

  // QNEW-2: 跟踪进行中的算力请求，30s 超时后 reject
  const computeTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function emit(m: P2PMessage) { for (const cb of listeners) cb(m) }

  function setState(s: ClientState) {
    if (state === s) return
    state = s
    emit({ kind: '_state_change', state: s })
  }

  function flushPending() {
    while (pending.length && ws && ws.readyState === WebSocket.OPEN) ws.send(pending.shift()!)
  }

  /** 令牌桶限速：返回当前可用令牌数（0 = 需等待） */
  function consumeRateToken(): boolean {
    const now = Date.now()
    const elapsed = now - rateLastRefill
    rateTokens = Math.min(RATE_LIMIT_TOKENS, rateTokens + Math.floor(elapsed / RATE_LIMIT_REFILL_MS))
    // N-B3: 保留不满窗口的余数，不丢弃 elapsed 余数
    rateLastRefill += Math.floor(elapsed / RATE_LIMIT_REFILL_MS) * RATE_LIMIT_REFILL_MS
    if (rateTokens <= 0) return false
    rateTokens--
    return true
  }

  /** 带限速的 ws.send；超限时延迟后重新走令牌桶（N-B4: 递归调用而非直接 send） */
  function rateLimitedSend(json: string) {
    if (consumeRateToken()) { ws!.send(json) }
    else {
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) rateLimitedSend(json)
      }, RATE_LIMIT_REFILL_MS)
    }
  }

  // N-B1 修正：保留加密，同时附加 body 明文字段供桌面端直读
  async function flushPendingChat() {
    while (pendingChat.length) {
      const item = pendingChat.shift()!
      if (groupKey) {
        try {
          const { data, iv } = await encryptMessage(groupKey, item.text)
          safeSend(JSON.stringify({ kind: 'chat', id: item.id, ts: item.ts, body: item.text, encrypted: true, data, iv }))
        } catch { /* 加密失败降级为明文 */
          safeSend(JSON.stringify({ kind: 'chat', id: item.id, ts: item.ts, body: item.text }))
        }
      } else {
        safeSend(JSON.stringify({ kind: 'chat', id: item.id, ts: item.ts, body: item.text }))
      }
    }
  }

  async function flushPendingCompute() {
    while (pendingCompute.length) {
      const item = pendingCompute.shift()!
      if (groupKey) {
        try {
          const { data, iv } = await encryptMessage(groupKey, item.prompt)
          safeSend(JSON.stringify({ kind: 'compute_request', id: item.id, ts: item.ts, body: item.prompt, encrypted: true, data, iv }))
        } catch { /* 加密失败降级为明文 */
          safeSend(JSON.stringify({ kind: 'compute_request', id: item.id, ts: item.ts, body: item.prompt }))
        }
      } else {
        safeSend(JSON.stringify({ kind: 'compute_request', id: item.id, ts: item.ts, body: item.prompt }))
      }
    }
  }

  function safeSend(json: string) {
    if (state === 'joined' && ws && ws.readyState === WebSocket.OPEN) rateLimitedSend(json)
    else if (pending.length < MAX_PENDING) pending.push(json)
    // 超限时丢弃最旧帧并通知
    else { pending.shift(); pending.push(json); emit({ kind: '_queue_overflow', queue: 'raw' }) }
  }

  async function handleMessage(msg: P2PMessage) {
    switch (msg.kind) {
      case 'welcome':
        peerId = msg.peerId as string
        retryCount = 0
        setState('joined')
        flushPending()
        // 连接建立后刷新排队的 chat / compute（明文，此时尚无 groupKey）
        flushPendingChat()
        flushPendingCompute()
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
          // 握手完成后刷新排队中的 chat / compute（加密 + body 明文并存）
          void flushPendingChat()
          void flushPendingCompute()
        } catch { /* relay 是广播，这份密文不是发给我的 */ }
        return
      }
      case 'chat': {
        // 优先尝试解密（tavern-to-tavern E2E），失败则回退读 body 明文
        if (msg.encrypted === true && groupKey) {
          try {
            const decrypted = await decryptMessage(groupKey, { data: msg.data as string, iv: msg.iv as string })
            emit({ ...msg, body: decrypted })
            return
          } catch { /* 解密失败，回退读 body 字段 */ }
        }
        emit(msg)
        return
      }
      case 'compute_result': {
        // N-B1 修正：保留解密分支，桌面端可能发加密结果
        if (msg.encrypted === true && groupKey) {
          try {
            const decrypted = await decryptMessage(groupKey, { data: msg.data as string, iv: msg.iv as string })
            emit({ ...msg, body: decrypted })
            return
          } catch { /* 解密失败，回退读 body 字段 */ }
        }
        const reqId = String(msg.reqId || msg.id || '')
        // QNEW-2: 收到结果后清除超时计时器
        const timer = computeTimers.get(reqId)
        if (timer) { clearTimeout(timer); computeTimers.delete(reqId) }
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
      // N-B7: 消息大小限制——同时检查 string / ArrayBuffer / Blob
      let tooLarge = false
      if (typeof ev.data === 'string') {
        tooLarge = ev.data.length > MAX_WS_MESSAGE_SIZE
      } else if (ev.data instanceof ArrayBuffer) {
        tooLarge = ev.data.byteLength > MAX_WS_MESSAGE_SIZE
      } else if (typeof Blob !== 'undefined' && ev.data instanceof Blob) {
        tooLarge = ev.data.size > MAX_WS_MESSAGE_SIZE
      }
      if (tooLarge) {
        console.warn(`[p2p] 收到超大消息，关闭连接`)
        try { ws?.close(1009, 'message too large') } catch { /* ignore */ }
        return
      }
      let msg: P2PMessage
      try { msg = JSON.parse(String(ev.data)) } catch (e) { console.warn('[p2p] JSON.parse 失败，忽略此帧', e); return }
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
      // QNEW-5: 重连前清空 pending 队列——断连前的消息可能已过时，不应在重连后发送
      pendingChat.length = 0
      pendingCompute.length = 0
      pending.length = 0 // 补漏：raw 帧队列（握手前入队的加密帧）一并清空，避免重连后 flush 旧帧
      connect()
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  connect()

  return {
    onMessage(cb) { listeners.add(cb); return () => { listeners.delete(cb) } },
    // N-B1 修正：加密 + body 明文并存，桌面端直读 body，tavern 解密 data
    sendChat(text) {
      const id = `m_${Date.now()}_${randHex(4)}`
      const ts = Date.now()
      if (state !== 'joined' || !ws || ws.readyState !== WebSocket.OPEN) {
        if (pendingChat.length >= MAX_PENDING) {
          pendingChat.shift()
          emit({ kind: '_queue_overflow', queue: 'chat' })
        }
        pendingChat.push({ id, ts, text })
      } else if (groupKey) {
        // 加密 + body 明文并存
        void encryptMessage(groupKey, text).then(({ data, iv }) =>
          safeSend(JSON.stringify({ kind: 'chat', id, ts, body: text, encrypted: true, data, iv }))
        ).catch(() =>
          safeSend(JSON.stringify({ kind: 'chat', id, ts, body: text }))
        )
      } else {
        safeSend(JSON.stringify({ kind: 'chat', id, ts, body: text }))
      }
    },
    // N-B1 修正：加密 + body 明文并存
    requestCompute(prompt) {
      const id = `c_${Date.now()}_${randHex(4)}`
      const ts = Date.now()
      // QNEW-2: 30s 超时，超时后标记取消并通知 UI
      const timer = setTimeout(() => {
        computeTimers.delete(id)
        emit({ kind: '_compute_timeout', id })
      }, COMPUTE_TIMEOUT_MS)
      computeTimers.set(id, timer)
      if (state !== 'joined' || !ws || ws.readyState !== WebSocket.OPEN) {
        if (pendingCompute.length >= MAX_PENDING) {
          pendingCompute.shift()
          emit({ kind: '_queue_overflow', queue: 'compute' })
        }
        pendingCompute.push({ id, ts, prompt })
      } else if (groupKey) {
        // 加密 + body 明文并存
        void encryptMessage(groupKey, prompt).then(({ data, iv }) =>
          safeSend(JSON.stringify({ kind: 'compute_request', id, ts, body: prompt, encrypted: true, data, iv }))
        ).catch(() =>
          safeSend(JSON.stringify({ kind: 'compute_request', id, ts, body: prompt }))
        )
      } else {
        safeSend(JSON.stringify({ kind: 'compute_request', id, ts, body: prompt }))
      }
      return id
    },
    disconnect() {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      // QNEW-2: 断开时清除所有算力超时计时器
      for (const t of computeTimers.values()) clearTimeout(t)
      computeTimers.clear()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
      try { ws?.close() } catch { /* ignore */ }
      setState('disconnected')
    },
    getState: () => state,
    getPeerId: () => peerId,
    isEncrypted: () => groupKey !== null,
  }
}
