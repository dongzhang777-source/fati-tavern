// tavern.ts 解析层回归测试
// PNG 构造 + gzip/deflate 压缩用 node:zlib，仅测试侧依赖
import { describe, it, expect } from 'vitest'
import { gzipSync, deflateSync } from 'node:zlib'
import {
  parseCharacterJson, parseLorebookJson, parsePngCard,
  applyMacros, cardToSystemPrompt, bookToContext, detectImportKind,
  detectCardLanguage, personaLine,
} from './tavern'

// ─── 测试用 PNG 构造工具 ──────────────────────────────────

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  // CRC 4 字节留 0——解析器不校验 CRC
  return out
}

function tEXtData(keyword: string, value: Uint8Array): Uint8Array {
  const kw = new TextEncoder().encode(keyword)
  const out = new Uint8Array(kw.length + 1 + value.length)
  out.set(kw, 0)
  out[kw.length] = 0
  out.set(value, kw.length + 1)
  return out
}

function zTXtData(keyword: string, raw: Uint8Array): Uint8Array {
  const kw = new TextEncoder().encode(keyword)
  const compressed = deflateSync(raw)
  const out = new Uint8Array(kw.length + 2 + compressed.length)
  out.set(kw, 0)
  out[kw.length] = 0
  out[kw.length + 1] = 0 // 压缩方法 0 = deflate
  out.set(compressed, kw.length + 2)
  return out
}

function makePng(chunks: Uint8Array[]): ArrayBuffer {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const iend = pngChunk('IEND', new Uint8Array(0))
  const total = [sig, ...chunks, iend]
  const len = total.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const c of total) { out.set(c, off); off += c.length }
  return out.buffer
}

const CARD_V2 = {
  spec: 'chara_card_v2',
  data: { name: 'Alice', description: '{{char}} meets {{user}}', personality: 'kind', first_mes: 'Hi {{user}}!' },
}

function b64(bytes: Uint8Array): Uint8Array {
  return new TextEncoder().encode(Buffer.from(bytes).toString('base64'))
}
const cardJsonBytes = new TextEncoder().encode(JSON.stringify(CARD_V2))

// ─── JSON 卡解析 ──────────────────────────────────────────

describe('parseCharacterJson', () => {
  it('解析 v1 扁平结构', () => {
    const card = parseCharacterJson({ name: '小明', personality: '开朗', first_mes: '你好' })
    expect(card?.name).toBe('小明')
    expect(card?.personality).toBe('开朗')
  })

  it('解析 v2 data 嵌套结构', () => {
    const card = parseCharacterJson(CARD_V2)
    expect(card?.name).toBe('Alice')
    expect(card?.description).toBe('{{char}} meets {{user}}')
  })

  it('非对象输入返回 null', () => {
    expect(parseCharacterJson(null)).toBeNull()
    expect(parseCharacterJson('str')).toBeNull()
  })

  it('缺 name 时使用默认名', () => {
    expect(parseCharacterJson({})?.name).toBe('未命名角色')
  })
})

// ─── 内容分级推断 ─────────────────────────────────────────

describe('contentRating 推断', () => {
  it('显式声明优先', () => {
    expect(parseCharacterJson({ name: 'a', contentRating: 'adult', tags: [] })?.contentRating).toBe('adult')
    expect(parseCharacterJson({ name: 'a', contentRating: 'all', tags: ['nsfw'] })?.contentRating).toBe('all')
  })

  it('tags 含 NSFW 类标记推断为 adult（大小写不敏感）', () => {
    expect(parseCharacterJson({ name: 'a', tags: ['Fantasy', 'NSFW'] })?.contentRating).toBe('adult')
    expect(parseCharacterJson({ name: 'a', tags: ['r18'] })?.contentRating).toBe('adult')
    expect(parseCharacterJson({ name: 'a', tags: ['成人向'] })?.contentRating).toBe('adult')
  })

  it('无标记时为 unknown', () => {
    expect(parseCharacterJson({ name: 'a', tags: ['fantasy', 'cute'] })?.contentRating).toBe('unknown')
  })
})

// ─── PNG 卡解析 ───────────────────────────────────────────

