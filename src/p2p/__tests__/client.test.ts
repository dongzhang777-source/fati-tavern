import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createP2PClient, type P2PMessage } from '../client'
import { generateEcdhKeyPair, generateGroupKey, encryptGroupKeyForPeer, encryptMessage, importEcdhPublicKey } from '../crypto'

class FakeWS {
  static instances: FakeWS[] = []
  static OPEN = 1
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  constructor(public url: string) { FakeWS.instances.push(this) }
  send(d: string) { this.sent.push(d) }
  close() { this.readyState = 3; this.onclose?.() }
  // 测试辅助
  open() { this.readyState = 1; this.onopen?.() }
  receive(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
  lastSent() { return JSON.parse(this.sent[this.sent.length - 1]) }
}

const flush = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  FakeWS.instances = []
  vi.stubGlobal('WebSocket', FakeWS)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('client 连接与状态机', () => {
  it('open 后发送 join，welcome 后 state=joined 且记录 peerId/成员', async () => {
    const h = createP2PClient('tok', 'ws://127.0.0.1:8081')
    const got: P2PMessage[] = []
    h.onMessage(m => got.push(m))
    const ws = FakeWS.instances[0]
    ws.open()
    expect(ws.lastSent()).toEqual({ kind: 'join', token: 'tok' })
    ws.receive({ kind: 'welcome', peerId: 'peer_ab', peers: [{ id: 'peer_srv', isCompute: true }] })
    await flush()
    expect(h.getState()).toBe('joined')
    expect(h.getPeerId()).toBe('peer_ab')
    expect(got.some(m => m.kind === 'welcome')).toBe(true)
  })

  it('在未收到 group_key 前调用 sendChat，Socket 上不会发出 encrypted: false 的明文 chat 帧', async () => {
    const h = createP2PClient('tok', 'ws://127.0.0.1:8081')
    h.sendChat('早发的消息')
    await flush()
    const ws = FakeWS.instances[0]
    ws.open()
    ws.receive({ kind: 'welcome', peerId: 'p1', peers: [] })
    await flush()
    const plainChats = ws.sent.map(s => JSON.parse(s)).filter(m => m.kind === 'chat')
    expect(plainChats.length).toBe(0) // 阻断明文泄露

    // 收到 group_key 握手后加密发出
    const server = await generateEcdhKeyPair()
    const groupKey = await generateGroupKey()
    ws.receive({ kind: 'ecdh_pub', pub: server.publicKeyB64, from: 'peer_srv' })
    await flush()
    await flush()
    const reply = ws.sent.map(s => JSON.parse(s)).find(m => m.kind === 'ecdh_pub')
    const enc = await encryptGroupKeyForPeer(server.privateKey, reply.pub, groupKey)
    ws.receive({ kind: 'group_key', serverPub: server.publicKeyB64, encrypted: enc, from: 'peer_srv' })
    await flush(); await flush(); await flush()

    const encryptedChats = ws.sent.map(s => JSON.parse(s)).filter(m => m.kind === 'chat')
    expect(encryptedChats.length).toBe(1)
    expect(encryptedChats[0].encrypted).toBe(true)
    expect(encryptedChats[0].body).toBeUndefined()
  })

  it('断线指数退避重连 1/2/4/8/16s，5 次后发 _max_retries', async () => {
    vi.useFakeTimers()
    const h = createP2PClient('tok', 'ws://127.0.0.1:8081')
    const got: P2PMessage[] = []
    h.onMessage(m => got.push(m))
    const delays = [1000, 2000, 4000, 8000, 16000]
    for (let i = 0; i < 5; i++) {
      const n = FakeWS.instances.length
      FakeWS.instances[FakeWS.instances.length - 1].close()
      await vi.advanceTimersByTimeAsync(delays[i])
      expect(FakeWS.instances.length).toBe(n + 1)
    }
    FakeWS.instances[FakeWS.instances.length - 1].close()
    expect(got.some(m => m.kind === '_max_retries')).toBe(true)
    h.disconnect()
  })

  it('disconnect 后不再重连', async () => {
    vi.useFakeTimers()
    const h = createP2PClient('tok', 'ws://127.0.0.1:8081')
    h.disconnect()
    const n = FakeWS.instances.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(FakeWS.instances.length).toBe(n)
  })
})

describe('client E2E 状态机', () => {
  it('ecdh_pub → 回公钥 → group_key 解密 → chat 自动加解密', async () => {
    const h = createP2PClient('tok', 'ws://127.0.0.1:8081')
    const got: P2PMessage[] = []
    h.onMessage(m => got.push(m))
    const ws = FakeWS.instances[0]
    ws.open()
    ws.receive({ kind: 'welcome', peerId: 'p1', peers: [] })
    await flush()

    // 模拟 FATI server 侧
    const server = await generateEcdhKeyPair()
    const groupKey = await generateGroupKey()
    ws.receive({ kind: 'ecdh_pub', pub: server.publicKeyB64, from: 'peer_srv' })
    await flush()
    await flush() // 额外 flush 确保 generateEcdhKeyPair 完成
    const reply = ws.sent.map(s => JSON.parse(s)).find(m => m.kind === 'ecdh_pub')
    expect(reply?.pub).toBeTruthy()
    await importEcdhPublicKey(reply.pub) // 公钥格式合法（SPKI base64）

    const enc = await encryptGroupKeyForPeer(server.privateKey, reply.pub, groupKey)
    ws.receive({ kind: 'group_key', serverPub: server.publicKeyB64, encrypted: enc, from: 'peer_srv' })
    await flush(); await flush(); await flush()
    expect(h.isEncrypted()).toBe(true)

    // 出向 chat 加密
    h.sendChat('加密消息')
    await flush(); await flush(); await flush()
    const sent = ws.sent.map(s => JSON.parse(s)).filter(m => m.kind === 'chat')[0]
    expect(sent.encrypted).toBe(true)
    expect(sent.body).toBeUndefined()

    // 入向 chat 解密
    const inc = await encryptMessage(groupKey, '来自桌面端')
    ws.receive({ kind: 'chat', id: 'm_1_x', ts: 1, encrypted: true, data: inc.data, iv: inc.iv, from: 'peer_srv' })
    await flush()
    const chat = got.find(m => m.kind === 'chat' && (m as { body?: string }).body === '来自桌面端')
    expect(chat).toBeTruthy()
  })

  it('解不开的 group_key 静默忽略（relay 广播给了别人）', async () => {
    const h = createP2PClient('tok', 'ws://127.0.0.1:8081')
    const ws = FakeWS.instances[0]
    ws.open()
    ws.receive({ kind: 'welcome', peerId: 'p1', peers: [] })
    const server = await generateEcdhKeyPair()
    ws.receive({ kind: 'ecdh_pub', pub: server.publicKeyB64, from: 'peer_srv' })
    await flush()
    await flush() // 额外 flush 确保 generateEcdhKeyPair 完成
    const stranger = await generateEcdhKeyPair()
    const enc = await encryptGroupKeyForPeer(server.privateKey, stranger.publicKeyB64, await generateGroupKey())
    ws.receive({ kind: 'group_key', serverPub: server.publicKeyB64, encrypted: enc, from: 'peer_srv' })
    await flush()
    expect(h.isEncrypted()).toBe(false)
  })

  it('requestCompute 返回请求 id 且发出明文帧', async () => {
    const h = createP2PClient('tok', 'ws://127.0.0.1:8081')
    const ws = FakeWS.instances[0]
    ws.open()
    ws.receive({ kind: 'welcome', peerId: 'p1', peers: [] })
    await flush()
    const id = h.requestCompute('写一首诗')
    expect(id).toMatch(/^c_\d+_[0-9a-f]{8}$/)
    const frame = ws.sent.map(s => JSON.parse(s)).find(m => m.kind === 'compute_request')
    expect(frame).toEqual({ kind: 'compute_request', id, ts: frame.ts, body: '写一首诗' })
  })
})
