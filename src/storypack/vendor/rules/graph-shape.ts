import { packError, type StoryPackError } from '../errors'
import {
  FALLBACK_MODES,
  ID_PATTERN,
  SLOT_KINDS,
  TONES,
} from '../constants'
import { isRecord } from '../json'

const GRAPH_KEYS = ['rootId', 'endingIds', 'nodes'] as const
const NODE_KEYS = [
  'id',
  'kind',
  'text',
  'prompt',
  'choices',
  'blankSpec',
  'audioCue',
  'visualCue',
  'mediaRefs',
  'castRefs',
] as const
const BLANK_SPEC_KEYS = [
  'slotKind',
  'prompt',
  'constraints',
  'fallback',
  'continuations',
] as const
const CONSTRAINTS_KEYS = ['minChars', 'maxChars', 'tone', 'forbidden'] as const
const FALLBACK_KEYS = ['mode', 'ghostHint'] as const
const CHOICE_KEYS = ['id', 'label', 'target'] as const

export function validateGraphContainer(
  raw: Record<string, unknown>,
): StoryPackError | undefined {
  // S7: Graph container whitelist, required, types, count
  for (const key of Object.keys(raw)) {
    if (!(GRAPH_KEYS as readonly string[]).includes(key)) {
      return packError('SP-MAN-012', 'script/graph.json', `/${key}`)
    }
  }
  if (!('rootId' in raw) || raw.rootId === undefined || raw.rootId === '') {
    return packError('SP-DAG-104', 'script/graph.json', '/rootId')
  }
  if (typeof raw.rootId !== 'string') {
    return packError('SP-MAN-015', 'script/graph.json', '/rootId')
  }
  if (!('endingIds' in raw) || raw.endingIds === undefined) {
    return packError('SP-MAN-014', 'script/graph.json', '/endingIds')
  }
  if (!Array.isArray(raw.endingIds)) {
    return packError('SP-MAN-015', 'script/graph.json', '/endingIds')
  }
  if (!('nodes' in raw) || raw.nodes === undefined) {
    return packError('SP-MAN-014', 'script/graph.json', '/nodes')
  }
  if (!Array.isArray(raw.nodes)) {
    return packError('SP-MAN-015', 'script/graph.json', '/nodes')
  }
  if (raw.nodes.length === 0) {
    return packError('SP-DAG-112', 'script/graph.json', '/nodes')
  }
  if (raw.nodes.length > 64) {
    return packError('SP-MAN-017', 'script/graph.json', '/nodes')
  }
  return undefined
}

export function validateNodeIdsAndDuplicates(
  nodes: unknown[],
): StoryPackError | undefined {
  // S8: Node IDs & duplicate IDs
  const nodeIds: string[] = []
  for (const [index, node] of nodes.entries()) {
    const pointer = `/nodes/${index}`
    if (!isRecord(node)) {
      return packError('SP-MAN-015', 'script/graph.json', pointer)
    }
    if (!('id' in node) || node.id === undefined) {
      return packError('SP-MAN-014', 'script/graph.json', `${pointer}/id`)
    }
    if (typeof node.id !== 'string') {
      return packError('SP-MAN-015', 'script/graph.json', `${pointer}/id`)
    }
    if (!ID_PATTERN.test(node.id)) {
      return packError('SP-MAN-016', 'script/graph.json', `${pointer}/id`)
    }
    if (nodeIds.includes(node.id)) {
      return packError('SP-REF-206', 'script/graph.json', `${pointer}/id`)
    }
    nodeIds.push(node.id)
  }
  return undefined
}

