/**
 * 上下文窗口管理——"保头保尾截中段"策略（主 FATI 同名策略的简化版）。
 * MVP 用字符数近似 token 预算，避免引入 tokenizer 依赖。
 */
import type { ChatMessage } from '../store'

// 默认字符预算：约对应 8K token 的中英混合文本，
// 给 system prompt / 世界书 / 回复生成留出余量
export const DEFAULT_CHAR_BUDGET = 24000

/**
 * 超预算时：保头（首条消息，通常是角色开场白）+ 保尾（最近若干条），截掉中段。
 * 保证至少包含最新一条消息。
 */
export function trimMessages(messages: ChatMessage[], budget = DEFAULT_CHAR_BUDGET): ChatMessage[] {
  const total = messages.reduce((n, m) => n + m.content.length, 0)
  if (total <= budget || messages.length <= 2) return messages

  const head = messages[0]
  let remain = budget - head.content.length

  // 从最新往回收集，装不下就停（但至少保住最新一条）
  const tail: ChatMessage[] = []
  for (let i = messages.length - 1; i >= 1; i--) {
    const len = messages[i].content.length
    if (tail.length > 0 && len > remain) break
    tail.unshift(messages[i])
    remain -= len
  }
  return [head, ...tail]
}
