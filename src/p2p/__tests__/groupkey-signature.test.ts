// P0 回归（2026-09-11）：group_key 帧签名 fail-closed
//
// 漏洞成因：原实现是「帧带 sig 才验签，无 sig 直接放行」——
// 中转方（relay）**只需删掉 sig 字段**即可绕过唯一防线，
// 用自己替换的 ECDH 公钥重新加密群组密钥骗过客户端。
//
// 本文件钉住四件事（缺一不可）：
//   ① 无 sig 的帧 → 拒绝（漏洞本体，必须永久拦住）
//   ② 票内无算力端公钥 → 拒绝（不留 fail-open 分支）
//   ③ 签名不匹配 → 拒绝
//   ④ 合法签名 → **正常建立会话**（防止改过头把功能一起堵死）
//
// ⚠️⚠️ 关键构造纪律（2026-09-11 验收教训，勿回退）：
//   ① / ② 必须用**真实可解开的密文**（用服务端 ECDH 私钥加密真群组密钥）。
//   若图省事用假密文（如 { data: 'D', iv: 'I' }），无 sig 帧在 fail-open 实现下
//   **解密也会失败**，于是同样发不出 `_e2e_ready`，断言照样通过 —— 测试变假绿。
//   实测记录：用假密文时把实现改回 fail-open，20 文件 / 229 用例全部通过；
//   换真密文后同一变异下 ① / ② 立即变红（`expected true to be false`）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createP2PClient, type P2PMessage } from '../client'
import {
  generateEcdhKeyPair,
  encryptGroupKeyForPeer,
  generateGroupKey,
  type EcdhKeyPair,
} from '../crypto'
import { b64urlEncode } from '../token'

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
  open() { this.readyState = 1; this.onopen?.() }
  receive(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }) }
  allSent() { return this.sent.map(s => JSON.parse(s)) }
}

const flush = () => new Promise(r => setTimeout(r, 15))

