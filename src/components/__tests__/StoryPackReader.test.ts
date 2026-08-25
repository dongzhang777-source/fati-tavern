import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { formatEndingAsText, shareEnding } from '../../lib/storypack-share'
import { loadPack } from '../../lib/storypack-loader'
import { lookupNode } from '../../storypack/vendor'
import { useStore } from '../../store'
import type { StoryPackV2 } from '../../storypack/vendor'

function mockFetchFiles() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const urlStr = String(input)
    const match = urlStr.match(/storypacks\/(.*)$/)
    if (!match) return new Response(null, { status: 404 })
    const relPath = match[1]
    const fullPath = path.resolve(process.cwd(), 'public/storypacks', relPath)
    try {
      if (!fs.existsSync(fullPath)) return new Response(null, { status: 404 })
      const data = fs.readFileSync(fullPath, 'utf8')
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      return new Response(null, { status: 500 })
    }
  })
}

describe('StoryPackReader formatEndingAsText', async () => {
  beforeEach(() => {
    mockFetchFiles()
  })

  it('正确格式化中文结局分享文案', async () => {
    const res = await loadPack('tavern-encounter')
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const path = ['s1', 's2a', 's3', 'e1']
    const text = formatEndingAsText(res.pack, path, 'zh')
    expect(text).toContain('《酒馆奇遇》')
    expect(text).toContain('结局')
    expect(text).toContain('肥猫酒馆')
    expect(text).toContain('传奇冒险就此启程')
  })

  it('正确格式化英文结局分享文案', async () => {
    const res = await loadPack('starlit-rooftop')
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const path = ['s1', 's_talk', 'e_dawn']
    const text = formatEndingAsText(res.pack, path, 'en')
    expect(text).toContain('Midnight on the Starlit Rooftop')
    expect(text).toContain('FATI Tavern')
    expect(text).toContain('dawn break over the skyline')
  })
})

describe('StoryPackReader shareEnding 三档降级测试', async () => {
  let pack: StoryPackV2

  beforeEach(async () => {
    mockFetchFiles()
    const res = await loadPack('tavern-encounter')
    if (res.ok) pack = res.pack
  })

  it('Tier 1: Web Share API 可用时优先调用 navigator.share', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share: shareMock })

    const onCopied = vi.fn()
    const onManual = vi.fn()

    await shareEnding(pack, ['s1', 'e1'], 'zh', onCopied, onManual)

    expect(shareMock).toHaveBeenCalledTimes(1)
    expect(shareMock.mock.calls[0][0].title).toBe('酒馆奇遇')
    expect(shareMock.mock.calls[0][0].text).toContain('酒馆奇遇')
    expect(onCopied).not.toHaveBeenCalled()
    expect(onManual).not.toHaveBeenCalled()
  })

  it('Tier 1 Abort: 用户取消 share 时不进入后续降级', async () => {
    const abortErr = new Error('User cancelled')
    abortErr.name = 'AbortError'
    const shareMock = vi.fn().mockRejectedValue(abortErr)
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      share: shareMock,
      clipboard: { writeText: writeTextMock },
    })

    const onCopied = vi.fn()
    const onManual = vi.fn()

    await shareEnding(pack, ['s1', 'e1'], 'zh', onCopied, onManual)

    expect(shareMock).toHaveBeenCalledTimes(1)
    expect(writeTextMock).not.toHaveBeenCalled()
    expect(onCopied).not.toHaveBeenCalled()
    expect(onManual).not.toHaveBeenCalled()
  })

  it('Tier 2: share 失败时降级到 clipboard.writeText 并触发 onCopied', async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error('Share error'))
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      share: shareMock,
      clipboard: { writeText: writeTextMock },
    })

    const onCopied = vi.fn()
    const onManual = vi.fn()

    await shareEnding(pack, ['s1', 'e1'], 'zh', onCopied, onManual)

    expect(shareMock).toHaveBeenCalledTimes(1)
    expect(writeTextMock).toHaveBeenCalledTimes(1)
    expect(onCopied).toHaveBeenCalledTimes(1)
    expect(onManual).not.toHaveBeenCalled()
  })

  it('Tier 3: clipboard 也失败时降级到 onManualFallback', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard denied'))
    vi.stubGlobal('navigator', {
      clipboard: { writeText: writeTextMock },
    })

    const onCopied = vi.fn()
    const onManual = vi.fn()

    await shareEnding(pack, ['s1', 'e1'], 'zh', onCopied, onManual)

    expect(writeTextMock).toHaveBeenCalledTimes(1)
    expect(onCopied).not.toHaveBeenCalled()
    expect(onManual).toHaveBeenCalledTimes(1)
    expect(onManual.mock.calls[0][0]).toContain('酒馆奇遇')
  })
})

