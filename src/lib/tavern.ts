// SillyTavern 角色卡 / 世界书 导入解析
// 支持：角色卡 v1(JSON)、v2(JSON data 嵌套)、v3/PNG(tEXt chara)、独立世界书 JSON

export type ContentRating = 'all' | 'suggestive' | 'adult' | 'unknown'

export interface TavernCard {
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
  system_prompt: string
  creator_notes: string
  creator: string
  tags: string[]
  character_book?: TavernBook
  // ── 角色库地基（Phase 0）──
  contentRating?: ContentRating
}

export interface TavernBookEntry {
  keys: string[]
  content: string
  enabled: boolean
  insertion_order: number
  position: 'before_char' | 'after_char'
  constant?: boolean
}

export interface TavernBook {
  name?: string
  description?: string
  tags?: string[]
  contentRating?: ContentRating
  entries: TavernBookEntry[]
}

// ─── 从任意 JSON 对象提取角色卡字段（兼容 v1 / v2）─────────
export function parseCharacterJson(raw: any): TavernCard | null {
  if (!raw || typeof raw !== 'object') return null

  // V2: 数据在 data 下
  const d = raw.data ?? raw
  const card: TavernCard = {
    name: d.name || '未命名角色',
    description: d.description || '',
    personality: d.personality || '',
    scenario: d.scenario || '',
    first_mes: d.first_mes || '',
    mes_example: d.mes_example || '',
    system_prompt: d.system_prompt || '',
    creator_notes: d.creator_notes || '',
    creator: d.creator || '',
    tags: d.tags || [],
    character_book: d.character_book ? normalizeBook(d.character_book) : undefined,
    contentRating: deriveContentRating(d), // 显式分级优先，其次按 tags 推断
  }
  return card
}

const ADULT_TAG_MARKERS = ['nsfw', 'adult', '18+', 'r18', 'r-18', 'explicit', '成人', '限制级']

// tags 关键词推断：命中成人标记 → adult，否则无法判断（null）
export function ratingFromTags(tags: string[] | undefined): ContentRating | null {
  const list = (tags ?? []).map((t) => String(t).toLowerCase())
  if (list.some((t) => ADULT_TAG_MARKERS.some((m) => t.includes(m)))) return 'adult'
  return null
}

function isRating(v: unknown): v is ContentRating {
  return v === 'all' || v === 'suggestive' || v === 'adult' || v === 'unknown'
}

// 分级推断：来源显式声明 > tags 关键词 > unknown
// UGC 合规钩子——导入时标记，画廊展示 18+ 徽标
function deriveContentRating(d: any): ContentRating {
  if (isRating(d.contentRating)) return d.contentRating
  return ratingFromTags(Array.isArray(d.tags) ? d.tags.map((t: any) => String(t)) : undefined) ?? 'unknown'
}

// 世界书分级：显式分级 > tags 推断 > unknown（与角色卡语义对齐，供 safeMode 过滤）
export function deriveBookRating(book: TavernBook): ContentRating {
  if (book.contentRating) return book.contentRating
  return ratingFromTags(book.tags) ?? 'unknown'
}

// ─── 世界书 JSON ──────────────────────────────────────────
export function parseLorebookJson(raw: any): TavernBook | null {
  if (!raw || typeof raw !== 'object') return null
  // 兼容：世界书可能是 { entries: [...] } 或 { character_book: { entries: [...] } }
  const bookRaw = raw.character_book ?? raw
  if (!Array.isArray(bookRaw.entries)) return null
  return normalizeBook(bookRaw)
}

function normalizeBook(raw: any): TavernBook {
  return {
    name: raw.name,
    description: raw.description,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t)) : undefined,
    contentRating: isRating(raw.contentRating) ? raw.contentRating : undefined,
    entries: (raw.entries || []).map((e: any) => ({
      keys: Array.isArray(e.keys) ? e.keys : [],
      content: e.content || '',
      enabled: e.enabled !== false,
      insertion_order: e.insertion_order ?? 0,
      position: e.position === 'after_char' ? 'after_char' : 'before_char',
      constant: e.constant === true,
    })),
  }
}

