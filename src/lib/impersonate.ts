/**
 * 嘴替（帮我接话）核心库——纯函数、零新增依赖。
 * 设计参考主 FATI twin-engine 的交互层，按本仓约定重写（不共享代码）。
 *
 * 两条红线（不可让步）：
 * 1. 独立 prompt：以「用户扮演的身份」替用户写要对角色说的话，
 *    绝不复用聊天的角色 system prompt——否则模型会继续以角色口吻替对面发言；
 * 2. 生成结果只供填入输入框，不写入聊天记录；用户点发送后才成为正式 user 消息。
 *
 * WebLLM 免 Key 档降级：小模型输出 3 选项 JSON 不可靠，走单条建议纯文本 prompt。
 */
import type { TavernCard } from './tavern'
import type { EndpointConfig } from './api'
import { streamChat } from './api'
import { WEBLLM_BASE, streamWebLLM } from './webllm'

// 与 store 的 UserPersona 同形——lib 层不反向依赖 store，自持最小类型
export interface ImpersonaPersona {
  name: string
  description: string
}

export interface PromptMessage {
  role: string
  content: string
}

export interface ImpersonateContext {
  card: TavernCard
  persona: ImpersonaPersona
  /** 最近的对话消息（user/assistant），内部只取尾部若干条 */
  recent: { role: string; content: string }[]
  /** 拓展度 0-1：低=顺着剧情接话，高=可引入新动作新话题 */
  expansion: number
  /** prompt 语言，跟随卡片语言（detectCardLanguage） */
  lang: 'zh' | 'en'
}

// ─── 上下文压缩 ────────────────────────────────────────────
// 只取最近 6 条、每条截 300 字：嘴替不需要世界书和完整历史（省 BYOK token）
const RECENT_LIMIT = 6
const MSG_SLICE = 300
const CARD_SLICE = 300

function userLabel(p: ImpersonaPersona): string {
  return p.name.trim() || 'User'
}

function transcript(ctx: ImpersonateContext): string {
  const me = userLabel(ctx.persona)
  const lines = ctx.recent
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-RECENT_LIMIT)
    .map((m) => `${m.role === 'user' ? me : ctx.card.name}: ${m.content.slice(0, MSG_SLICE)}`)
  return lines.join('\n') || (ctx.lang === 'zh' ? '（对话刚开始）' : '(conversation just started)')
}

// 角色卡语境摘要：只作对手戏参考，绝不作为身份指令
function cardSummary(ctx: ImpersonateContext): string {
  const c = ctx.card
  const bits = [c.description, c.personality, c.scenario].filter(Boolean).join(' / ').slice(0, CARD_SLICE)
  return bits ? `${c.name} — ${bits}` : c.name
}

function expansionHint(expansion: number, lang: 'zh' | 'en'): string {
  const pct = Math.round(expansion * 100)
  if (lang === 'zh') {
    if (pct <= 30) return '回复稳妥、贴合当前剧情走向，不要生硬引入新话题。'
    if (pct >= 60) return '可以大胆一点：引入新动作、新话题或新线索，主动推进剧情。'
    return '以贴合剧情为主，可适度引入一个新角度。'
  }
  if (pct <= 30) return 'Stay safe and consistent with the current scene; do not force new topics.'
  if (pct >= 60) return 'Be bold: introduce new actions, topics or plot hooks to push the story forward.'
  return 'Mostly follow the scene, optionally adding one fresh angle.'
}

// 用户扮演身份描述块（可选）
function personaBlock(ctx: ImpersonateContext): string {
  const d = ctx.persona.description.trim()
  if (!d) return ''
  return ctx.lang === 'zh' ? `\n用户扮演的身份：${d}\n` : `\nThe user is roleplaying as: ${d}\n`
}

// 嘴替专用 system prompt——刻意与 cardToSystemPrompt 的「你就是角色」措辞相反
function ghostwriterSystem(ctx: ImpersonateContext): string {
  const me = userLabel(ctx.persona)
  const char = ctx.card.name
  return ctx.lang === 'zh'
    ? `你是用户的代笔。用户（${me}）正在和虚构角色「${char}」进行角色扮演对话。你的唯一任务：以用户扮演的身份，替用户写出接下来要对${char}说的话。不要替${char}发言，不要写${char}的反应，不要加旁白或解释。`
    : `You are the user's ghostwriter. The user (${me}) is roleplaying with a fictional character "${char}". Your only task: write, in the user's voice and persona, what the user says next to ${char}. Never speak as ${char}, never describe ${char}'s reaction, no narration or commentary.`
}

