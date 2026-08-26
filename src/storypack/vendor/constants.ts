import type { Locale, SceneMood } from './types'

export const STORYPACK_SCHEMA_MAJOR = 2

export const LOCALES: readonly Locale[] = [
  'en',
  'zh-Hans',
  'zh-Hant',
  'ja',
  'ko',
  'de',
  'fr',
  'es',
  'pt-BR',
  'ru',
] as const

export const SCENE_MOODS: readonly SceneMood[] = [
  'peace',
  'melancholy',
  'mystery',
  'tension',
  'joy',
  'dream',
  'epic',
  'intimate',
] as const

export const VISUAL_TEMPLATES = [
  'aurora',
  'embers',
  'rain',
  'snow',
  'starfield',
  'fog',
  'flash',
  'glitch',
] as const
export const EASINGS = ['linear', 'easeOut', 'easeInOut'] as const
export const TRANSITIONS = ['crossfade', 'cut', 'filter_sweep'] as const
export const SLOT_KINDS = ['player_turn', 'relay_round'] as const
export const FALLBACK_MODES = ['ghost_ai', 'skip_to_next'] as const
export const TONES = ['any', 'heroic', 'comedic', 'dark', 'romantic'] as const
export const GENRES = [
  'fantasy',
  'scifi',
  'mystery',
  'romance',
  'horror',
  'slice-of-life',
] as const
export const TIERS = ['base', 'curated'] as const
export const RATINGS = ['all', 'suggestive', 'adult'] as const
export const CHANNELS = ['desktop-web', 'mobile-pwa'] as const
export const PROVENANCES = ['ai', 'human', 'hybrid'] as const
export const ORIGIN_CHANNELS = ['official', 'ugc'] as const
export const MEDIA_KINDS = ['illustration', 'stem', 'clip'] as const

export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/
export const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/
export const SHA256_PATTERN = /^[a-f0-9]{64}$/

export const MEDIA_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'video/webm',
}

export const ALLOWED_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/webp',
  'image/jpeg',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'video/webm',
] as const

export const MEDIA_LIMITS = {
  illustration: 300_000,
  stem: 400_000,
  clip: 800_000,
} as const

export const TIER_LIMITS = {
  base: 500_000,
  curated: 2_000_000,
} as const

export const EMBEDDING_DIM = 384
export const EMBEDDING_DTYPE = 'int8'
export const EMBEDDING_FILE = 'vectors.bin'

// eslint-disable-next-line no-control-regex — 有意匹配控制字符做输入清理
export const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/
export const CUE_INJECTION_PATTERN = /url\(|expression\(|javascript:/i
export const PARAM_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,23}$/

export const TITLE_MAX_LENGTH = 80
export const SUMMARY_MAX_LENGTH = 280
export const CREATOR_NAME_MAX_LENGTH = 40
export const CREATOR_PEER_ID_MAX_LENGTH = 64
export const LICENSE_MAX_LENGTH = 48
export const TAGS_MAX_COUNT = 12
export const TAG_MAX_LENGTH = 24
export const NODE_TEXT_MAX_LENGTH = 4000
export const CHOICE_LABEL_MAX_LENGTH = 60
export const PROMPT_MAX_LENGTH = 280
export const BLANK_FORBIDDEN_MAX_COUNT = 8
export const BLANK_FORBIDDEN_WORD_MAX_LENGTH = 20
export const BLANK_MIN_CHARS_MIN = 1
export const BLANK_MAX_CHARS_MAX = 2000
export const MAX_NODES_COUNT = 64
export const MAX_CHOICES_PER_SCENE = 4
export const MAX_MEDIA_REFS = 4
export const MAX_CONTINUATIONS = 4
export const MAX_CUE_PARAMS = 16
export const CUE_PARAM_STRING_MAX_LENGTH = 64
export const MUSIC_TRANSITION_DURATION_MIN = 120
export const MUSIC_TRANSITION_DURATION_MAX = 6000
export const VISUAL_DURATION_MIN = 120
export const VISUAL_DURATION_MAX = 5000