// ─── PNG 角色卡解析 ────────────────────────────────────────
// SillyTavern 把 JSON 存在 PNG 的 tEXt/zTXt chunk：
//   v3 规范 key="ccv3"（优先），v2 及更早 key="chara"（回退）
// 值是 base64 编码的 JSON，可能再套一层 gzip；zTXt 本身是 deflate 压缩
// 纯 JS + Web API（DecompressionStream），不依赖 Node Buffer / pako
// 解析失败抛出带原因的 Error，供导入 UI 反馈

export async function parsePngCard(arrayBuffer: ArrayBuffer): Promise<TavernCard> {
  const chunks = extractPngTextChunks(arrayBuffer)
  if (chunks === null) throw new Error('不是有效的 PNG 文件')

  // v3 的 ccv3 优先于 v2 的 chara
  const hit = chunks.find((c) => c.keyword === 'ccv3') ?? chunks.find((c) => c.keyword === 'chara')
  if (!hit) throw new Error('PNG 中没有角色卡数据（缺少 ccv3 / chara 区块）')

  let base64: string
  if (hit.type === 'zTXt') {
    // zTXt: 1 字节压缩方法（0=deflate/zlib）+ 压缩数据
    if (hit.data[0] !== 0) throw new Error('zTXt 区块使用了未知压缩方法')
    base64 = await decompressToText(hit.data.slice(1), 'deflate', 'latin1')
  } else {
    base64 = new TextDecoder('latin1').decode(hit.data)
  }

  const jsonStr = await decodeCharData(base64)
  let raw: any
  try {
    raw = JSON.parse(jsonStr)
  } catch {
    throw new Error('角色卡 JSON 解析失败')
  }
  const card = parseCharacterJson(raw)
  if (!card) throw new Error('无法识别的角色卡数据结构')
  return card
}

interface PngTextChunk {
  keyword: string
  type: 'tEXt' | 'zTXt'
  data: Uint8Array
}

// 扫描 PNG 中全部 tEXt / zTXt chunk；不是 PNG 返回 null
function extractPngTextChunks(buf: ArrayBuffer): PngTextChunk[] | null {
  const bytes = new Uint8Array(buf)
  // PNG signature: 8 bytes
  // 然后 chunks: 4 bytes length + 4 bytes type + data + 4 bytes CRC
  if (bytes.length < 8) return null
  // 验证 PNG signature (89 50 4E 47 0D 0A 1A 0A)
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null

  const chunks: PngTextChunk[] = []
  let offset = 8
  while (offset < bytes.length - 12) {
    const len = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])

    if (type === 'IEND') break
    if (type === 'tEXt' || type === 'zTXt') {
      // data: keyword\0(压缩方法字节，仅 zTXt)value
      const dataStart = offset + 8
      const dataEnd = dataStart + len
      // 找 null 分隔符
      let i = dataStart
      while (i < dataEnd && bytes[i] !== 0) i++
      const keyword = new TextDecoder('latin1').decode(bytes.slice(dataStart, i))
      chunks.push({ keyword, type, data: bytes.slice(i + 1, dataEnd) })
    }
    // 跳到下一个 chunk：length(4) + type(4) + data(len) + CRC(4)
    offset += 8 + len + 4
  }
  return chunks
}

async function decodeCharData(data: string): Promise<string> {
  // base64 → 可能是 gzip，也可能是纯 base64 JSON
  // 手动 base64 解码（不用 Buffer）
  let binary: string
  try {
    binary = atob(data.trim())
  } catch {
    throw new Error('角色卡数据 base64 解码失败')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  // gzip magic bytes 0x1f 0x8b（SillyTavern v3 默认导出格式）
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return decompressToText(bytes, 'gzip', 'utf-8')
  }
  // 未压缩：直接 base64 → UTF-8 JSON
  return new TextDecoder('utf-8').decode(bytes)
}

// 用浏览器原生 DecompressionStream 解压（gzip / deflate）
async function decompressToText(bytes: Uint8Array, format: CompressionFormat, encoding: string): Promise<string> {
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format))
    const buf = await new Response(stream).arrayBuffer()
    return new TextDecoder(encoding).decode(buf)
  } catch {
    throw new Error(`角色卡数据解压失败（${format}）`)
  }
}

