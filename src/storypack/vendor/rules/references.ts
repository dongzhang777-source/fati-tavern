import { packError, type StoryPackError } from '../errors'
import { isRecord } from '../json'
import type { StoryPackFiles } from '../types'

export interface ReferenceContext {
  nodeIds: string[]
  mediaIds: string[]
  castNames: string[]
  files: StoryPackFiles
}

export function validateReferences(
  graph: Record<string, unknown>,
  manifest: Record<string, unknown>,
  context: ReferenceContext,
): StoryPackError | undefined {
  const nodeIdSet = new Set(context.nodeIds)
  const mediaIdSet = new Set(context.mediaIds)
  const castNameSet = new Set(context.castNames)

  // 1. endingIds reference check
  if (Array.isArray(graph.endingIds)) {
    for (const [index, endingId] of graph.endingIds.entries()) {
      if (!nodeIdSet.has(String(endingId))) {
        return packError(
          'SP-REF-201',
          'script/graph.json',
          `/endingIds/${index}`,
        )
      }
    }
  }

  // 2. Node references check
  if (Array.isArray(graph.nodes)) {
    for (const [nodeIndex, node] of (
      graph.nodes as Array<Record<string, unknown>>
    ).entries()) {
      const nodePointer = `/nodes/${nodeIndex}`
      // Choices targets
      if (Array.isArray(node.choices)) {
        for (const [choiceIndex, choice] of (
          node.choices as Array<Record<string, unknown>>
        ).entries()) {
          if (!nodeIdSet.has(String(choice.target))) {
            return packError(
              'SP-REF-201',
              'script/graph.json',
              `${nodePointer}/choices/${choiceIndex}/target`,
            )
          }
        }
      }
      // Blank continuations
      if (isRecord(node.blankSpec) && Array.isArray(node.blankSpec.continuations)) {
        for (const [continuationIndex, target] of (
          node.blankSpec.continuations as unknown[]
        ).entries()) {
          if (!nodeIdSet.has(String(target))) {
            return packError(
              'SP-REF-202',
              'script/graph.json',
              `${nodePointer}/blankSpec/continuations/${continuationIndex}`,
            )
          }
        }
      }
      // Media refs
      if (Array.isArray(node.mediaRefs)) {
        for (const [refIndex, mediaRef] of (
          node.mediaRefs as unknown[]
        ).entries()) {
          if (!mediaIdSet.has(String(mediaRef))) {
            return packError(
              'SP-REF-203',
              'script/graph.json',
              `${nodePointer}/mediaRefs/${refIndex}`,
            )
          }
        }
      }
      // Cast refs
      if (Array.isArray(node.castRefs)) {
        for (const [refIndex, castRef] of (
          node.castRefs as unknown[]
        ).entries()) {
          if (!castNameSet.has(String(castRef))) {
            return packError(
              'SP-REF-204',
              'script/graph.json',
              `${nodePointer}/castRefs/${refIndex}`,
            )
          }
        }
      }
    }
  }

  // 3. External files existence check
  if (Array.isArray(manifest.cast)) {
    for (const [index, castPath] of (manifest.cast as unknown[]).entries()) {
      if (context.files.exists?.(String(castPath)) === false) {
        return packError('SP-REF-204', 'manifest.json', `/cast/${index}`)
      }
    }
  }
  if (Array.isArray(manifest.lorebooks)) {
    for (const [index, lorebookPath] of (
      manifest.lorebooks as unknown[]
    ).entries()) {
      if (context.files.exists?.(String(lorebookPath)) === false) {
        return packError('SP-REF-205', 'manifest.json', `/lorebooks/${index}`)
      }
    }
  }

  return undefined
}
