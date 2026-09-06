/**
 * 角色卡链接分享——URL fragment 中的数据不会发送到服务器。
 * 编码链路：白名单卡片 JSON → gzip → base64url → #card=...
 */
import { parseCharacterJson, type TavernCard } from './tavern'

export const SHARE_CARD_PREFIX = '#card='

export class ShareCardTooLargeError extends Error {
  constructor() {
    super('角色卡分享链接超过浏览器 URL 安全长度，请改用文件分享')
    this.name = 'ShareCardTooLargeError'
  }
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return concatBytes(chunks)
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

export async function createShareLink(card: TavernCard, origin = location.origin): Promise<string> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('此浏览器不支持链接分享压缩，请导出文件后分享')
  }

  const json = JSON.stringify(card)
  const encoded = new TextEncoder().encode(json)
  const compressed = await streamToUint8Array(
    new Blob([encoded as BlobPart]).stream().pipeThrough(new CompressionStream('gzip')),
  )
  const encodedCard = bytesToBase64Url(compressed)
  const link = `${origin}/${SHARE_CARD_PREFIX}${encodedCard}`
  if (link.length > 32_000) throw new ShareCardTooLargeError()
  return link
}

export async function readSharedCard(hash = location.hash): Promise<TavernCard | null> {
  if (!hash.startsWith(SHARE_CARD_PREFIX)) return null
  if (typeof DecompressionStream === 'undefined') return null
  try {
    const compressed = base64UrlToBytes(hash.slice(SHARE_CARD_PREFIX.length))
    return parseCharacterJson(JSON.parse(await decompressToString(compressed)))
  } catch {
    return null
  }
}

async function decompressToString(bytes: Uint8Array): Promise<string> {
  // 解压输出上限（安全审查 X-2）：32KB 压缩流可解出远超 20MB 的输出（gzip 比率可达 1000:1+），
  // 与 tavern.ts 文件路径的解压炸弹防护同级；超限 throw 由 readSharedCard 的 catch 吞为 null
  const maxDecompressed = 20 * 1024 * 1024
  const stream = new Blob([bytes as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('gzip')) as ReadableStream<Uint8Array>
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxDecompressed) throw new Error('shared card decompressed output exceeds limit')
    chunks.push(value)
  }
  return new TextDecoder().decode(concatBytes(chunks))
}
