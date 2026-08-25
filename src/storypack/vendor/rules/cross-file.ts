import { packError, type StoryPackError } from '../errors'
import { TIER_LIMITS } from '../constants'
import { isRecord } from '../json'
import type { StoryPackFiles } from '../types'

const DIMENSION = 384

export interface CrossFileContext {
  files: StoryPackFiles
  nodeCount: number
  endingCount: number
  blankCount: number
  mediaBytes: number
}

export async function validateCrossFile(
  manifest: Record<string, unknown>,
  context: CrossFileContext,
): Promise<StoryPackError | undefined> {
  // S18-1：stats 与图真值逐键比对（首错即停，指针到具体键）
  const stats = isRecord(manifest.stats) ? manifest.stats : undefined
  if (!stats) return packError('SP-REF-209', 'manifest.json', '/stats')
  if (stats.nodes !== context.nodeCount) {
    return packError('SP-REF-209', 'manifest.json', '/stats/nodes')
  }
  if (stats.endings !== context.endingCount) {
    return packError('SP-REF-209', 'manifest.json', '/stats/endings')
  }
  if (stats.blanks !== context.blankCount) {
    return packError('SP-REF-209', 'manifest.json', '/stats/blanks')
  }

  // S18-2：size 等式（totalBytes = scriptBytes + mediaBytes）
  const size = isRecord(manifest.size) ? manifest.size : undefined
  if (!size) return packError('SP-MAN-018', 'manifest.json', '/size')
  if (size.mediaBytes !== context.mediaBytes) {
    return packError('SP-MAN-018', 'manifest.json', '/size/mediaBytes')
  }
  if (size.totalBytes !== Number(size.scriptBytes) + Number(size.mediaBytes)) {
    return packError('SP-MAN-018', 'manifest.json', '/size')
  }

  // S18-3：tier 上限（媒体总量与包总量分别受控）
  const tierLimit = TIER_LIMITS[manifest.tier as keyof typeof TIER_LIMITS]
  if (Number(size.mediaBytes) > tierLimit) {
    return packError('SP-MED-306', 'manifest.json', '/size/mediaBytes')
  }
  if (Number(size.totalBytes) > tierLimit) {
    return packError('SP-MED-306', 'manifest.json', '/size/totalBytes')
  }

  // S18-4：vectors.bin 存在性与向量条数（SHA 真值比对归 W2）
  if (!isRecord(manifest.embedding)) return undefined
  const embedding = manifest.embedding
  if (context.files.exists?.('vectors.bin') === false) {
    return packError('SP-REF-211', 'manifest.json', '/embedding/file')
  }
  if (embedding.count !== context.nodeCount) {
    return packError('SP-REF-210', 'manifest.json', '/embedding/count')
  }
  const file = await context.files.readFile?.('vectors.bin')
  if (!file) return undefined
  if (file.byteLength !== Number(embedding.count) * DIMENSION) {
    return packError('SP-REF-210', 'manifest.json', '/embedding/count')
  }
  return undefined
}