// ─── 3 选项建议（BYOK 档）───────────────────────────────────
export function buildSuggestionsPrompt(ctx: ImpersonateContext): PromptMessage[] {
  const me = userLabel(ctx.persona)
  const char = ctx.card.name
  const user = ctx.lang === 'zh'
    ? `对手角色（仅供语境参考）：${cardSummary(ctx)}
${personaBlock(ctx)}
最近对话：
${transcript(ctx)}

要求：
- 以${me}的身份，写出接下来对${char}说的 3 种不同回复
- 3 个回复要有明显差异：语气不同（认真/俏皮/简短）或策略不同（直接回应/反问/推进剧情）
- 每个回复 1-3 句
- ${expansionHint(ctx.expansion, ctx.lang)}
- 只写${me}要说的话

输出格式（严格 JSON，不要其他文字）：
{"options": ["回复一", "回复二", "回复三"]}`
    : `The other character (context only): ${cardSummary(ctx)}
${personaBlock(ctx)}
Recent conversation:
${transcript(ctx)}

Requirements:
- Write 3 different replies that ${me} says next to ${char}
- Make them clearly distinct: different tone (serious / playful / brief) or strategy (respond directly / ask back / push the plot)
- 1-3 sentences each
- ${expansionHint(ctx.expansion, ctx.lang)}
- Only write what ${me} says

Output format (strict JSON, nothing else):
{"options": ["reply one", "reply two", "reply three"]}`
  return [
    { role: 'system', content: ghostwriterSystem(ctx) },
    { role: 'user', content: user },
  ]
}

// ─── 单条建议（WebLLM 免 Key 档降级：纯文本、短输出）──────────
export function buildSingleSuggestionPrompt(ctx: ImpersonateContext): PromptMessage[] {
  const me = userLabel(ctx.persona)
  const char = ctx.card.name
  const user = ctx.lang === 'zh'
    ? `对手角色（仅供语境参考）：${cardSummary(ctx)}
${personaBlock(ctx)}
最近对话：
${transcript(ctx)}

以${me}的身份写出接下来对${char}说的一句回复（1-2 句）。${expansionHint(ctx.expansion, ctx.lang)}
只输出这句话本身，不要任何前缀、引号或解释。`
    : `The other character (context only): ${cardSummary(ctx)}
${personaBlock(ctx)}
Recent conversation:
${transcript(ctx)}

Write one reply (1-2 sentences) that ${me} says next to ${char}. ${expansionHint(ctx.expansion, ctx.lang)}
Output only the reply itself — no prefix, quotes or explanation.`
  return [
    { role: 'system', content: ghostwriterSystem(ctx) },
    { role: 'user', content: user },
  ]
}

// ─── 润色扩写（对用户输入框草稿生效）────────────────────────
export function buildRefinePrompt(ctx: ImpersonateContext, draft: string): PromptMessage[] {
  const me = userLabel(ctx.persona)
  const user = ctx.lang === 'zh'
    ? `对手角色（仅供语境参考）：${cardSummary(ctx)}
${personaBlock(ctx)}
最近对话：
${transcript(ctx)}

${me}写了一个粗略草稿：
${draft}

请保持原意，以${me}的身份把它扩写成一段更自然、贴合当前对话的话（1-3 句）。只输出最终文本，不要解释。`
    : `The other character (context only): ${cardSummary(ctx)}
${personaBlock(ctx)}
Recent conversation:
${transcript(ctx)}

${me} wrote a rough draft:
${draft}

Keep the original intent and rewrite it, in ${me}'s voice, into a more natural reply that fits the conversation (1-3 sentences). Output only the final text, no explanation.`
  return [
    { role: 'system', content: ghostwriterSystem(ctx) },
    { role: 'user', content: user },
  ]
}

// ─── 容错解析 3 选项 JSON ──────────────────────────────────
// 剥 markdown 代码围栏 → 截取首个 {...} → 解析 options；
// 全失败时把整段输出当单条建议返回（不做二次模型调用兜底，省 BYOK 成本）
export function parseSuggestions(raw: string): string[] {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const json = JSON.parse(cleaned.slice(start, end + 1))
      if (Array.isArray(json.options)) {
        const opts = json.options
          .filter((o: unknown) => typeof o === 'string' && (o as string).trim())
          .map((o: string) => o.trim())
          .slice(0, 3)
        if (opts.length > 0) return opts
      }
    } catch { /* 落入 fallback */ }
  }
  return cleaned ? [cleaned] : []
}

// ─── 非流式收集完整回复 ────────────────────────────────────
// 包装 streamChat / streamWebLLM（与 sendMessage 同款分流），累积 chunk 为完整文本。
// 3 选项 JSON 无法边流边展示，嘴替统一非流式收集。
export async function collectChat(
  endpoint: EndpointConfig,
  messages: PromptMessage[],
  signal: AbortSignal,
): Promise<string> {
  const doStream = endpoint.baseUrl === WEBLLM_BASE ? streamWebLLM : streamChat
  let text = ''
  await doStream(endpoint, messages, signal, (delta) => { text += delta })
  return text.trim()
}