describe('parsePngCard', () => {
  it('tEXt chara 未压缩 base64', async () => {
    const png = makePng([pngChunk('tEXt', tEXtData('chara', b64(cardJsonBytes)))])
    const card = await parsePngCard(png)
    expect(card.name).toBe('Alice')
  })

  it('tEXt chara gzip 压缩（SillyTavern v3 默认导出）', async () => {
    const png = makePng([pngChunk('tEXt', tEXtData('chara', b64(gzipSync(cardJsonBytes))))])
    const card = await parsePngCard(png)
    expect(card.name).toBe('Alice')
  })

  it('zTXt ccv3 区块（deflate）', async () => {
    const png = makePng([pngChunk('zTXt', zTXtData('ccv3', b64(cardJsonBytes)))])
    const card = await parsePngCard(png)
    expect(card.name).toBe('Alice')
  })

  it('ccv3 优先于 chara', async () => {
    const v3 = { ...CARD_V2, data: { ...CARD_V2.data, name: 'AliceV3' } }
    const v3Bytes = new TextEncoder().encode(JSON.stringify(v3))
    const png = makePng([
      pngChunk('tEXt', tEXtData('chara', b64(cardJsonBytes))),
      pngChunk('tEXt', tEXtData('ccv3', b64(v3Bytes))),
    ])
    const card = await parsePngCard(png)
    expect(card.name).toBe('AliceV3')
  })

  it('非 PNG 文件抛出明确错误', async () => {
    await expect(parsePngCard(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow('不是有效的 PNG 文件')
  })

  it('无角色卡区块的 PNG 抛出明确错误', async () => {
    const png = makePng([pngChunk('tEXt', tEXtData('other', b64(cardJsonBytes)))])
    await expect(parsePngCard(png)).rejects.toThrow('没有角色卡数据')
  })

  it('base64 损坏抛出明确错误', async () => {
    const png = makePng([pngChunk('tEXt', tEXtData('chara', new TextEncoder().encode('!!!not-base64!!!')))])
    await expect(parsePngCard(png)).rejects.toThrow('base64')
  })
})

// ─── 宏替换 ───────────────────────────────────────────────

describe('applyMacros', () => {
  it('替换 {{char}} / {{user}}（大小写不敏感、容忍空格）', () => {
    expect(applyMacros('{{char}}对{{ USER }}说：{{CHAR}}在此', '灵儿', '旅人'))
      .toBe('灵儿对旅人说：灵儿在此')
  })

  it('替换旧式 <BOT> / <USER>', () => {
    expect(applyMacros('<BOT> greets <USER>', 'Alice', 'Bob')).toBe('Alice greets Bob')
  })

  it('cardToSystemPrompt 输出不含原始占位符', () => {
    const card = parseCharacterJson(CARD_V2)!
    const sys = cardToSystemPrompt(card)
    expect(sys).not.toMatch(/\{\{\s*(char|user)\s*\}\}/i)
    expect(sys).toContain('Alice meets User')
  })

  it('cardToSystemPrompt 传入 persona 名字后 {{user}} 替换为该名字', () => {
    const card = parseCharacterJson(CARD_V2)!
    const sys = cardToSystemPrompt(card, '旅人')
    expect(sys).not.toMatch(/\{\{\s*(char|user)\s*\}\}/i)
    expect(sys).toContain('Alice meets 旅人')
    expect(sys).not.toContain('Alice meets User')
  })
})

// ─── 用户扮演身份行 ─────────────────────────────────────

describe('personaLine', () => {
  it('描述非空时按语言生成扮演身份行', () => {
    expect(personaLine('一名年轻冒险者', 'zh')).toBe('用户扮演的身份：一名年轻冒险者')
    expect(personaLine('a young adventurer', 'en')).toBe('The user is roleplaying as: a young adventurer')
  })

  it('描述为空或纯空白时返回空串（不拼入 prompt）', () => {
    expect(personaLine('', 'zh')).toBe('')
    expect(personaLine('   ', 'en')).toBe('')
  })
})

// ─── 语言检测与 prompt 模板 ───────────────────────────────

describe('detectCardLanguage / cardToSystemPrompt 模板', () => {
  it('英文卡识别为 en，获得英文脚手架', () => {
    const card = parseCharacterJson(CARD_V2)!
    expect(detectCardLanguage(card)).toBe('en')
    const sys = cardToSystemPrompt(card)
    expect(sys).toContain('Your name is Alice')
    expect(sys).not.toContain('你的名字是')
  })

  it('中文卡识别为 zh，获得中文脚手架', () => {
    const card = parseCharacterJson({ name: '灵儿', description: '来自蜀山的小仙女，性格活泼', first_mes: '你来啦！' })!
    expect(detectCardLanguage(card)).toBe('zh')
    expect(cardToSystemPrompt(card)).toContain('你的名字是灵儿')
  })

  it('mes_example 纳入 prompt', () => {
    const card = parseCharacterJson({ name: '灵儿', description: '蜀山小仙女', mes_example: '<START>示例对话内容' })!
    expect(cardToSystemPrompt(card)).toContain('示例对话内容')
  })
})

// ─── 世界书 ───────────────────────────────────────────────

describe('bookToContext', () => {
  const book = parseLorebookJson({
    entries: [
      { keys: ['b'], content: '第二条', insertion_order: 2 },
      { keys: ['a'], content: '{{char}}的第一条', insertion_order: 1 },
      { keys: ['c'], content: '禁用条目', enabled: false, insertion_order: 0 },
    ],
  })!

  it('按 insertion_order 排序且过滤禁用条目', () => {
    const ctx = bookToContext(book)
    expect(ctx.indexOf('第一条')).toBeLessThan(ctx.indexOf('第二条'))
    expect(ctx).not.toContain('禁用条目')
  })

  it('传入角色名时替换宏', () => {
    expect(bookToContext(book, '灵儿')).toContain('灵儿的第一条')
  })
})

// ─── 导入类型识别 ─────────────────────────────────────────

describe('detectImportKind', () => {
  it('PNG 一律视为角色卡', () => {
    expect(detectImportKind('a.PNG', null)).toBe('character')
  })
  it('v2 spec 识别为角色卡', () => {
    expect(detectImportKind('a.json', CARD_V2)).toBe('character')
  })
  it('entries 数组识别为世界书', () => {
    expect(detectImportKind('a.json', { entries: [] })).toBe('lorebook')
  })
  it('无法识别返回 unknown', () => {
    expect(detectImportKind('a.json', { foo: 1 })).toBe('unknown')
  })
})
