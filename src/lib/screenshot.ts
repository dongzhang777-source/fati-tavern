/**
 * 对话截图导出——社交裂变引擎（T-A TA-1）。
 * 纯逻辑层（选取/宽度/换行/文件名）可在 node 环境单测；绘制层仅浏览器运行。
 * 聊天内容全程端侧处理，不出设备；零新增运行时依赖。
 */

export interface ShotMessage {
  role: 'user' | 'assistant'
  content: string
}

export const SHOT_MAX_MESSAGES = 6
export const SHOT_MAX_UNITS = 240 // 单条消息长度上限（宽度单位：全角=2 半角=1）

/** 宽度单位估算：CJK/谚文/全角形按 2，其余按 1 */
export function charWidth(code: number): 1 | 2 {
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) return 2
  return 1
}

export function textWidth(text: string): number {
  let units = 0
  for (const ch of text) units += charWidth(ch.codePointAt(0)!)
  return units
}

/** 超长单条截断并加省略号（不在代理对中间断开） */
export function clampShotContent(content: string, maxUnits = SHOT_MAX_UNITS): string {
  if (textWidth(content) <= maxUnits) return content
  let units = 0
  let cut = ''
  for (const ch of content) {
    const w = charWidth(ch.codePointAt(0)!)
    if (units + w > maxUnits - 4) break // 留位给省略号
    cut += ch
    units += w
  }
  return `${cut}……`
}

interface PickableMessage { role: string; content: string }

/** 选最后 N 条 user/assistant 非空消息，单条超长截断 */
export function pickShotMessages(messages: PickableMessage[], maxMessages = SHOT_MAX_MESSAGES): ShotMessage[] {
  const usable = messages.filter(
    (m): m is ShotMessage => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0,
  )
  return usable.slice(-maxMessages).map(m => ({ role: m.role, content: clampShotContent(m.content.trim()) }))
}

/** 按宽度单位硬换行（for..of 保证不在代理对中间断开） */
export function wrapShotText(text: string, maxUnits: number): string[] {
  const lines: string[] = []
  let line = ''
  let units = 0
  for (const ch of text) {
    if (ch === '\n') { lines.push(line); line = ''; units = 0; continue }
    const w = charWidth(ch.codePointAt(0)!)
    if (units + w > maxUnits) { lines.push(line); line = ch; units = w }
    else { line += ch; units += w }
  }
  lines.push(line)
  return lines
}

/** 生成安全文件名：仅保留字母数字下划线连字符与 CJK */
export function shotFilename(characterName: string): string {
  const safe = characterName.trim().replace(/[^\w\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af-]/g, '_').slice(0, 40) || 'chat'
  return `fatitavern-${safe}.png`
}

// ── 绘制层（仅浏览器）─────────────────────────────────────

export interface ShotRenderOptions {
  messages: ShotMessage[]
  characterName: string
  avatarDataUrl?: string | null
  brand: string     // brandName(lang)
  tagline: string   // 水印价值主张（i18n 'shot.tagline'）
  origin?: string   // 默认 location.origin
}

const SHOT = {
  width: 750, padding: 36, bubblePadX: 24, bubblePadY: 18,
  fontSize: 26, lineHeight: 38, bubbleMaxUnits: 42, gap: 14,
  headerH: 96, footerH: 116,
  bg: '#14110d', header: '#e8dcc8', bubbleChar: '#2a231a', bubbleUser: '#413222',
  text: '#ece3d4', sub: '#9a8f7d', accent: '#d9a441', divider: '#3a332a',
}

async function loadAvatar(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 手绘对话截图 → PNG Blob */
export async function renderChatScreenshot(opts: ShotRenderOptions): Promise<Blob> {
  const origin = opts.origin ?? location.origin
  const wrapped = opts.messages.map(m => ({ role: m.role, lines: wrapShotText(m.content, SHOT.bubbleMaxUnits) }))
  const bubblesH = wrapped.reduce((sum, b) => sum + b.lines.length * SHOT.lineHeight + SHOT.bubblePadY * 2 + SHOT.gap, 0)
  const height = Math.round(SHOT.headerH + bubblesH + SHOT.footerH)

  const canvas = document.createElement('canvas')
  canvas.width = SHOT.width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D 不可用')

  ctx.fillStyle = SHOT.bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // ── 头部：圆形头像（缺省首字母占位）+ 角色名 ──
  const avatar = opts.avatarDataUrl ? await loadAvatar(opts.avatarDataUrl) : null
  const cx = SHOT.padding + 26
  const cy = SHOT.headerH / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, 26, 0, Math.PI * 2)
  ctx.clip()
  if (avatar) {
    ctx.drawImage(avatar, cx - 26, cy - 26, 52, 52)
  } else {
    ctx.fillStyle = SHOT.bubbleChar
    ctx.fillRect(cx - 26, cy - 26, 52, 52)
    ctx.fillStyle = SHOT.accent
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText([...opts.characterName][0] ?? '?', cx, cy)
  }
  ctx.restore()
  ctx.fillStyle = SHOT.header
  ctx.font = 'bold 30px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(opts.characterName.slice(0, 24), SHOT.padding + 66, cy)

  // ── 消息气泡：角色左、用户右 ──
  let y = SHOT.headerH
  ctx.font = `${SHOT.fontSize}px sans-serif`
  ctx.textBaseline = 'top'
  for (const bubble of wrapped) {
    const isUser = bubble.role === 'user'
    const bubbleH = bubble.lines.length * SHOT.lineHeight + SHOT.bubblePadY * 2
    const widest = Math.max(...bubble.lines.map(l => textWidth(l)))
    const bubbleW = Math.min(widest * (SHOT.fontSize / 2) + SHOT.bubblePadX * 2, SHOT.width - SHOT.padding * 2)
    const x = isUser ? SHOT.width - SHOT.padding - bubbleW : SHOT.padding
    ctx.fillStyle = isUser ? SHOT.bubbleUser : SHOT.bubbleChar
    roundRectPath(ctx, x, y, bubbleW, bubbleH, 14)
    ctx.fill()
    ctx.fillStyle = SHOT.text
    bubble.lines.forEach((line, i) => {
      ctx.fillText(line, x + SHOT.bubblePadX, y + SHOT.bubblePadY + i * SHOT.lineHeight)
    })
    y += bubbleH + SHOT.gap
  }

  // ── 水印区：品牌 + 域名 + 价值主张（引流固定位）──
  const fy = canvas.height - SHOT.footerH
  ctx.strokeStyle = SHOT.divider
  ctx.beginPath()
  ctx.moveTo(SHOT.padding, fy + 12)
  ctx.lineTo(SHOT.width - SHOT.padding, fy + 12)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = SHOT.accent
  ctx.font = 'bold 26px sans-serif'
  ctx.fillText(`${opts.brand} · ${origin.replace(/^https?:\/\//, '')}`, SHOT.width / 2, fy + 34)
  ctx.fillStyle = SHOT.sub
  ctx.font = '20px sans-serif'
  ctx.fillText(opts.tagline, SHOT.width / 2, fy + 72)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG 编码失败')
  return blob
}

/** 系统分享优先，不支持则触发下载；用户取消分享视为取消（不报失败、不计埋点） */
export async function shareOrDownload(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof navigator.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled'
      // 其余分享失败落入下载兜底
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}
