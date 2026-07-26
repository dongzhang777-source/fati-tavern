// SillyTavern 角色卡 / 世界书 导入解析
// 支持：角色卡 v1(JSON)、v2(JSON data 嵌套)、v3/PNG(tEXt chara)、独立世界书 JSON

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
  contentRating?: 'all' | 'suggestive' | 'adult' | 'unknown'
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
    contentRating: d.contentRating, // 保留来源分级，无则 undefined
  }
  return card
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
// SillyTavern v3 把 JSON 存在 PNG 的 tEXt chunk，key="chara"
// 值是 base64 编码的 gzip 压缩 JSON（也可能未压缩，做兼容）
// 纯 JS 解析 PNG tEXt chunk，不依赖 Node Buffer

export function parsePngCard(arrayBuffer: ArrayBuffer): TavernCard | null {
  try {
    const chara = extractPngTextChunk(arrayBuffer, 'chara')
    if (!chara) return null
    const jsonStr = decodeCharData(chara)
    const raw = JSON.parse(jsonStr)
    return parseCharacterJson(raw)
  } catch (err) {
    console.error('[tavern] PNG parse failed:', err)
    return null
  }
}

// 从 PNG ArrayBuffer 中提取指定 key 的 tEXt chunk 值
function extractPngTextChunk(buf: ArrayBuffer, key: string): string | null {
  const bytes = new Uint8Array(buf)
  // PNG signature: 8 bytes
  // 然后 chunks: 4 bytes length + 4 bytes type + data + 4 bytes CRC
  if (bytes.length < 8) return null
  // 验证 PNG signature (89 50 4E 47 0D 0A 1A 0A)
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null

  let offset = 8
  while (offset < bytes.length - 12) {
    const len = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])

    if (type === 'IEND') break
    if (type === 'tEXt') {
      // data: keyword\0value (Latin-1)
      const dataStart = offset + 8
      const dataEnd = dataStart + len
      // 找 null 分隔符
      let i = dataStart
      while (i < dataEnd && bytes[i] !== 0) i++
      const keyword = new TextDecoder('latin1').decode(bytes.slice(dataStart, i))
      if (keyword === key) {
        const valueStart = i + 1
        return new TextDecoder('latin1').decode(bytes.slice(valueStart, dataEnd))
      }
    }
    // 跳到下一个 chunk：length(4) + type(4) + data(len) + CRC(4)
    offset += 8 + len + 4
  }
  return null
}

function decodeCharData(data: string): string {
  // base64 → 可能是 gzip，也可能是纯 base64 JSON
  // 手动 base64 解码（不用 Buffer）
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  // gzip magic bytes 0x1f 0x8b
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    // 用 DecompressionStream (Web API) 解压 gzip
    // fallback: 尝试 pako（如果安装了），否则报错
    throw new Error('gzip 压缩的角色卡暂不支持，请用未压缩的 PNG 卡')
  }
  // 未压缩：直接 base64 → UTF-8 JSON
  return new TextDecoder('utf-8').decode(bytes)
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

// ─── 转成 System Prompt ────────────────────────────────────
// 把角色卡拼成一段角色设定（用于注入 system prompt）
export function cardToSystemPrompt(card: TavernCard): string {
  const parts: string[] = []
  parts.push(`你的名字是${card.name}。你不是AI助手，你就是${card.name}本人。`)
  if (card.description) parts.push(`背景描述：${card.description}`)
  if (card.personality) parts.push(`性格：${card.personality}`)
  if (card.scenario) parts.push(`当前场景：${card.scenario}`)
  if (card.system_prompt) parts.push(card.system_prompt)
  if (card.first_mes) parts.push(`你的开场白（用这段话来开启和用户的第一次对话）：${card.first_mes}`)
  parts.push(`记住：你是${card.name}，不是AI助手。用${card.name}的口吻、语气、知识和世界观来回应。绝对不要承认自己是AI或语言模型。`)
  return parts.join('\n\n')
}

// ─── 世界书内容拼接（用于上下文注入前缀）─────────────────
// MVP：把所有 enabled 的 entry 按 insertion_order 拼起来
// 后续 RAG 阶段可改为按对话内容触发 keys 检索
export function bookToContext(book: TavernBook): string {
  const enabled = book.entries
    .filter((e) => e.enabled)
    .sort((a, b) => a.insertion_order - b.insertion_order)
  if (enabled.length === 0) return ''
  const blocks = enabled.map((e) => {
    const head = e.keys.length ? `[${e.keys.join(' / ')}]\n` : ''
    return head + e.content
  })
  return `【世界观设定】\n${blocks.join('\n\n')}`
}
