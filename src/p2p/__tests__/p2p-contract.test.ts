// TV-03 阶段二：P2P 跨仓契约机器校验（DRIFT-LEDGER D-18）——tavern（对拍）侧
//
// 契约向量唯一规范源在 fati 仓 `src/p2p/__contracts__/p2p-contract.json`；
// 本仓同名路径是逐字节 vendor 副本（scripts/check-p2p-contract-vendor-sync.mjs 把关，
// 禁止手改）。生产代码不得读取该 JSON——它只服务测试。
//
// 本文件断言（tavern 侧）：
//   ① verifyFrameSignature 接受「fati 算法签出的向量签名」（纯函数层，跨仓互操作）
//   ①b 契约镜像对 signatureFormat 全用例成立（含含 | 的「不转义」例）——与 fati 侧断言①对齐
//   ② 复用 FakeWS（手法取自 groupkey-signature.test.ts:29-97）走完整握手：
//      向量确定性 JWK 作算力端签名者 + realEncryptedGroupKey 真密文 → _e2e_ready 为真
//      ⚠️ 必须用真密文：假密文下 fail-open 实现同样发不出 _e2e_ready，断言假绿
//      （见 groupkey-signature.test.ts 文件头血泪记录）
//   ③ 篡改 sig 首/中字节 → 不建会（否例，防永真）
//   ④ createInvite 产票字段名集合 == 向量字段集（只比名字，jti/exp 非确定不比值）
//   ⑤ client.ts 源码提取的接收 case 集合 == 向量词表（静态提取，不改生产代码）
//
// ⑤ 的解析规则：对 client.ts 源文本用正则 /\bcase\s+'([a-z_]+)'\s*:/g 提取
// handleMessage 接收分支字面量去重排序。提取为空集一律判失败（防正则失效后
// 「空 == 空」永真假绿）。_e2e_ready/_state_change 等是 emit 出的内部伪 kind
// （非 case 标签），不会被本正则捕获，与词表无冲突。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createP2PClient, type P2PMessage } from '../client'
import {
  generateEcdhKeyPair,
  encryptGroupKeyForPeer,
  generateGroupKey,
  type EcdhKeyPair,
} from '../crypto'
import { verifyFrameSignature, createInvite, generateKeyPair, b64urlEncode } from '../token'

const CONTRACT = JSON.parse(
  readFileSync(fileURLToPath(new URL('../__contracts__/p2p-contract.json', import.meta.url)), 'utf8'),
) as {
  signatureFormat: {
    function: string
    cases: { name: string; serverPub: string; data: string; iv: string; expected: string }[]
  }
  interopVector: {
    signerJwk: JsonWebKey
    signerPubB64: string
    serverPub: string
    data: string
    iv: string
    sigMsg: string
    sig: string
  }
  invitePayloadFields: string[]
  kinds: { computeSideProduces: string[]; clientReceives: string[] }
}

// ── FakeWS 基础设施（逐字取自 __tests__/groupkey-signature.test.ts，保持同款语义）──
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
afterEach(() => { vi.unstubAllGlobals() })

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

/**
 * 契约镜像：fati `groupKeySigMessage` 的逐字形态（来源=契约向量）。
 * tavern 生产侧不改（client.ts:197 内联格式属方案 B 范围），测试侧以向量锚定：
 * 若向量格式漂移 → 本镜像的锚断言红；若 client 内联格式漂移 → 握手断言红。
 */
const contractSigMsg = (serverPub: string, data: string, iv: string) =>
  `group_key|${serverPub}|${data}|${iv}`

