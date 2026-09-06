import { describe, it, expect } from 'vitest'
import { createShareLink, readSharedCard, ShareCardTooLargeError, SHARE_CARD_PREFIX } from './share'
import type { TavernCard } from './tavern'

const card: TavernCard = {
  name: 'Alice',
  description: 'A compact shared card',
  personality: 'kind',
  scenario: 'A tavern at dusk',
  first_mes: 'Hello!',
  mes_example: '',
  system_prompt: '',
  creator_notes: '',
  creator: 'Tester',
  tags: ['test'],
  contentRating: 'unknown',
}

describe('share link', () => {
  it('round-trips a card through gzip base64url fragment', async () => {
    const link = await createShareLink(card, 'https://fati-tavern.vercel.app')
    expect(link.startsWith(`https://fati-tavern.vercel.app/${SHARE_CARD_PREFIX}`)).toBe(true)
    expect(link.slice(link.indexOf(SHARE_CARD_PREFIX) + SHARE_CARD_PREFIX.length)).not.toMatch(/[+/=]/)
    expect(link.length).toBeLessThan(32_000)
    await expect(readSharedCard(new URL(link).hash)).resolves.toEqual(card)
  })

  it('rejects oversized cards before producing an unusable URL', async () => {
    const oversized = {
      ...card,
      description: Array.from({ length: 12_000 }, (_, index) => `描述${index}`).join('，'),
    }
    await expect(createShareLink(oversized, 'https://example.com')).rejects.toBeInstanceOf(ShareCardTooLargeError)
  })

  it('ignores malformed fragments', async () => {
    await expect(readSharedCard('#card=not-gzip')).resolves.toBeNull()
  })

  it('拒绝解压炸弹：输出超过 20MB 上限返回 null（安全审查 X-2）', async () => {
    const { gzipSync } = await import('node:zlib')
    // 25MB 全零：压缩后仅 ~25KB，可合法通过 32KB 链接上限；旧实现会全量解压入内存
    const bomb = new Uint8Array(gzipSync(Buffer.alloc(25 * 1024 * 1024, 0)))
    let binary = ''
    for (const b of bomb) binary += String.fromCharCode(b)
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    await expect(readSharedCard(`${SHARE_CARD_PREFIX}${encoded}`)).resolves.toBeNull()
  })
})
