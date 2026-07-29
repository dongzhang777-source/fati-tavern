// ─── P2P 邀请票（token）模块 ─────────────────────────────
// M2 地基：算力端生成"带 Ed25519 签名的入场券"，朋友端本地验章。
// 去中心化：验票不依赖任何中心服务器，只靠密码学（票自带公钥）。
// 对应 community-roadmap 二之六「1. token 结构」。
//
// 运行环境：浏览器 / Electron 均原生支持 WebCrypto(Ed25519)，无需第三方库。
// 将来 Capacitor：可在此切换原生 crypto 插件，对外接口不变。
//
// 票据（base64url 编码）：
//   token = b64url(payloadJson) + "." + b64url(signature)
//   payload = { ep, pk, caps, exp, n }

export interface InvitePayload {
  ep: string // 算力端接入点 wss://... 或经 relay
  pk: string // 算力端公钥（base64url，验签用）
  caps: string[] // 授权范围，如 ["chat","compute"]
  exp: number // 过期时间戳（秒）
  n: 'multi' | 'single' // 多次 / 单次用
  jti: string // 票唯一 id（revoke / 单次用追踪用）
}

export interface KeyPair {
  publicKey: string // base64url
  privateKey: CryptoKey | JsonWebKey // 私钥（仅算力端持有，不外泄）
}

// ─── base64url 工具 ───────────────────────────────────────
function b64urlEncode(buf: ArrayBuffer | string): string {
  let bytes: Uint8Array
  if (typeof buf === 'string') bytes = new TextEncoder().encode(buf)
  else bytes = new Uint8Array(buf as ArrayBuffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): Uint8Array {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function toBuf(u8: Uint8Array): ArrayBuffer {
  return (u8.buffer as ArrayBuffer).slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}

function genJti(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return b64urlEncode(toBuf(b))
}

// ─── 域名与协议提取/校验工具 ──────────────────────────────
export function trustedRelayHosts(): string[] {
  const hosts = ['127.0.0.1', 'localhost']
  try {
    const userRelay = localStorage.getItem('tavern-p2p-relay')
    if (userRelay) {
      const u = new URL(userRelay.replace(/^ws/, 'http'))
      if (u.hostname && !hosts.includes(u.hostname.toLowerCase())) {
        hosts.push(u.hostname.toLowerCase())
      }
    }
  } catch { /* ignore */ }
  return hosts
}

export function isValidRelayUrl(url: string): boolean {
  try {
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) return false
    return true
  } catch {
    return false
  }
}

export function extractRelayUrlFromToken(token: string): string | null {
  try {
    const [payloadB64] = token.split('.')
    if (!payloadB64) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as InvitePayload
    if (!payload.ep) return null
    // 去掉 /p2p/<room> 后缀只留 base relay URL
    const p2pIdx = payload.ep.lastIndexOf('/p2p/')
    const relayUrl = p2pIdx !== -1 ? payload.ep.slice(0, p2pIdx) : payload.ep
    if (!isValidRelayUrl(relayUrl)) {
      return null
    }
    return relayUrl
  } catch {
    return null
  }
}

// ─── 密钥生成（算力端本地一次性）─────────────────────────
export async function generateKeyPair(): Promise<KeyPair> {
  const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])
  const publicKey = (await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
  return {
    publicKey: b64urlEncode(publicKey),
    privateKey: privateJwk,
  }
}

// ─── 生成邀请票 ──────────────────────────────────────────
export async function createInvite(
  kp: KeyPair,
  opts: { endpoint: string; caps?: string[]; ttlSeconds?: number; singleUse?: boolean }
): Promise<string> {
  const payload: InvitePayload = {
    ep: opts.endpoint,
    pk: kp.publicKey,
    caps: opts.caps ?? ['chat', 'compute'],
    exp: Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 86400),  // 默认 24h
    n: opts.singleUse ? 'single' : 'multi',
    jti: genJti(),
  }
  const payloadB64 = b64urlEncode(JSON.stringify(payload))
  const privKey = (typeof kp.privateKey === 'object' && kp.privateKey !== null && 'type' in kp.privateKey)
    ? (kp.privateKey as CryptoKey)
    : await crypto.subtle.importKey('jwk', kp.privateKey as JsonWebKey, 'Ed25519', false, ['sign'])
  const sig = await crypto.subtle.sign('Ed25519', privKey, toBuf(new TextEncoder().encode(payloadB64)))
  return `${payloadB64}.${b64urlEncode(sig)}`
}

