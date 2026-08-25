import { brandName, t } from './i18n'
import type { Lang } from './i18n'
import { resolveLocalizedText } from './storypack-loader'
import { lookupNode } from '../storypack/vendor'
import type { StoryPackV2 } from '../storypack/vendor'

export function formatEndingAsText(pack: StoryPackV2, visitedPath: string[], lang: Lang): string {
  const title = resolveLocalizedText(pack.manifest.title, lang)
  const endingNodeId = visitedPath[visitedPath.length - 1]
  const endingNode = lookupNode(pack, endingNodeId)
  const endingText = endingNode && 'text' in endingNode ? resolveLocalizedText(endingNode.text, lang) : ''
  const brand = brandName(lang)

  return `📖 《${title}》· ${t(lang, 'sp.ending')}\n\n${endingText}\n\n—— ${brand} (https://fati-tavern.vercel.app)`
}

export async function shareEnding(
  pack: StoryPackV2,
  visitedPath: string[],
  lang: Lang,
  onCopied: () => void,
  onManualFallback: (text: string) => void,
) {
  const text = formatEndingAsText(pack, visitedPath, lang)
  const title = resolveLocalizedText(pack.manifest.title, lang)

  // Tier 1: Web Share API
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
      return
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      // 用户取消时不降级；其他失败继续降级到 Tier 2
    }
  }

  // Tier 2: Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      onCopied()
      return
    } catch {
      // 写入剪贴板失败，降级到 Tier 3
    }
  }

  // Tier 3: 手动复制降级弹窗
  onManualFallback(text)
}
