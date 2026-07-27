/**
 * 安全兜底——自伤/自杀意念关键词识别（Claude 合规审查 P0 项）。
 * 命中后仅弹出危机资源提示（非阻断、可关闭），不拦截消息、不上传任何内容。
 * 关键词识别在本地完成，与隐私承诺一致。
 */

// 中英文自伤/自杀意念常见表述（保守列表，宁可少报不过度误报）
const PATTERNS: RegExp[] = [
  // 中文
  /自杀|自残|自伤|轻生|不想活|活不下去|活着没意思|想死|去死|了结自己|结束(自己的)?生命/,
  // 英文
  /suicid|kill\s+myself|end\s+my\s+life|self[-\s]?harm|want\s+to\s+die|hurt\s+myself|take\s+my\s+(own\s+)?life|no\s+reason\s+to\s+live/i,
]

/** 检测文本是否包含自伤/自杀意念表述 */
export function detectSelfHarm(text: string): boolean {
  return PATTERNS.some((p) => p.test(text))
}
