// ─── P2P 端到端加密 ────────────────────────────
// AES-256-GCM 对称加密 + ECDH P-256 密钥交换。
// 在 hub 拓扑中，算力端(server)生成群组密钥，
// 新成员 join 时通过 ECDH 密钥交换获取（relay 无法窃听）。
// Chat 消息加密封装；compute_request/result 明文。
//
// 群组密钥分发流程（M3 ECDH 版）：
//   1. server 广播 ecdh_pub（服务端 ECDH 公钥）
//   2. client 生成自己的 ECDH 密钥对，发 ecdh_pub（客户端 ECDH 公钥）
//   3. server 用 ECDH 共享密钥加密群组密钥，单独发给该 peer
//   4. client 用 ECDH 共享密钥解密得到群组密钥
// 注：relay 只能看到 ECDH 公钥和加密后的群组密钥，无法解密。

/**
 * 将 Uint8Array / ArrayBuffer 安全转换为 Base64 字符串（避免 Spread 操作符导致大 Buffer 堆栈溢出）
 */
export function uint8ToBase64(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  const len = u8.byteLength
  for (let i = 0; i < len; i++) bin += String.fromCharCode(u8[i])
  return btoa(bin)
}

/**
 * 将 Base64 字符串转换为 Uint8Array
 */
export function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * 生成 256 位 AES-GCM 群组密钥。
 * @returns base64 编码的密钥
 */
export async function generateGroupKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
  const raw = await crypto.subtle.exportKey('raw', key)
  return uint8ToBase64(raw)
}

/**
 * 从 base64 密钥字符串导入 CryptoKey。
 */
async function importGroupKey(keyB64: string): Promise<CryptoKey> {
  const raw = base64ToUint8(keyB64)
  return crypto.subtle.importKey('raw', toBuf(raw), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function toBuf(u8: Uint8Array): ArrayBuffer {
  return (u8.buffer as ArrayBuffer).slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
}

/**
 * 加密消息。
 * @param keyB64 base64 编码的 256 位密钥
 * @param plaintext 明文
 * @returns `{ data, iv }` 均为 base64 编码
 */
export async function encryptMessage(
  keyB64: string,
  plaintext: string,
): Promise<{ data: string; iv: string }> {
  const key = await importGroupKey(keyB64)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  )
  return {
    data: uint8ToBase64(encrypted),
    iv: uint8ToBase64(iv),
  }
}

/**
 * 解密消息。
 * @param keyB64 base64 编码的 256 位密钥
 * @param encrypted `{ data, iv }` 均为 base64 编码
 * @returns 明文
 */
export async function decryptMessage(
  keyB64: string,
  encrypted: { data: string; iv: string },
): Promise<string> {
  const key = await importGroupKey(keyB64)
  const ciphertext = base64ToUint8(encrypted.data)
  const iv = base64ToUint8(encrypted.iv)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuf(iv) },
    key,
    toBuf(ciphertext),
  )
  return new TextDecoder().decode(decrypted)
}

// ─── ECDH P-256 密钥交换（保护群组密钥分发）───────────────

export interface EcdhKeyPair {
  publicKey: CryptoKey
  privateKey: CryptoKey
  /** base64 编码的 SPKI 公钥（可安全传输） */
  publicKeyB64: string
}

/**
 * 生成 ECDH P-256 密钥对。
 */
export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  )
  const spki = await crypto.subtle.exportKey('spki', kp.publicKey)
  return {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    publicKeyB64: uint8ToBase64(spki),
  }
}

/**
 * 从 base64 SPKI 导入对端 ECDH 公钥。
 */
export async function importEcdhPublicKey(b64: string): Promise<CryptoKey> {
  const raw = base64ToUint8(b64)
  return crypto.subtle.importKey(
    'spki',
    toBuf(raw),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
}

/**
 * 用 ECDH 共享密钥加密群组密钥。
 * @param myPrivateKey 本方 ECDH 私钥
 * @param peerPublicKeyB64 对端 ECDH 公钥 (base64 SPKI)
 * @param groupKeyB64 待加密的群组密钥 (base64)
 * @returns `{ data, iv }` 均为 base64
 */
export async function encryptGroupKeyForPeer(
  myPrivateKey: CryptoKey,
  peerPublicKeyB64: string,
  groupKeyB64: string,
): Promise<{ data: string; iv: string }> {
  const peerPub = await importEcdhPublicKey(peerPublicKeyB64)
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPub },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = base64ToUint8(groupKeyB64)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, toBuf(plaintext))
  return {
    data: uint8ToBase64(encrypted),
    iv: uint8ToBase64(iv),
  }
}

/**
 * 用 ECDH 共享密钥解密群组密钥。
 * @param myPrivateKey 本方 ECDH 私钥
 * @param peerPublicKeyB64 对端 ECDH 公钥 (base64 SPKI)
 * @param encrypted `{ data, iv }` 均为 base64
 * @returns base64 编码的群组密钥
 */
export async function decryptGroupKeyFromPeer(
  myPrivateKey: CryptoKey,
  peerPublicKeyB64: string,
  encrypted: { data: string; iv: string },
): Promise<string> {
  const peerPub = await importEcdhPublicKey(peerPublicKeyB64)
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPub },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const ciphertext = base64ToUint8(encrypted.data)
  const iv = base64ToUint8(encrypted.iv)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toBuf(iv) }, aesKey, toBuf(ciphertext))
  return uint8ToBase64(decrypted)
}
