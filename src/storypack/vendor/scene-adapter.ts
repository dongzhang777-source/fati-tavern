import type { Choice, Scene } from './runtime-types'
import type { StoryNode } from './types'

export type SceneNode = Extract<StoryNode, { kind: 'scene' }>

export function adaptScene(node: SceneNode, createdAt = Date.now()): Scene {
  const choices: Choice[] = node.choices.map((choice) => ({
    id: choice.id,
    text: choice.label.en ?? Object.values(choice.label)[0] ?? '',
  }))
  return {
    id: node.id,
    text: node.text.en ?? Object.values(node.text)[0] ?? '',
    choices,
    createdAt,
  }
}