export function validateNodeStructures(
  nodes: unknown[],
): StoryPackError | undefined {
  // S9: Node structures, choices, blankSpec, ending with choices
  for (const [index, node] of nodes.entries()) {
    const pointer = `/nodes/${index}`
    if (!isRecord(node)) {
      return packError('SP-MAN-015', 'script/graph.json', pointer)
    }
    for (const key of Object.keys(node)) {
      if (!(NODE_KEYS as readonly string[]).includes(key)) {
        return packError(
          'SP-MAN-012',
          'script/graph.json',
          `${pointer}/${key}`,
        )
      }
    }
    if (!('kind' in node) || node.kind === undefined) {
      return packError('SP-MAN-014', 'script/graph.json', `${pointer}/kind`)
    }
    if (
      node.kind !== 'scene' &&
      node.kind !== 'ending' &&
      node.kind !== 'blank'
    ) {
      return packError('SP-MAN-019', 'script/graph.json', `${pointer}/kind`)
    }

    if (node.kind === 'scene') {
      if (!('text' in node) || node.text === undefined) {
        return packError('SP-MAN-014', 'script/graph.json', `${pointer}/text`)
      }
      if (!('choices' in node) || node.choices === undefined) {
        return packError(
          'SP-MAN-014',
          'script/graph.json',
          `${pointer}/choices`,
        )
      }
      if (!Array.isArray(node.choices)) {
        return packError(
          'SP-MAN-015',
          'script/graph.json',
          `${pointer}/choices`,
        )
      }
      if (node.choices.length > 4) {
        return packError(
          'SP-CHO-801',
          'script/graph.json',
          `${pointer}/choices`,
        )
      }
      const choiceError = validateChoices(node.choices, pointer)
      if (choiceError) return choiceError
    } else if (node.kind === 'ending') {
      if (!('text' in node) || node.text === undefined) {
        return packError('SP-MAN-014', 'script/graph.json', `${pointer}/text`)
      }
      if ('choices' in node && node.choices !== undefined) {
        if (!Array.isArray(node.choices)) {
          return packError(
            'SP-MAN-015',
            'script/graph.json',
            `${pointer}/choices`,
          )
        }
        if (node.choices.length > 0) {
          return packError(
            'SP-DAG-110',
            'script/graph.json',
            `${pointer}/choices`,
          )
        }
      }
      if ('blankSpec' in node && node.blankSpec !== undefined) {
        return packError(
          'SP-BLK-509',
          'script/graph.json',
          `${pointer}/blankSpec`,
        )
      }
    } else if (node.kind === 'blank') {
      if (!('prompt' in node) || node.prompt === undefined) {
        return packError(
          'SP-MAN-014',
          'script/graph.json',
          `${pointer}/prompt`,
        )
      }
      if ('choices' in node && node.choices !== undefined) {
        if (!Array.isArray(node.choices)) {
          return packError(
            'SP-MAN-015',
            'script/graph.json',
            `${pointer}/choices`,
          )
        }
        if (node.choices.length > 0) {
          return packError(
            'SP-BLK-503',
            'script/graph.json',
            `${pointer}/choices`,
          )
        }
      }
      if (!('blankSpec' in node) || node.blankSpec === undefined) {
        return packError(
          'SP-BLK-501',
          'script/graph.json',
          `${pointer}/blankSpec`,
        )
      }
      const blankError = validateBlankSpec(node.blankSpec, `${pointer}/blankSpec`)
      if (blankError) return blankError
    }
  }
  return undefined
}

function validateChoices(
  choices: unknown[],
  nodePointer: string,
): StoryPackError | undefined {
  const choiceIds: string[] = []
  for (const [index, choice] of choices.entries()) {
    const pointer = `${nodePointer}/choices/${index}`
    if (!isRecord(choice)) {
      return packError('SP-MAN-015', 'script/graph.json', pointer)
    }
    for (const key of Object.keys(choice)) {
      if (!(CHOICE_KEYS as readonly string[]).includes(key)) {
        return packError('SP-MAN-012', 'script/graph.json', `${pointer}/${key}`)
      }
    }
    for (const key of CHOICE_KEYS) {
      if (!(key in choice) || choice[key] === undefined) {
        return packError('SP-MAN-014', 'script/graph.json', `${pointer}/${key}`)
      }
    }
    if (typeof choice.id !== 'string' || !ID_PATTERN.test(choice.id)) {
      return packError('SP-MAN-016', 'script/graph.json', `${pointer}/id`)
    }
    if (choiceIds.includes(choice.id)) {
      return packError('SP-REF-207', 'script/graph.json', `${pointer}/id`)
    }
    choiceIds.push(choice.id)
    if (typeof choice.target !== 'string') {
      return packError('SP-MAN-015', 'script/graph.json', `${pointer}/target`)
    }
  }
  return undefined
}

