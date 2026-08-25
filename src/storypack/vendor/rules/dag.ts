import { packError, type StoryPackError } from '../errors'
import { isRecord } from '../json'

type RawNode = Record<string, unknown>

export function getNodeTargets(node: RawNode): string[] {
  const choices = Array.isArray(node.choices)
    ? (node.choices as Array<Record<string, unknown>>)
    : []
  const blank =
    isRecord(node.blankSpec) && Array.isArray(node.blankSpec.continuations)
      ? (node.blankSpec.continuations as unknown[])
      : []
  return [
    ...choices.map((c) => String(c.target)),
    ...blank.map((t) => String(t)),
  ]
}

export function validateRootSanity(
  rootId: string,
  nodes: RawNode[],
): StoryPackError | undefined {
  // S12: Root sanity: exists → kind=scene
  const rootNode = nodes.find((n) => String(n.id) === rootId)
  if (!rootNode) {
    return packError('SP-DAG-105', 'script/graph.json', '/rootId')
  }
  if (rootNode.kind !== 'scene') {
    return packError('SP-DAG-106', 'script/graph.json', '/rootId')
  }
  return undefined
}

export function detectCycle(
  rootId: string,
  nodes: RawNode[],
): StoryPackError | undefined {
  // S13: 1. Self-loop check across all nodes in order
  for (const [index, node] of nodes.entries()) {
    const targets = getNodeTargets(node)
    if (targets.includes(String(node.id))) {
      return packError('SP-DAG-102', 'script/graph.json', `/nodes/${index}/id`)
    }
  }

  // S13: 2. DFS 3-color cycle detection starting from rootId
  const byId = new Map(nodes.map((n) => [String(n.id), n]))
  const indexById = new Map(nodes.map((n, i) => [String(n.id), i]))
  const state = new Map<string, 0 | 1 | 2>() // 0: unvisited, 1: visiting, 2: visited
  let cycleError: StoryPackError | undefined

  function dfs(uId: string): boolean {
    state.set(uId, 1)
    const uNode = byId.get(uId)
    const uIndex = indexById.get(uId) ?? 0
    for (const vId of getNodeTargets(uNode ?? {})) {
      if (state.get(vId) === 1) {
        cycleError = packError(
          'SP-DAG-101',
          'script/graph.json',
          `/nodes/${uIndex}/id`,
        )
        return true
      }
      if (!state.get(vId)) {
        if (dfs(vId)) return true
      }
    }
    state.set(uId, 2)
    return false
  }

  dfs(rootId)
  return cycleError
}

export function validateReachability(
  rootId: string,
  nodes: RawNode[],
): StoryPackError | undefined {
  // S14: Reachability from root
  const byId = new Map(nodes.map((n) => [String(n.id), n]))
  const reachable = new Set<string>([rootId])
  const queue = [rootId]

  while (queue.length > 0) {
    const curr = queue.shift()!
    const node = byId.get(curr)
    for (const target of getNodeTargets(node ?? {})) {
      if (!reachable.has(target)) {
        reachable.add(target)
        queue.push(target)
      }
    }
  }

  for (const [index, node] of nodes.entries()) {
    if (!reachable.has(String(node.id))) {
      const code = node.kind === 'ending' ? 'SP-DAG-108' : 'SP-DAG-107'
      return packError(code, 'script/graph.json', `/nodes/${index}/id`)
    }
  }
  return undefined
}

export function validateEndingsAndDeadEnds(
  declaredEndingIds: unknown[],
  nodes: RawNode[],
): StoryPackError | undefined {
  // S15: Ending set equality
  const actualEndings = nodes
    .filter((n) => n.kind === 'ending')
    .map((n) => String(n.id))
    .sort()
  const declared = (
    Array.isArray(declaredEndingIds) ? declaredEndingIds : []
  )
    .map(String)
    .sort()

  if (
    actualEndings.length !== declared.length ||
    actualEndings.some((id, i) => id !== declared[i])
  ) {
    return packError('SP-DAG-111', 'script/graph.json', '/endingIds')
  }

  // S15: Dead-end scene check
  for (const [index, node] of nodes.entries()) {
    if (node.kind === 'scene' && getNodeTargets(node).length === 0) {
      return packError('SP-DAG-109', 'script/graph.json', `/nodes/${index}/id`)
    }
  }

  return undefined
}