beforeEach(() => { FakeWS.instances = []; vi.stubGlobal('WebSocket', FakeWS) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

/** 构造一张「票」：客户端只用它取 pk（票的签名由 relay 校验，此处不涉及） */
function fakeToken(pk: string): string {
  const payload = {
    ep: 'ws://127.0.0.1:8081/p2p/test-room',
    pk,
    caps: ['chat', 'compute'],
    exp: Math.floor(Date.now() / 1000) + 3600,
    n: 'multi',
    jti: 'test-jti',
  }
  return `${b64urlEncode(JSON.stringify(payload))}.FAKESIG`
}

/** 模拟算力端的 Ed25519 密钥对（票内 pk 即其公钥） */
async function makeComputeSigner() {
  const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  const pubRaw = await crypto.subtle.exportKey('raw', kp.publicKey)
  return {
    pubB64: b64urlEncode(pubRaw),
    sign: async (msg: string) => {
      const s = await crypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(msg))
      return b64urlEncode(s)
    },
  }
}

/** 走完 ECDH 握手前置：client 发出 ecdh_pub；返回服务端 ECDH 密钥对 + 客户端公钥 */
async function primeEcdh(clientWs: FakeWS): Promise<{ serverEcdh: EcdhKeyPair; clientEcdhPub: string }> {
  clientWs.open()
  clientWs.receive({ kind: 'welcome', peerId: 'p1', peers: [] })
  await flush()
  const serverEcdh = await generateEcdhKeyPair()
  clientWs.receive({ kind: 'ecdh_pub', pub: serverEcdh.publicKeyB64 })
  await flush()
  const sentEcdh = clientWs.allSent().find(m => m.kind === 'ecdh_pub')
  expect(sentEcdh).toBeTruthy()
  return { serverEcdh, clientEcdhPub: sentEcdh.pub as string }
}

/**
 * 用服务端 ECDH 私钥加密一个**真实群组密钥**——客户端确实解得开。
 * 这正是让「无 sig 帧」测试具备判别力的关键（见文件头 ⚠️）。
 */
async function realEncryptedGroupKey(serverEcdh: EcdhKeyPair, clientEcdhPub: string) {
  const groupKey = await generateGroupKey()
  return encryptGroupKeyForPeer(serverEcdh.privateKey, clientEcdhPub, groupKey)
}

describe('P0 group_key 帧签名（fail-closed）', () => {
  it('① 无 sig 的 group_key 帧被拒绝（中转方删字段绕过的正是这条）', async () => {
    const signer = await makeComputeSigner()
    const h = createP2PClient(fakeToken(signer.pubB64), 'ws://127.0.0.1:8081')
    const got: P2PMessage[] = []
    h.onMessage(m => got.push(m))
    const ws = FakeWS.instances[0]
    const { serverEcdh, clientEcdhPub } = await primeEcdh(ws)

    // 真密文：fail-open 实现下这条帧会被成功解开并建会 → 断言变红
    const enc = await realEncryptedGroupKey(serverEcdh, clientEcdhPub)
    ws.receive({ kind: 'group_key', serverPub: serverEcdh.publicKeyB64, encrypted: enc })
    await flush()

    expect(got.some(m => m.kind === '_e2e_ready')).toBe(false)
    h.disconnect()
  })

  it('② 票内无算力端公钥时拒绝（不留 fail-open 分支）', async () => {
    const h = createP2PClient('not-a-real-token', 'ws://127.0.0.1:8081')
    const got: P2PMessage[] = []
    h.onMessage(m => got.push(m))
    const ws = FakeWS.instances[0]
    const { serverEcdh, clientEcdhPub } = await primeEcdh(ws)

    // 同样用真密文 + 不带 sig：唯一能拦住它的就是「票内无公钥」这条分支
    const enc = await realEncryptedGroupKey(serverEcdh, clientEcdhPub)
    ws.receive({ kind: 'group_key', serverPub: serverEcdh.publicKeyB64, encrypted: enc })
    await flush()

    expect(got.some(m => m.kind === '_e2e_ready')).toBe(false)
    h.disconnect()
  })

  it('③ 签名不匹配（他人密钥所签）被拒绝', async () => {
    const signer = await makeComputeSigner()
    const attacker = await makeComputeSigner()
    const h = createP2PClient(fakeToken(signer.pubB64), 'ws://127.0.0.1:8081')
    const got: P2PMessage[] = []
    h.onMessage(m => got.push(m))
    const ws = FakeWS.instances[0]
    const { serverEcdh, clientEcdhPub } = await primeEcdh(ws)

    const enc = await realEncryptedGroupKey(serverEcdh, clientEcdhPub)
    const forged = await attacker.sign(
      `group_key|${serverEcdh.publicKeyB64}|${enc.data}|${enc.iv}`,
    )

    ws.receive({ kind: 'group_key', serverPub: serverEcdh.publicKeyB64, encrypted: enc, sig: forged })
    await flush()

    expect(got.some(m => m.kind === '_e2e_ready')).toBe(false)
    h.disconnect()
  })

  it('④ 合法签名（票内公钥可验）→ 正常建立加密会话', async () => {
    const signer = await makeComputeSigner()
    const h = createP2PClient(fakeToken(signer.pubB64), 'ws://127.0.0.1:8081')
    const got: P2PMessage[] = []
    h.onMessage(m => got.push(m))
    const ws = FakeWS.instances[0]
    const { serverEcdh, clientEcdhPub } = await primeEcdh(ws)

    const enc = await realEncryptedGroupKey(serverEcdh, clientEcdhPub)
    const sig = await signer.sign(`group_key|${serverEcdh.publicKeyB64}|${enc.data}|${enc.iv}`)

    ws.receive({ kind: 'group_key', serverPub: serverEcdh.publicKeyB64, encrypted: enc, sig })
    await flush()

    expect(got.some(m => m.kind === '_e2e_ready')).toBe(true)
    h.disconnect()
  })
})