function validateBlankSpec(
  value: unknown,
  pointer: string,
): StoryPackError | undefined {
  if (!isRecord(value)) {
    return packError('SP-MAN-015', 'script/graph.json', pointer)
  }
  for (const key of Object.keys(value)) {
    if (!(BLANK_SPEC_KEYS as readonly string[]).includes(key)) {
      return packError('SP-MAN-012', 'script/graph.json', `${pointer}/${key}`)
    }
  }
  if (!('slotKind' in value) || value.slotKind === undefined) {
    return packError('SP-BLK-506', 'script/graph.json', `${pointer}/slotKind`)
  }
  if (!('prompt' in value) || value.prompt === undefined) {
    return packError('SP-BLK-507', 'script/graph.json', `${pointer}/prompt`)
  }
  if (!('constraints' in value) || value.constraints === undefined) {
    return packError(
      'SP-BLK-501',
      'script/graph.json',
      `${pointer}/constraints`,
    )
  }
  if (!('fallback' in value) || value.fallback === undefined) {
    return packError('SP-BLK-502', 'script/graph.json', `${pointer}/fallback`)
  }
  if (!('continuations' in value) || value.continuations === undefined) {
    return packError(
      'SP-BLK-505',
      'script/graph.json',
      `${pointer}/continuations`,
    )
  }

  if (!(SLOT_KINDS as readonly string[]).includes(String(value.slotKind))) {
    return packError('SP-BLK-506', 'script/graph.json', `${pointer}/slotKind`)
  }

  // constraints
  if (!isRecord(value.constraints)) {
    return packError(
      'SP-MAN-015',
      'script/graph.json',
      `${pointer}/constraints`,
    )
  }
  for (const key of Object.keys(value.constraints)) {
    if (!(CONSTRAINTS_KEYS as readonly string[]).includes(key)) {
      return packError(
        'SP-MAN-012',
        'script/graph.json',
        `${pointer}/constraints/${key}`,
      )
    }
  }
  if (
    !('minChars' in value.constraints) ||
    !('maxChars' in value.constraints)
  ) {
    return packError(
      'SP-MAN-014',
      'script/graph.json',
      `${pointer}/constraints`,
    )
  }
  if (
    typeof value.constraints.minChars !== 'number' ||
    typeof value.constraints.maxChars !== 'number'
  ) {
    return packError(
      'SP-MAN-015',
      'script/graph.json',
      `${pointer}/constraints`,
    )
  }
  if (
    value.constraints.minChars < 1 ||
    value.constraints.maxChars < 1 ||
    value.constraints.maxChars > 2000 ||
    value.constraints.minChars > value.constraints.maxChars
  ) {
    return packError(
      'SP-BLK-508',
      'script/graph.json',
      `${pointer}/constraints`,
    )
  }
  if ('tone' in value.constraints && value.constraints.tone !== undefined) {
    if (!(TONES as readonly string[]).includes(String(value.constraints.tone))) {
      return packError(
        'SP-MAN-019',
        'script/graph.json',
        `${pointer}/constraints/tone`,
      )
    }
  }
  if (
    'forbidden' in value.constraints &&
    value.constraints.forbidden !== undefined
  ) {
    if (!Array.isArray(value.constraints.forbidden)) {
      return packError(
        'SP-MAN-015',
        'script/graph.json',
        `${pointer}/constraints/forbidden`,
      )
    }
    if (value.constraints.forbidden.length > 8) {
      return packError(
        'SP-MAN-017',
        'script/graph.json',
        `${pointer}/constraints/forbidden`,
      )
    }
    for (const [index, word] of value.constraints.forbidden.entries()) {
      if (typeof word !== 'string' || word.length < 1 || word.length > 20) {
        return packError(
          'SP-MAN-017',
          'script/graph.json',
          `${pointer}/constraints/forbidden/${index}`,
        )
      }
    }
  }

  // fallback
  if (!isRecord(value.fallback)) {
    return packError('SP-MAN-015', 'script/graph.json', `${pointer}/fallback`)
  }
  for (const key of Object.keys(value.fallback)) {
    if (!(FALLBACK_KEYS as readonly string[]).includes(key)) {
      return packError(
        'SP-MAN-012',
        'script/graph.json',
        `${pointer}/fallback/${key}`,
      )
    }
  }
  if (!('mode' in value.fallback) || value.fallback.mode === undefined) {
    return packError(
      'SP-MAN-014',
      'script/graph.json',
      `${pointer}/fallback/mode`,
    )
  }
  if (
    !(FALLBACK_MODES as readonly string[]).includes(
      String(value.fallback.mode),
    )
  ) {
    return packError(
      'SP-MAN-019',
      'script/graph.json',
      `${pointer}/fallback/mode`,
    )
  }

  // continuations
  if (
    !Array.isArray(value.continuations) ||
    value.continuations.length < 1 ||
    value.continuations.length > 4
  ) {
    return packError(
      'SP-BLK-505',
      'script/graph.json',
      `${pointer}/continuations`,
    )
  }
  for (const [index, target] of value.continuations.entries()) {
    if (typeof target !== 'string') {
      return packError(
        'SP-MAN-015',
        'script/graph.json',
        `${pointer}/continuations/${index}`,
      )
    }
  }
  return undefined
}
