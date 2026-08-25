import { packError, type StoryPackError } from './errors'
import { findHazardKey, isRecord } from './json'
import { LOCALES } from './constants'
import { buildSafeManifest, validateManifestStructure, validateMedia } from './rules/manifest'
import { validateEmbedding } from './rules/embedding'
import {
  validateGraphContainer,
  validateNodeIdsAndDuplicates,
  validateNodeStructures,
} from './rules/graph-shape'
import { copyLocalizedText, validateLocalized } from './rules/localized-text'
import { validateReferences } from './rules/references'
import {
  detectCycle,
  validateEndingsAndDeadEnds,
  validateReachability,
  validateRootSanity,
} from './rules/dag'
import { validateCues, buildSafeMusicCue, buildSafeVisualCue } from './rules/cues'
import { validateCrossFile } from './rules/cross-file'
import type {
  Locale,
  StoryChoice,
  StoryNode,
  StoryPackFiles,
  StoryPackV2,
} from './types'

type RawNode = Record<string, unknown>

export type StoryPackResult = { ok: true; pack: StoryPackV2 } | StoryPackError

export function isStoryPackError(value: unknown): value is StoryPackError {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === false
}

function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly string[]).includes(String(value))
}

/**
 * StoryPack v2 校验入口（S0-S18，首错即停，错误归因唯一）。
 * 调用方传入已解析的 manifest/graph（坏 JSON 用 symbol 哨兵、缺文件传 undefined），
 * 跨文件真值经 exists/readFile 注入，核心不直接读盘。
 */
