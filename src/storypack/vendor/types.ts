export type Locale =
  | 'en'
  | 'zh-Hans'
  | 'zh-Hant'
  | 'ja'
  | 'ko'
  | 'de'
  | 'fr'
  | 'es'
  | 'pt-BR'
  | 'ru'

export type LocalizedText = Partial<Record<Locale, string>> & { [key: string]: string }

export type ContentRating = 'all' | 'suggestive' | 'adult'
export type PackTier = 'base' | 'curated'
export type SceneMood =
  | 'peace'
  | 'melancholy'
  | 'mystery'
  | 'tension'
  | 'joy'
  | 'dream'
  | 'epic'
  | 'intimate'

export interface Manifest {
  schemaVersion: `${number}.${number}`
  packId: string
  title: LocalizedText
  summary: LocalizedText
  language: Locale[]
  origin: { channel: 'official' | 'ugc'; provenance: 'ai' | 'human' | 'hybrid' }
  creator: { name: string; peerId?: string }
  license?: string
  contentRating: ContentRating
  ageGateRequired: boolean
  distribution: {
    channels: Array<'desktop-web' | 'mobile-pwa'>
    publicIndex: boolean
  }
  tier: PackTier
  genres: Array<'fantasy' | 'scifi' | 'mystery' | 'romance' | 'horror' | 'slice-of-life'>
  tags: string[]
  media?: MediaAsset[]
  cast?: string[]
  lorebooks?: string[]
  embedding?: EmbeddingRef | null
  stats: { nodes: number; endings: number; blanks: number }
  size: { scriptBytes: number; mediaBytes: number; totalBytes: number }
}

export interface MediaAsset {
  id: string
  kind: 'illustration' | 'stem' | 'clip'
  file: string
  mimeType: string
  sha256: string
  bytes: number
}

export interface EmbeddingRef {
  file: 'vectors.bin'
  dtype: 'int8'
  dim: 384
  count: number
  sha256: string
}

export interface MusicCue {
  mood: SceneMood
  intensity?: number
  transitionType?: 'crossfade' | 'cut' | 'filter_sweep'
  transitionDurationMs?: number
}

export interface VisualCue {
  template:
    | 'aurora'
    | 'embers'
    | 'rain'
    | 'snow'
    | 'starfield'
    | 'fog'
    | 'flash'
    | 'glitch'
  durationMs?: number
  easing?: 'linear' | 'easeOut' | 'easeInOut'
  params?: Record<string, string | number | boolean>
}

export interface BlankSpec {
  slotKind: 'player_turn' | 'relay_round'
  prompt: LocalizedText
  constraints: {
    minChars: number
    maxChars: number
    tone?: 'any' | 'heroic' | 'comedic' | 'dark' | 'romantic'
    forbidden?: string[]
  }
  fallback: { mode: 'ghost_ai' | 'skip_to_next'; ghostHint?: LocalizedText }
  continuations: string[]
}

export interface StoryChoice {
  id: string
  label: LocalizedText
  target: string
}

export type StoryNode =
  | {
      id: string
      kind: 'scene'
      text: LocalizedText
      choices: StoryChoice[]
      audioCue?: MusicCue
      visualCue?: VisualCue
      mediaRefs?: string[]
      castRefs?: string[]
    }
  | {
      id: string
      kind: 'ending'
      text: LocalizedText
      choices: []
      audioCue?: MusicCue
      visualCue?: VisualCue
      mediaRefs?: string[]
      castRefs?: string[]
    }
  | {
      id: string
      kind: 'blank'
      prompt: LocalizedText
      choices: []
      blankSpec: BlankSpec
      audioCue?: MusicCue
      visualCue?: VisualCue
      mediaRefs?: string[]
      castRefs?: string[]
    }

export interface StoryGraph {
  rootId: string
  endingIds: string[]
  nodes: StoryNode[]
}

export interface StoryPackV2 {
  manifest: Manifest
  graph: StoryGraph
}

export interface StoryPackFiles {
  manifest?: unknown
  graph?: unknown
  exists?(path: string): boolean
  readFile?(path: string): Promise<Uint8Array>
}