// ─── 分类导入文件 ──────────────────────────────────────────
export type ImportKind = 'character' | 'lorebook' | 'unknown'

export function detectImportKind(fileName: string, json: any): ImportKind {
  if (fileName.toLowerCase().endsWith('.png')) return 'character' // PNG 只可能是角色卡
  const spec = json?.spec
  if (spec === 'chara_card_v2') return 'character'
  if (json?.data && json.data.name) return 'character'
  if (json?.name && (json?.personality || json?.first_mes)) return 'character'
  if (Array.isArray(json?.entries) || json?.character_book) return 'lorebook'
  return 'unknown'
}

// ─── 宏替换 ────────────────────────────────────────────────
// SillyTavern 卡片文本里普遍使用 {{char}} / {{user}} 占位符
// （及更早的 <BOT> / <USER>），发给模型前必须替换掉
// userName 由用户 persona 设置提供（store 透传），未设置时回退 'User'
export function applyMacros(text: string, charName: string, userName = 'User'): string {
  return text
    .replace(/\{\{\s*char\s*\}\}/gi, charName)
    .replace(/\{\{\s*user\s*\}\}/gi, userName)
    .replace(/<BOT>/gi, charName)
    .replace(/<USER>/gi, userName)
}

// ─── 卡片语言检测 ──────────────────────────────────────────
// CJK 字符占比启发式：英文卡（生态主流）不该被套中文脚手架提示词
export function detectCardLanguage(card: TavernCard): 'zh' | 'en' {
  // 采样所有文本密集字段（system_prompt / mes_example 常含大量单一语言文本）
  const sample = [card.description, card.personality, card.scenario, card.first_mes, card.system_prompt, card.mes_example].join('')
  if (!sample) return 'zh'
  // CJK 统一表意 + 中文标点 + 全角字符，避免漏计中文标点导致占比偏低
  const cjk = (sample.match(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/g) || []).length
  // 去除空白和纯 ASCII 标点后的有效字符数，避免格式字符稀释比例
  const effective = sample.replace(/[\s\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]/g, '').length
  return effective > 0 && cjk / effective > 0.15 ? 'zh' : 'en'
}

// ─── 转成 System Prompt ────────────────────────────────────
// 把角色卡拼成一段角色设定（用于注入 system prompt）
// 模板按卡片语言选择，避免中英混合 prompt 干扰模型
export function cardToSystemPrompt(card: TavernCard, userName = 'User'): string {
  const lang = detectCardLanguage(card)
  const parts: string[] = []
  if (lang === 'zh') {
    parts.push(`你的名字是${card.name}。你不是AI助手，你就是${card.name}本人。`)
    if (card.description) parts.push(`背景描述：${card.description}`)
    if (card.personality) parts.push(`性格：${card.personality}`)
    if (card.scenario) parts.push(`当前场景：${card.scenario}`)
    if (card.system_prompt) parts.push(card.system_prompt)
    if (card.mes_example) parts.push(`对话示例（模仿这种说话风格）：\n${card.mes_example}`)
    if (card.first_mes) parts.push(`你的开场白（用这段话来开启和用户的第一次对话）：${card.first_mes}`)
    parts.push(`记住：你是${card.name}，不是AI助手。用${card.name}的口吻、语气、知识和世界观来回应。绝对不要承认自己是AI或语言模型。`)
    parts.push(`始终使用中文回复。`)
  } else {
    parts.push(`Your name is ${card.name}. You are not an AI assistant — you ARE ${card.name}.`)
    if (card.description) parts.push(`Background: ${card.description}`)
    if (card.personality) parts.push(`Personality: ${card.personality}`)
    if (card.scenario) parts.push(`Current scenario: ${card.scenario}`)
    if (card.system_prompt) parts.push(card.system_prompt)
    if (card.mes_example) parts.push(`Example dialogue (imitate this speaking style):\n${card.mes_example}`)
    if (card.first_mes) parts.push(`Your greeting (use it to open the first conversation): ${card.first_mes}`)
    parts.push(`Remember: you are ${card.name}, not an AI assistant. Respond in ${card.name}'s voice, tone, knowledge and worldview. Never admit to being an AI or a language model.`)
    parts.push(`Always respond in English.`)
  }
  return applyMacros(parts.join('\n\n'), card.name, userName)
}