export async function validateStoryPack(files: StoryPackFiles): Promise<StoryPackResult> {
  // S0：文件存在
  if (typeof files.manifest === 'undefined') return packError('SP-MAN-001', 'manifest.json')
  if (typeof files.graph === 'undefined') return packError('SP-MAN-003', 'script/graph.json')
  // S1：JSON 可解析（解析失败由调用方以 symbol 哨兵传入）
  if (typeof files.manifest === 'symbol') return packError('SP-MAN-002', 'manifest.json')
  if (typeof files.graph === 'symbol') return packError('SP-MAN-004', 'script/graph.json')

  const manifestRaw = files.manifest
  const graphRaw = files.graph

  // S2：原型污染键扫描（两文档全深度）
  const manifestHazard = findHazardKey(manifestRaw)
  if (manifestHazard) return packError('SP-MAN-013', 'manifest.json', manifestHazard)
  const graphHazard = findHazardKey(graphRaw)
  if (graphHazard) return packError('SP-MAN-013', 'script/graph.json', graphHazard)
  if (!isRecord(manifestRaw)) return packError('SP-MAN-015', 'manifest.json')
  if (!isRecord(graphRaw)) return packError('SP-MAN-015', 'script/graph.json')

  // S3-S4：manifest 白名单/必需/类型/版本/枚举/格式/长度 + 分级政策
  const manifestError = validateManifestStructure(manifestRaw)
  if (manifestError) return manifestError

  // S5：media 块
  const mediaError = validateMedia(manifestRaw.media, String(manifestRaw.tier))
  if (mediaError) return mediaError

  // S6：embedding 块
  const embeddingError = validateEmbedding(manifestRaw.embedding)
  if (embeddingError) return embeddingError

  // S7-S9：graph 容器 → id → 节点结构/choices/blankSpec
  const containerError = validateGraphContainer(graphRaw)
  if (containerError) return containerError
  const nodes = graphRaw.nodes as RawNode[]
  const idsError = validateNodeIdsAndDuplicates(nodes)
  if (idsError) return idsError
  const structureError = validateNodeStructures(nodes)
  if (structureError) return structureError

  // S10：i18n（manifest 文案 → 节点文本 → 选项标签）
  const languages = (Array.isArray(manifestRaw.language) ? manifestRaw.language : [])
    .filter(isLocale) as Locale[]
  for (const key of ['title', 'summary'] as const) {
    const textError = validateLocalized(
      manifestRaw[key],
      'manifest.json',
      `/${key}`,
      languages,
      key === 'title' ? 80 : 280,
    )
    if (textError) return textError
  }
  for (const [index, node] of nodes.entries()) {
    const pointer = `/nodes/${index}`
    let textError: StoryPackError | undefined
    if ('text' in node) {
      textError = validateLocalized(node.text, 'script/graph.json', `${pointer}/text`, languages, 4000)
    }
    if (!textError && 'prompt' in node) {
      textError = validateLocalized(node.prompt, 'script/graph.json', `${pointer}/prompt`, languages, 280)
      const blankSpec = isRecord(node.blankSpec) ? node.blankSpec : undefined
      if (!textError && blankSpec && 'prompt' in blankSpec) {
        textError = validateLocalized(
          blankSpec.prompt,
          'script/graph.json',
          `${pointer}/blankSpec/prompt`,
          languages,
          280,
        )
      }
      const fallback = blankSpec && isRecord(blankSpec.fallback) ? blankSpec.fallback : undefined
      if (!textError && fallback && 'ghostHint' in fallback) {
        textError = validateLocalized(
          fallback.ghostHint,
          'script/graph.json',
          `${pointer}/blankSpec/fallback/ghostHint`,
          languages,
          280,
        )
      }
    }
    if (!textError && node.kind === 'scene' && Array.isArray(node.choices)) {
      for (const [choiceIndex, choice] of (node.choices as RawNode[]).entries()) {
        textError = validateLocalized(
          choice?.label,
          'script/graph.json',
          `${pointer}/choices/${choiceIndex}/label`,
          languages,
          60,
        )
        if (textError) break
      }
    }
    if (textError) return textError
  }

  // S11：引用解析（含 cast/lorebook 文件存在）
  const nodeIds = nodes.map((node) => String(node.id))
  const media = Array.isArray(manifestRaw.media) ? (manifestRaw.media as RawNode[]) : []
  const castNames = (Array.isArray(manifestRaw.cast) ? (manifestRaw.cast as unknown[]) : []).map(
    (item) => String(item).replace(/^characters\//, '').replace(/\.json$/, ''),
  )
  const referenceError = validateReferences(graphRaw, manifestRaw, {
    nodeIds,
    mediaIds: media.map((asset) => String(asset?.id)),
    castNames,
    files,
  })
  if (referenceError) return referenceError

  // S12-S15：根 → 环 → 可达性 → 结局集/死端
  const rootId = String(graphRaw.rootId)
  const rootError = validateRootSanity(rootId, nodes)
  if (rootError) return rootError
  const cycleError = detectCycle(rootId, nodes)
  if (cycleError) return cycleError
  const reachabilityError = validateReachability(rootId, nodes)
  if (reachabilityError) return reachabilityError
  const endingsError = validateEndingsAndDeadEnds(graphRaw.endingIds as unknown[], nodes)
  if (endingsError) return endingsError

  // S16：留白占比护栏
  const blankCount = nodes.filter((node) => node.kind === 'blank').length
  if (blankCount > Math.max(1, Math.floor(0.3 * nodes.length))) {
    return packError('SP-BLK-504', 'script/graph.json', '/nodes')
  }

  // S17：cue 深检
  for (const [index, node] of nodes.entries()) {
    const cueError = validateCues(node, 'script/graph.json', `/nodes/${index}`)
    if (cueError) return cueError
  }

  // S18：跨文件真值
  const endingCount = nodes.filter((node) => node.kind === 'ending').length
  const crossFileError = await validateCrossFile(manifestRaw, {
    files,
    nodeCount: nodes.length,
    endingCount,
    blankCount,
    mediaBytes: media.reduce((sum, asset) => sum + Number(asset?.bytes ?? 0), 0),
  })
  if (crossFileError) return crossFileError

  return buildPack(manifestRaw, graphRaw)
}

/** 全部校验通过后重建安全对象（逐字段拷贝，白名单外键不带出） */
function buildPack(manifestRaw: Record<string, unknown>, graphRaw: Record<string, unknown>): StoryPackResult {
  const nodes: StoryNode[] = []
  for (const rawNode of graphRaw.nodes as RawNode[]) {
    nodes.push(safeNode(rawNode))
  }
  const pack: StoryPackV2 = {
    manifest: buildSafeManifest(manifestRaw),
    graph: {
      rootId: String(graphRaw.rootId),
      endingIds: Array.isArray(graphRaw.endingIds) ? (graphRaw.endingIds as unknown[]).map(String) : [],
      nodes,
    },
  }
  return { ok: true, pack }
}

function safeNode(raw: RawNode): StoryNode {
  const id = String(raw.id)
  const kind = raw.kind as StoryNode['kind']
  const audioCue = isRecord(raw.audioCue) ? buildSafeMusicCue(raw.audioCue) : undefined
  const visualCue = isRecord(raw.visualCue) ? buildSafeVisualCue(raw.visualCue) : undefined
  const mediaRefs = Array.isArray(raw.mediaRefs) ? (raw.mediaRefs as unknown[]).map(String) : undefined
  const castRefs = Array.isArray(raw.castRefs) ? (raw.castRefs as unknown[]).map(String) : undefined

  if (kind === 'blank') {
    const blankSpec = raw.blankSpec as RawNode
    const constraints = blankSpec.constraints as RawNode
    const fallback = blankSpec.fallback as RawNode
    return {
      id,
      kind,
      prompt: copyLocalizedText(raw.prompt as Record<string, unknown>),
      choices: [],
      blankSpec: {
        slotKind: String(blankSpec.slotKind) as 'player_turn' | 'relay_round',
        prompt: copyLocalizedText(blankSpec.prompt as Record<string, unknown>),
        constraints: {
          minChars: Number(constraints.minChars),
          maxChars: Number(constraints.maxChars),
          ...(constraints.tone !== undefined
            ? { tone: String(constraints.tone) as 'any' | 'heroic' | 'comedic' | 'dark' | 'romantic' }
            : {}),
          ...(Array.isArray(constraints.forbidden)
            ? { forbidden: (constraints.forbidden as unknown[]).map(String) }
            : {}),
        },
        fallback: {
          mode: String(fallback.mode) as 'ghost_ai' | 'skip_to_next',
          ...(isRecord(fallback.ghostHint)
            ? { ghostHint: copyLocalizedText(fallback.ghostHint) }
            : {}),
        },
        continuations: (blankSpec.continuations as unknown[]).map(String),
      },
      ...(audioCue ? { audioCue } : {}),
      ...(visualCue ? { visualCue } : {}),
      ...(mediaRefs ? { mediaRefs } : {}),
      ...(castRefs ? { castRefs } : {}),
    }
  }

  const choices: StoryChoice[] = Array.isArray(raw.choices)
    ? (raw.choices as RawNode[]).map((choice) => ({
        id: String(choice.id),
        label: copyLocalizedText(choice.label as Record<string, unknown>),
        target: String(choice.target),
      }))
    : []

  return {
    id,
    kind: kind as 'scene' | 'ending',
    text: copyLocalizedText(raw.text as Record<string, unknown>),
    choices: kind === 'scene' ? choices : [],
    ...(audioCue ? { audioCue } : {}),
    ...(visualCue ? { visualCue } : {}),
    ...(mediaRefs ? { mediaRefs } : {}),
    ...(castRefs ? { castRefs } : {}),
  } as StoryNode
}