describe('完整游玩路径模拟与图遍历验证', () => {
  beforeEach(() => {
    mockFetchFiles()
  })

  it('tavern-encounter 所有分支均能到达有效结局', async () => {
    const res = await loadPack('tavern-encounter')
    expect(res.ok).toBe(true)
    if (!res.ok) return

    // DFS 遍历所有可能路径并验证
    function traverse(nodeId: string, currentPath: string[]) {
      const node = lookupNode(res.pack, nodeId)
      expect(node).toBeDefined()
      if (!node) return

      const newPath = [...currentPath, nodeId]
      if (node.kind === 'ending') {
        expect(res.pack.graph.endingIds).toContain(node.id)
        return
      }

      expect(node.kind).toBe('scene')
      if (node.kind === 'scene') {
        expect(node.choices.length).toBeGreaterThan(0)
        for (const choice of node.choices) {
          expect(newPath).not.toContain(choice.target) // 无环
          traverse(choice.target, newPath)
        }
      }
    }

    traverse(res.pack.graph.rootId, [])
  })

  it('forest-crossroads 所有分支均能到达有效结局', async () => {
    const res = await loadPack('forest-crossroads')
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const reachedEndings = new Set<string>()
    function traverse(nodeId: string, currentPath: string[]) {
      const node = lookupNode(res.pack, nodeId)
      expect(node).toBeDefined()
      if (!node) return

      const newPath = [...currentPath, nodeId]
      if (node.kind === 'ending') {
        reachedEndings.add(node.id)
        return
      }

      if (node.kind === 'scene') {
        for (const choice of node.choices) {
          traverse(choice.target, newPath)
        }
      }
    }

    traverse(res.pack.graph.rootId, [])
    expect(Array.from(reachedEndings).sort()).toEqual(res.pack.graph.endingIds.slice().sort())
  })

  it('starlit-rooftop 所有分支均能到达有效结局', async () => {
    const res = await loadPack('starlit-rooftop')
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const reachedEndings = new Set<string>()
    function traverse(nodeId: string, currentPath: string[]) {
      const node = lookupNode(res.pack, nodeId)
      expect(node).toBeDefined()
      if (!node) return

      const newPath = [...currentPath, nodeId]
      if (node.kind === 'ending') {
        reachedEndings.add(node.id)
        return
      }

      if (node.kind === 'scene') {
        for (const choice of node.choices) {
          traverse(choice.target, newPath)
        }
      }
    }

    traverse(res.pack.graph.rootId, [])
    expect(Array.from(reachedEndings).sort()).toEqual(res.pack.graph.endingIds.slice().sort())
  })
})

describe('Store showStoryPack 路由验证', () => {
  it('调用 showStoryPack 切换视图到 storypack', () => {
    useStore.setState({ view: 'gallery', activeConvId: 'conv_123' })
    useStore.getState().showStoryPack()
    expect(useStore.getState().view).toBe('storypack')
    expect(useStore.getState().activeConvId).toBeNull()
  })
})