/** 用向量确定性 JWK 构造算力端签名者（跨仓互操作：签法=fati signWithKey 同一算法原语） */
function makeVectorSigner() {
  const v = CONTRACT.interopVector
  return {
    pubB64: v.signerPubB64,
    sign: async (msg: string) => {
      const key = await crypto.subtle.importKey('jwk', v.signerJwk, 'Ed25519', false, ['sign'])
      const s = await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(msg))
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

/** 用服务端 ECDH 私钥加密一个真实群组密钥（客户端确实解得开——判别力所在，见文件头 ⚠️） */
async function realEncryptedGroupKey(serverEcdh: EcdhKeyPair, clientEcdhPub: string) {
  const groupKey = await generateGroupKey()
  return encryptGroupKeyForPeer(serverEcdh.privateKey, clientEcdhPub, groupKey)
}

/** 测试本地 b64url 解码（tavern token.ts 未导出 decode，测试自备，不碰生产代码） */
function b64urlDecodeLocal(s: string): string {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  return atob(b64)
}

describe('TV-03 P2P 跨仓契约（tavern 对拍侧）', () => {
  it('① verifyFrameSignature 接受 fati 算法签出的契约向量签名（C-1 纯函数层）', async () => {
    const v = CONTRACT.interopVector
    expect(await verifyFrameSignature(v.signerPubB64, v.sig, v.sigMsg)).toBe(true)
  })

  // ①b：与 fati 侧断言①「同样断言」的补齐（互检 DEFECT 修复，2026-09-11 总管）。
  // 缺口：原用例②的锚定只覆盖 interopVector 单一输入点（三个参数均为标准 b64url、不含 `|`），
  // 若有人给 client.ts:197 与测试镜像 contractSigMsg 同时加转义（如 .replace(/\|/g,'%7C')），
  // 因所有输入都不含 `|`，锚定与握手都会通过 → 契约的「不转义」条款被破坏而两侧全绿。
  // 本用例遍历 signatureFormat.cases 全部用例（含第 3 例显式带 `|`），把该漂移钉死。
  it('①b 契约镜像对 signatureFormat 全用例成立（含含 | 的"不转义"例）', () => {
    const cases = CONTRACT.signatureFormat.cases
    // 空集守卫：向量被清空时判失败，而非「空 == 空」假绿
    expect(cases.length).toBeGreaterThan(0)
    for (const c of cases) {
      expect(contractSigMsg(c.serverPub, c.data, c.iv)).toBe(c.expected)
    }
  })

  it('② 契约镜像锚定 + 完整握手：向量确定性密钥签名 + 真密文 → _e2e_ready（跨仓互操作主断言）', async () => {
    const v = CONTRACT.interopVector
    // 锚：测试内契约镜像必须复现向量 sigMsg（向量格式一变，这里先红）
    expect(contractSigMsg(v.serverPub, v.data, v.iv)).toBe(v.sigMsg)

    const signer = makeVectorSigner()
    const h = createP2PClient(fakeToken(signer.pubB64), 'ws://127.0.0.1:8081')
    const got: P2PMessage[] = []
    h.onMessage(m => got.push(m))
    const ws = FakeWS.instances[0]
    const { serverEcdh, clientEcdhPub } = await primeEcdh(ws)

    // 真密文 + 契约镜像格式 + 向量确定性 JWK 签名 —— client.ts 内联格式一旦漂移即红
    const enc = await realEncryptedGroupKey(serverEcdh, clientEcdhPub)
    const sig = await signer.sign(contractSigMsg(serverEcdh.publicKeyB64, enc.data, enc.iv))
    ws.receive({ kind: 'group_key', serverPub: serverEcdh.publicKeyB64, encrypted: enc, sig })
    await flush()

    expect(got.some(m => m.kind === '_e2e_ready')).toBe(true)
    h.disconnect()
  })

  it('③ 篡改 sig 首/中字节 → 不建会（否例，防 ② 永真）', async () => {
    const signer = makeVectorSigner()
    const h = createP2PClient(fakeToken(signer.pubB64), 'ws://127.0.0.1:8081')
    const got: P2PMessage[] = []
    h.onMessage(m => got.push(m))
    const ws = FakeWS.instances[0]
    const { serverEcdh, clientEcdhPub } = await primeEcdh(ws)

    const enc = await realEncryptedGroupKey(serverEcdh, clientEcdhPub)
    const sig = await signer.sign(contractSigMsg(serverEcdh.publicKeyB64, enc.data, enc.iv))
    // 互检 DEFECT-TV03-01 订正（2026-09-11 总管）：原标题称「任一字节」而实现只改首字节。
    // 现取「首/中」两处各篡改一次，均须被拒；表述与实现一致，且覆盖两端。
    // ⚠️ 刻意避开 b64url 末字符：其含填充位，翻转后解码字节可不变、验签仍通过（阶段一互检
    //    XC-1 已记录的陷阱——断言粒度须按「字节」，不能按「字符」）。
    for (const pos of [0, Math.floor(sig.length / 2)]) {
      const flip = sig[pos] === 'A' ? 'B' : 'A'
      const tampered = sig.slice(0, pos) + flip + sig.slice(pos + 1)
      expect(tampered).not.toBe(sig)
      ws.receive({ kind: 'group_key', serverPub: serverEcdh.publicKeyB64, encrypted: enc, sig: tampered })
      await flush()
      expect(got.some(m => m.kind === '_e2e_ready')).toBe(false)
    }
    h.disconnect()
  })

  it('④ createInvite 产票字段名集合与向量一致（C-2，只比名字不比值）', async () => {
    const kp = await generateKeyPair()
    const token = await createInvite(kp, { endpoint: 'ws://127.0.0.1:8081/p2p/contract' })
    const payload = JSON.parse(b64urlDecodeLocal(token.split('.')[0])) as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(CONTRACT.invitePayloadFields)
  })

  it('⑤ client.ts 接收 case 集合与向量词表一致（C-4，静态提取）', () => {
    // 解析规则见文件头；源码路径相对本测试文件，避免依赖 cwd
    const src = readFileSync(fileURLToPath(new URL('../client.ts', import.meta.url)), 'utf8')
    const kinds = [...src.matchAll(/\bcase\s+'([a-z_]+)'\s*:/g)].map(m => m[1])
    // 空集守卫：正则失效（如 case 改双引号）时必须红，而非「空==空」假绿
    expect(kinds.length, 'client.ts 提取到 0 个 case 字面量——正则与源码形态失配，本断言已失效').toBeGreaterThan(0)
    expect([...new Set(kinds)].sort()).toEqual(CONTRACT.kinds.clientReceives)
  })
})
