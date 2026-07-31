import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  generateKeyPair, createInvite, verifyInvite,
  extractRelayUrlFromToken, loadOrCreateKeyPair, isValidRelayUrl,
} from '../token'

// node 环境无 localStorage，用内存实现打桩
const mem = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v) },
  removeItem: (k: string) => { mem.delete(k) },
})

beforeEach(() => mem.clear())

describe('token 票据', () => {
  it('签发的票据能通过验签，payload 字段齐全', async () => {
    const kp = await generateKeyPair()
    const token = await createInvite(kp, { endpoint: 'ws://127.0.0.1:8081/p2p/room1' })
    const r = await verifyInvite(token)
    expect(r.ok).toBe(true)
    expect(r.payload!.ep).toBe('ws://127.0.0.1:8081/p2p/room1')
    expect(r.payload!.caps).toEqual(['chat', 'compute'])
    expect(r.payload!.n).toBe('multi')
    expect(r.payload!.jti.length).toBeGreaterThanOrEqual(16)
  })

  it('过期票据验签失败', async () => {
    const kp = await generateKeyPair()
    const token = await createInvite(kp, { endpoint: 'ws://127.0.0.1:8081/p2p/r', ttlSeconds: -10 })
    const r = await verifyInvite(token)
    expect(r.ok).toBe(false)
  })

  it('篡改 payload 后验签失败', async () => {
    const kp = await generateKeyPair()
    const token = await createInvite(kp, { endpoint: 'ws://127.0.0.1:8081/p2p/r' })
    const [, sig] = token.split('.')
    const fake = btoa(JSON.stringify({ ep: 'ws://evil:1/p2p/x', pk: 'x', caps: [], exp: 9e9, n: 'multi', jti: 'a' }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const r = await verifyInvite(`${fake}.${sig}`)
    expect(r.ok).toBe(false)
  })

  it('extractRelayUrlFromToken：localhost 放行、去掉 /p2p/<room> 路径', async () => {
    const kp = await generateKeyPair()
    const token = await createInvite(kp, { endpoint: 'ws://127.0.0.1:8081/p2p/abcd1234' })
    expect(extractRelayUrlFromToken(token)).toBe('ws://127.0.0.1:8081')
  })

  it('extractRelayUrlFromToken：任意合法 wss/ws endpoint 正常提取（去掉 /p2p/<room> 路径）', async () => {
    const kp = await generateKeyPair()
    const token = await createInvite(kp, { endpoint: 'wss://relay.example.com:8082/p2p/abcd1234' })
    expect(extractRelayUrlFromToken(token)).toBe('wss://relay.example.com:8082')
  })

  it('loadOrCreateKeyPair：首次生成并持久化，二次返回同一对', async () => {
    const kp1 = await loadOrCreateKeyPair()
    const kp2 = await loadOrCreateKeyPair()
    expect(kp2.publicKey).toBe(kp1.publicKey)
    expect(mem.has('tavern-p2p-keypair')).toBe(true)
  })
})

describe('isValidRelayUrl 严格验证', () => {
  it('合法 ws/wss URL 通过', () => {
    expect(isValidRelayUrl('ws://127.0.0.1:8081')).toBe(true)
    expect(isValidRelayUrl('wss://relay.example.com')).toBe(true)
    expect(isValidRelayUrl('ws://localhost:3000/p2p/room')).toBe(true)
  })

  it('畸形 URL 拒绝', () => {
    expect(isValidRelayUrl('ws://')).toBe(false)
    expect(isValidRelayUrl('ws://[invalid')).toBe(false)
    expect(isValidRelayUrl('not-a-url')).toBe(false)
    expect(isValidRelayUrl('http://example.com')).toBe(false)
    expect(isValidRelayUrl('')).toBe(false)
  })
})