// ─── 世界书内容拼接（用于上下文注入前缀）─────────────────
// MVP：把所有 enabled 的 entry 按 insertion_order 拼起来
// 后续 RAG 阶段可改为按对话内容触发 keys 检索
// maxChars：注入预算（默认不限）。超预算按 insertion_order 顺序逐条丢弃，
// 保证头部设定优先保留；至少保留一条（哪怕单条超预算也截断保留）
export function bookToContext(book: TavernBook, charName?: string, userName = 'User', lang: 'zh' | 'en' = 'zh', maxChars?: number): string {
  const enabled = book.entries
    .filter((e) => e.enabled)
    .sort((a, b) => a.insertion_order - b.insertion_order)
  if (enabled.length === 0) return ''
  const blocks = enabled.map((e) => {
    const head = e.keys.length ? `[${e.keys.join(' / ')}]\n` : ''
    return head + e.content
  })
  // 按卡片语言选择标题，避免中英混合 prompt 干扰模型
  const header = lang === 'zh' ? '【世界观设定】' : '[World Lore]'
  let body: string
  if (maxChars !== undefined && maxChars > 0) {
    const picked: string[] = []
    let used = 0
    for (const b of blocks) {
      const cost = b.length + 2 // + '\n\n' 分隔
      if (picked.length === 0 && cost > maxChars) {
        // 单条就超预算：截断保留（世界观至少有一条进场）
        picked.push(b.slice(0, maxChars))
        break
      }
      if (used + cost > maxChars) break
      picked.push(b)
      used += cost
    }
    body = picked.join('\n\n')
  } else {
    body = blocks.join('\n\n')
  }
  const text = `${header}\n${body}`
  return charName ? applyMacros(text, charName, userName) : text
}

// ─── 世界书浓缩为剧情世界（lorebook → story premise）─────────
// 打通「导入的世界书进入剧情」的最后一公里：纯前端规则浓缩，不调模型。
// title = 书名（缺省用 fallback 名）；premise = 描述 + enabled 条目正文，
// 按 insertion_order 截断到 maxChars 预算（超长的书只喂设定主干）
export function bookToPremise(book: TavernBook, fallbackName: string, maxChars = 3000): { title: string; premise: string } {
  const title = (book.name || '').trim() || fallbackName
  const enabled = book.entries
    .filter((e) => e.enabled)
    .sort((a, b) => a.insertion_order - b.insertion_order)
  const parts: string[] = []
  if (book.description?.trim()) parts.push(book.description.trim())
  let used = 0
  for (const e of enabled) {
    const content = e.content.trim()
    if (!content) continue
    const cost = content.length + 2
    if (used + cost > maxChars && parts.length > 0) break
    if (used + cost > maxChars) { parts.push(content.slice(0, maxChars)); break }
    parts.push(content)
    used += cost
  }
  return { title, premise: parts.join('\n\n') }
}

// ─── 用户扮演身份行（拼入聊天 system prompt 尾部）────────────
// persona.description 非空时，告诉模型「用户扮演谁」，让角色回应更贴合对手戏
export function personaLine(description: string, lang: 'zh' | 'en'): string {
  const d = description.trim()
  if (!d) return ''
  return lang === 'zh' ? `用户扮演的身份：${d}` : `The user is roleplaying as: ${d}`
}

// ─── 安全模式过滤（Phase: fati 嫁接）─────────────────────────
// safeMode=false → 全部可见；safeMode=true → 隐藏 adult
// 与 fati passesContentFilter 语义对齐（suggestive/unknown/all 始终可见）
export function passesContentFilter(
  rating: TavernCard['contentRating'] | undefined,
  safeMode: boolean,
): boolean {
  if (!safeMode) return true
  return rating !== 'adult'
}