// ─── 验证邀请票（朋友端，纯本地、不联网）─────────────────
export interface VerifyResult {
  ok: boolean
  reason?: string
  payload?: InvitePayload
}

export async function verifyInvite(token: string): Promise<VerifyResult> {
  try {
    const [payloadB64, sigB64] = token.split('.')
    if (!payloadB64 || !sigB64) return { ok: false, reason: 'token 格式错误' }
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as InvitePayload

    // 1. 过期检查
    if (Math.floor(Date.now() / 1000) > payload.exp) {
      return { ok: false, reason: 'token 已过期', payload }
    }
    // 2. 验签（用票自带公钥）
    const pubKey = await crypto.subtle.importKey(
      'raw',
      toBuf(b64urlDecode(payload.pk)),
      'Ed25519',
      false,
      ['verify']
    )
    const valid = await crypto.subtle.verify(
      'Ed25519',
      pubKey,
      toBuf(b64urlDecode(sigB64)),
      toBuf(new TextEncoder().encode(payloadB64))
    )
    if (!valid) return { ok: false, reason: '签名无效（票被篡改或非持私钥者发）', payload }
    return { ok: true, payload }
  } catch (e) {
    return { ok: false, reason: `验票异常：${(e as Error).message}` }
  }
}

// ─── keypair 持久化（IndexedDB 不可导出 CryptoKey / localStorage 降级）──
const LS_KEYPAIR_KEY = 'tavern-p2p-keypair'

function openKeyPairDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
    const req = indexedDB.open('fati-p2p-keys', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('keypair')) db.createObjectStore('keypair')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getKeyPairFromIDB(): Promise<KeyPair | null> {
  try {
    const db = await openKeyPairDB()
    const result = await new Promise<KeyPair | null>((resolve, reject) => {
      const tx = db.transaction('keypair', 'readonly')
      const req = tx.objectStore('keypair').get('current')
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return result
  } catch {
    return null
  }
}

async function saveKeyPairToIDB(kp: KeyPair): Promise<boolean> {
  try {
    const db = await openKeyPairDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('keypair', 'readwrite')
      const req = tx.objectStore('keypair').put(kp, 'current')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    db.close()
    return true
  } catch {
    return false
  }
}

/** 读取本机长期 Ed25519 密钥对；优先从 IndexedDB 读取不可导出 (extractable: false) CryptoKey，降级读取 localStorage */
export async function loadOrCreateKeyPair(): Promise<KeyPair> {
  const idbKp = await getKeyPairFromIDB()
  if (idbKp && idbKp.publicKey && idbKp.privateKey) return idbKp

  try {
    const raw = localStorage.getItem(LS_KEYPAIR_KEY)
    if (raw) {
      const kp = JSON.parse(raw)
      if (typeof kp.publicKey === 'string' && kp.privateKey) return kp as KeyPair
    }
  } catch { /* ignore */ }

  try {
    const kp = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify'])
    const publicKey = (await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer
    const keyPair: KeyPair = {
      publicKey: b64urlEncode(publicKey),
      privateKey: kp.privateKey,
    }
    const saved = await saveKeyPairToIDB(keyPair)
    if (saved) return keyPair
  } catch { /* ignore and fallback */ }

  const kp = await generateKeyPair()
  try { localStorage.setItem(LS_KEYPAIR_KEY, JSON.stringify(kp)) } catch { /* ignore */ }
  return kp
}
