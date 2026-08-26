import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadPackIndex, loadPack, resolveLocalizedText } from './storypack-loader'

describe('resolveLocalizedText', () => {
  it('优先返回当前语言', () => {
    expect(resolveLocalizedText({ en: 'Hello', 'zh-Hans': '你好' }, 'zh')).toBe('你好')
  })
  it('zh 映射到 zh-Hans', () => {
    expect(resolveLocalizedText({ en: 'Hello', 'zh-Hans': '你好' }, 'zh')).toBe('你好')
  })
  it('缺失当前语言回退 en', () => {
    expect(resolveLocalizedText({ en: 'Hello', ja: 'こんにちは' }, 'zh')).toBe('Hello')
  })
  it('无 en 回退第一个可用值', () => {
    expect(resolveLocalizedText({ ja: 'こんにちは' }, 'zh')).toBe('こんにちは')
  })
  it('ja 返回 ja 文本', () => {
    expect(resolveLocalizedText({ en: 'Hello', ja: 'こんにちは' }, 'ja')).toBe('こんにちは')
  })
  it('ko 返回 ko 文本', () => {
    expect(resolveLocalizedText({ en: 'Hello', ko: '안녕하세요' }, 'ko')).toBe('안녕하세요')
  })
  it('异常入参（null/undefined）安全返回空串不抛错', () => {
    expect(resolveLocalizedText(null, 'zh')).toBe('')
    expect(resolveLocalizedText(undefined, 'en')).toBe('')
  })
})

describe('loadPackIndex and loadPack with mock fetch', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = String(input)
      // Extract path after /storypacks/
      const match = urlStr.match(/storypacks\/(.*)$/)
      if (!match) {
        return new Response(null, { status: 404 })
      }
      const relPath = match[1]
      const fullPath = path.resolve(process.cwd(), 'public/storypacks', relPath)
      try {
        if (!fs.existsSync(fullPath)) {
          return new Response(null, { status: 404 })
        }
        const data = fs.readFileSync(fullPath, 'utf8')
        return new Response(data, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch {
        return new Response(null, { status: 500 })
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('解析 manifest.json 返回包列表', async () => {
    const index = await loadPackIndex()
    expect(index.packs.length).toBe(3)
    expect(index.packs[0].packId).toBe('tavern-encounter')
    expect(index.packs[1].packId).toBe('forest-crossroads')
    expect(index.packs[2].packId).toBe('starlit-rooftop')
  })

  it('加载并验证 tavern-encounter 包', async () => {
    const result = await loadPack('tavern-encounter')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.pack.manifest.packId).toBe('tavern-encounter')
      expect(result.pack.graph.nodes.length).toBe(6)
      expect(result.pack.graph.rootId).toBe('s1')
      expect(result.pack.graph.endingIds).toEqual(['e1', 'e2'])
    }
  })

  it('加载并验证 forest-crossroads 包', async () => {
    const result = await loadPack('forest-crossroads')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.pack.manifest.packId).toBe('forest-crossroads')
      expect(result.pack.graph.nodes.length).toBe(6)
      expect(result.pack.graph.endingIds).toHaveLength(3)
    }
  })

  it('加载并验证 starlit-rooftop 包', async () => {
    const result = await loadPack('starlit-rooftop')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.pack.manifest.packId).toBe('starlit-rooftop')
      expect(result.pack.graph.nodes.length).toBe(5)
      expect(result.pack.graph.endingIds).toHaveLength(2)
    }
  })

  it('不存在的包返回错误', async () => {
    const result = await loadPack('nonexistent-pack')
    expect(result.ok).toBe(false)
  })

  it('非法目录名直接拒绝且不发起网络请求', async () => {
    const result = await loadPack('../evil')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('SP-MAN-001')
    }
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled()
  })

  it('含路径穿越或特殊字符的目录名同样拒绝', async () => {
    for (const dir of ['..%2fetc', 'a/b', '.hidden', 'pack name with spaces']) {
      const result = await loadPack(dir)
      expect(result.ok).toBe(false)
    }
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled()
  })
})
