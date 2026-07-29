import { describe, it, expect } from 'vitest'
import {
  generateGroupKey, encryptMessage, decryptMessage,
  generateEcdhKeyPair, encryptGroupKeyForPeer, decryptGroupKeyFromPeer,
} from '../crypto'

describe('crypto 群聊加密', () => {
  it('AES-256-GCM 加解密往返', async () => {
    const key = await generateGroupKey()
    const enc = await encryptMessage(key, '你好，肥猫酒馆')
    expect(enc.data).not.toContain('你好')
    expect(atob(enc.iv).length).toBe(12)
    expect(await decryptMessage(key, enc)).toBe('你好，肥猫酒馆')
  })

  it('错误密钥解密抛错', async () => {
    const k1 = await generateGroupKey()
    const k2 = await generateGroupKey()
    const enc = await encryptMessage(k1, 'secret')
    await expect(decryptMessage(k2, enc)).rejects.toThrow()
  })

  it('ECDH 群密钥分发往返（模拟 server→client）', async () => {
    const server = await generateEcdhKeyPair()
    const client = await generateEcdhKeyPair()
    const groupKey = await generateGroupKey()
    const enc = await encryptGroupKeyForPeer(server.privateKey, client.publicKeyB64, groupKey)
    const got = await decryptGroupKeyFromPeer(client.privateKey, server.publicKeyB64, enc)
    expect(got).toBe(groupKey)
  })

  it('无关第三方解不开群密钥（对应 relay 广播场景）', async () => {
    const server = await generateEcdhKeyPair()
    const client = await generateEcdhKeyPair()
    const other = await generateEcdhKeyPair()
    const enc = await encryptGroupKeyForPeer(server.privateKey, client.publicKeyB64, await generateGroupKey())
    await expect(decryptGroupKeyFromPeer(other.privateKey, server.publicKeyB64, enc)).rejects.toThrow()
  })

  it('超大文本加解密 (>64KB) 不触发 RangeError 堆栈溢出', async () => {
    const key = await generateGroupKey()
    const largeText = 'A'.repeat(100_000)
    const enc = await encryptMessage(key, largeText)
    const dec = await decryptMessage(key, enc)
    expect(dec.length).toBe(100_000)
    expect(dec).toBe(largeText)
  })
})
