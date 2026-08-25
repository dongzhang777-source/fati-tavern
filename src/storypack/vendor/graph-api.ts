import type { StoryNode, StoryPackV2 } from './types'

export function lookupNode(pack: StoryPackV2, id: string): StoryNode | undefined {
  return pack.graph.nodes.find((node) => node.id === id)
}

export function outgoingEdges(pack: StoryPackV2, id: string): string[] {
  const node = lookupNode(pack, id)
  if (!node) return []
  if (node.kind !== 'blank' && Array.isArray(node.choices)) {
    return node.choices.map((choice) => choice.target)
  }
  return node.kind === 'blank' ? [...node.blankSpec.continuations] : []
}

export function reachableFromRoot(pack: StoryPackV2): Set<string> {
  const reachable = new Set([pack.graph.rootId])
  const queue = [pack.graph.rootId]
  while (queue.length > 0) {
    for (const target of outgoingEdges(pack, queue.shift()!)) {
      if (!reachable.has(target)) {
        reachable.add(target)
        queue.push(target)
      }
    }
  }
  return reachable
}

export function endingSet(pack: StoryPackV2): Set<string> {
  return new Set(pack.graph.nodes.filter((node) => 'text' in node && node.kind === 'ending').map((node) => node.id))
}
