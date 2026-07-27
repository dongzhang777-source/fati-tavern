/**
 * 流式 <think>...</think> 标签剥离器。
 * 模型有时会在 content 中夹带推理过程（如 Qwen3 的 <think>...</think>），
 * 该过滤器在逐 chunk 场景下安全地剥离这些内容。
 *
 * 状态机：
 *  - normal: 正常输出，遇到 '<' 进入 maybeTag
 *  - maybeTag: 缓冲中，判断是否为 <think> 或 </think>
 *  - thinking: 在 <think>...</think> 块内，全部丢弃直到遇到 </think>
 */

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

export class ThinkTagFilter {
  private state: 'normal' | 'thinking' = 'normal'
  private pending = '' // 缓冲可能是标签前缀的字符

  /** 送入一个 chunk，返回应展示给用户的文本（可能为空） */
  push(chunk: string): string {
    let out = ''
    let i = 0

    while (i < chunk.length) {
      if (this.pending.length > 0) {
        // 正在缓冲一个潜在标签
        this.pending += chunk[i]
        i++

        if (this.state === 'normal') {
          if (OPEN_TAG.startsWith(this.pending)) {
            if (this.pending === OPEN_TAG) {
              // 完整匹配到 <think>，进入 thinking 状态
              this.state = 'thinking'
              this.pending = ''
            }
            // 否则继续缓冲
          } else {
            // 不是标签前缀，把缓冲全部输出
            out += this.pending
            this.pending = ''
          }
        } else {
          // state === 'thinking'
          if (CLOSE_TAG.startsWith(this.pending)) {
            if (this.pending === CLOSE_TAG) {
              // 匹配到 </think>，回到 normal
              this.state = 'normal'
              this.pending = ''
            }
          } else {
            // 不是关闭标签前缀，丢弃缓冲（thinking 内容不输出）
            this.pending = ''
          }
        }
      } else {
        const ch = chunk[i]
        if (ch === '<') {
          this.pending = '<'
          i++
        } else {
          if (this.state === 'normal') {
            out += ch
          }
          // thinking 状态下非 '<' 字符直接丢弃
          i++
        }
      }
    }

    return out
  }

  /** 流结束时调用，把残余缓冲输出（normal 状态）或丢弃（thinking 状态） */
  flush(): string {
    if (this.state === 'normal' && this.pending.length > 0) {
      const out = this.pending
      this.pending = ''
      return out
    }
    this.pending = ''
    return ''
  }

  /** 重置状态（复用实例时） */
  reset(): void {
    this.state = 'normal'
    this.pending = ''
  }
}
