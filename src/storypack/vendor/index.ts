/**
 * StoryPack vendor barrel——fati engine storypack 模块的 vendored 副本。
 * 所有 import 路径已在 vendor 内部自洽，不依赖 fati 项目。
 */
export { validateStoryPack, isStoryPackError } from './validator'
export type { StoryPackResult } from './validator'
export type {
  StoryPackV2, StoryNode, StoryGraph, StoryChoice,
  Manifest, LocalizedText, Locale, ContentRating,
  StoryPackFiles, BlankSpec, MusicCue, VisualCue, SceneMood,
  SceneAdapterOptions,
} from './types'
export { lookupNode, outgoingEdges, reachableFromRoot, endingSet } from './graph-api'
export { adaptScene } from './scene-adapter'
export { parseManifest, parseGraph, isRecord } from './json'
export type { StoryPackError, StoryPackErrorCode } from './errors'
