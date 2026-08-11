import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  streamChat,
  fetchModels,
  testChat,
  validateBaseUrl,
  sanitizeErrorText,
  PRESETS,
} from './api'

// ── 测试替身 ──────────────────────────────────────────
function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < events.length) controller.enqueue(enc.encode(events[i++]))
      else controller.close()
    },
  })
}

function streamResp(stream: ReadableStream<Uint8Array>) {
  return {
    ok: true,
    status: 200,
    body: stream,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({}),
  }
}

function jsonResp(obj: any, ok = true, status = 200) {
  return {
    ok,
    status,
    body: undefined as any,
    text: () => Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj)),
    json: () => Promise.resolve(obj),
  }
}

const ep = (over: Partial<{ baseUrl: string; apiKey: string; model: string }> = {}) => ({
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'k',
  model: 'm',
  ...over,
})
const sig = () => new AbortController().signal
const msgs = [{ role: 'user', content: 'hi' }]

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

// ── streamChat ────────────────────────────────────────
describe('streamChat SSE 流式', () => {
  it('逐 chunk 回调并拼接', async () => {
    fetchMock.mockResolvedValue(
      streamResp(
        sseStream([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      ),
    )
    const out: string[] = []
    await streamChat(ep(), msgs, sig(), (d) => out.push(d))
    expect(out.join('')).toBe('Hello world')
  })

  it('跨 chunk 切分仍能正确解析（buffer 拼接）', async () => {
    const full = 'data: {"choices":[{"delta":{"content":"Hello world"}}]}\n\ndata: [DONE]\n\n'
    const bytes = new TextEncoder().encode(full)
    const half = Math.floor(bytes.length / 2)
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(bytes.subarray(0, half))
        c.enqueue(bytes.subarray(half))
        c.close()
      },
    })
    fetchMock.mockResolvedValue(streamResp(stream))
    const out: string[] = []
    await streamChat(ep(), msgs, sig(), (d) => out.push(d))
    expect(out.join('')).toBe('Hello world')
  })

  it('[DONE] 后正常终止', async () => {
    fetchMock.mockResolvedValue(
      streamResp(sseStream(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n', 'data: [DONE]\n\n'])),
    )
    const out: string[] = []
    await streamChat(ep(), msgs, sig(), (d) => out.push(d))
    expect(out.join('')).toBe('x')
  })

  it('非 200 错误体被脱敏（不泄露 Bearer/sk-）', async () => {
    fetchMock.mockResolvedValue(
      jsonResp('HTTP 401: Bearer sk-secret1234567890 leaked', false, 401),
    )
    await expect(streamChat(ep(), msgs, sig(), () => {})).rejects.toThrow(/Bearer \*\*\*/)
  })

  it('非法 baseUrl 在发起请求前即校验拦截', async () => {
    await expect(
      streamChat(ep({ baseUrl: 'file:///etc' }), msgs, sig(), () => {}),
    ).rejects.toThrow('仅支持 http/https 端点')
    // 绝不应真正发起 fetch
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('已 abort 的 signal 向上传播 AbortError', async () => {
    fetchMock.mockImplementation(async (_u: string, opts: any) => {
      if (opts?.signal?.aborted) {
        const e = new Error('aborted')
        e.name = 'AbortError'
        throw e
      }
      return streamResp(sseStream(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n']))
    })
    const ac = new AbortController()
    ac.abort()
    await expect(streamChat(ep(), msgs, ac.signal, () => {})).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})

// ── fetchModels ───────────────────────────────────────
describe('fetchModels', () => {
  it('解析 /models 返回 id 列表', async () => {
    fetchMock.mockResolvedValue(jsonResp({ data: [{ id: 'a' }, { id: 'b' }, { foo: 1 }] }))
    const r = await fetchModels(ep(), sig())
    expect(r).toEqual(['a', 'b'])
  })

  it('非法 baseUrl 拦截', async () => {
    await expect(fetchModels(ep({ baseUrl: 'ftp://x' }), sig())).rejects.toThrow(
      '仅支持 http/https 端点',
    )
  })
})

// ── testChat ──────────────────────────────────────────
describe('testChat', () => {
  it('返回 choices[0].message.content', async () => {
    fetchMock.mockResolvedValue(jsonResp({ choices: [{ message: { content: 'hi there' } }] }))
    const r = await testChat(ep(), sig())
    expect(r).toBe('hi there')
  })

  it('非 200 错误体脱敏（sk- key 被遮蔽）', async () => {
    fetchMock.mockResolvedValue(jsonResp('oops sk-abcdefgh12345678 leaked', false, 500))
    await expect(testChat(ep(), sig())).rejects.toThrow(/sk-\*\*\*/)
  })
})

// ── validateBaseUrl ───────────────────────────────────
describe('validateBaseUrl', () => {
  it('合法 http/https 返回 null', () => {
    expect(validateBaseUrl('https://api.deepseek.com/v1')).toBeNull()
    expect(validateBaseUrl('http://localhost:1234/v1')).toBeNull()
  })
  it('拒绝 file:// / ftp://', () => {
    expect(validateBaseUrl('file:///x')).toBe('仅支持 http/https 端点')
    expect(validateBaseUrl('ftp://x')).toBe('仅支持 http/https 端点')
  })
  it('拒绝内嵌账号密码', () => {
    expect(validateBaseUrl('https://user:pass@api.com')).toBe('端点地址不得内嵌账号密码')
  })
  it('拒绝非法格式', () => {
    expect(validateBaseUrl('not a url')).toBe('端点地址格式无效')
  })
})

// ── sanitizeErrorText ────────────────────────────────
describe('sanitizeErrorText', () => {
  it('遮蔽 Bearer token', () => {
    expect(sanitizeErrorText('Bearer abcDEF123456')).toBe('Bearer ***')
  })
  it('遮蔽 sk- key', () => {
    expect(sanitizeErrorText('oops sk-abcdefgh12345678 end')).toBe('oops sk-*** end')
  })
  it('普通文本不变', () => {
    expect(sanitizeErrorText('rate limit exceeded')).toBe('rate limit exceeded')
  })
})

// ── PRESETS 结构 ─────────────────────────────────────
describe('PRESETS', () => {
  it('覆盖主要端点预设', () => {
    const labels = PRESETS.map((p) => p.label)
    for (const l of ['WebLLM', 'DeepSeek', 'Kimi (Moonshot)', 'OpenAI', 'LM Studio', 'Ollama', '自定义']) {
      expect(labels).toContain(l)
    }
  })
  it('WebLLM 用特殊标记 baseUrl，自定义为空', () => {
    expect(PRESETS.find((p) => p.label === 'WebLLM')?.baseUrl).toBe('webllm')
    expect(PRESETS.find((p) => p.label === '自定义')?.baseUrl).toBe('')
  })
  it('每项含 label/baseUrl/hint 字段', () => {
    for (const p of PRESETS) {
      expect(typeof p.label).toBe('string')
      expect(typeof p.baseUrl).toBe('string')
      expect(typeof p.hint).toBe('string')
    }
  })
})
