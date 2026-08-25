import { packError, type StoryPackError } from '../errors'
import {
  CUE_INJECTION_PATTERN,
  CUE_PARAM_STRING_MAX_LENGTH,
  EASINGS,
  MAX_CUE_PARAMS,
  MUSIC_TRANSITION_DURATION_MAX,
  MUSIC_TRANSITION_DURATION_MIN,
  PARAM_KEY_PATTERN,
  SCENE_MOODS,
  TRANSITIONS,
  VISUAL_DURATION_MAX,
  VISUAL_DURATION_MIN,
  VISUAL_TEMPLATES,
} from '../constants'
import { isRecord } from '../json'
import type { MusicCue, SceneMood, VisualCue } from '../types'

const MUSIC_CUE_KEYS = [
  'mood',
  'intensity',
  'transitionType',
  'transitionDurationMs',
] as const

const VISUAL_CUE_KEYS = ['template', 'durationMs', 'easing', 'params'] as const

function checkMusic(
  value: unknown,
  file: string,
  pointer: string,
): StoryPackError | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return packError('SP-MAN-015', file, pointer)

  for (const key of Object.keys(value)) {
    if (!(MUSIC_CUE_KEYS as readonly string[]).includes(key)) {
      return packError('SP-MAN-012', file, `${pointer}/${key}`)
    }
  }

  if (!('mood' in value) || value.mood === undefined) {
    return packError('SP-MAN-014', file, `${pointer}/mood`)
  }
  if (!(SCENE_MOODS as readonly string[]).includes(String(value.mood))) {
    return packError('SP-CUE-901', file, `${pointer}/mood`)
  }

  if ('intensity' in value && value.intensity !== undefined) {
    if (typeof value.intensity !== 'number') {
      return packError('SP-MAN-015', file, `${pointer}/intensity`)
    }
    if (value.intensity < 0 || value.intensity > 1) {
      return packError('SP-CUE-902', file, `${pointer}/intensity`)
    }
  }

  if ('transitionType' in value && value.transitionType !== undefined) {
    if (
      !(TRANSITIONS as readonly string[]).includes(String(value.transitionType))
    ) {
      return packError('SP-CUE-908', file, `${pointer}/transitionType`)
    }
  }

  if (
    'transitionDurationMs' in value &&
    value.transitionDurationMs !== undefined
  ) {
    if (
      typeof value.transitionDurationMs !== 'number' ||
      !Number.isInteger(value.transitionDurationMs)
    ) {
      return packError('SP-MAN-015', file, `${pointer}/transitionDurationMs`)
    }
    if (
      value.transitionDurationMs < MUSIC_TRANSITION_DURATION_MIN ||
      value.transitionDurationMs > MUSIC_TRANSITION_DURATION_MAX
    ) {
      return packError('SP-CUE-904', file, `${pointer}/transitionDurationMs`)
    }
  }

  return undefined
}

function checkVisual(
  value: unknown,
  file: string,
  pointer: string,
): StoryPackError | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return packError('SP-MAN-015', file, pointer)

  for (const key of Object.keys(value)) {
    if (!(VISUAL_CUE_KEYS as readonly string[]).includes(key)) {
      return packError('SP-MAN-012', file, `${pointer}/${key}`)
    }
  }

  if (!('template' in value) || value.template === undefined) {
    return packError('SP-MAN-014', file, `${pointer}/template`)
  }
  if (
    !(VISUAL_TEMPLATES as readonly string[]).includes(String(value.template))
  ) {
    return packError('SP-CUE-903', file, `${pointer}/template`)
  }

  if ('durationMs' in value && value.durationMs !== undefined) {
    if (
      typeof value.durationMs !== 'number' ||
      !Number.isInteger(value.durationMs)
    ) {
      return packError('SP-MAN-015', file, `${pointer}/durationMs`)
    }
    if (
      value.durationMs < VISUAL_DURATION_MIN ||
      value.durationMs > VISUAL_DURATION_MAX
    ) {
      return packError('SP-CUE-904', file, `${pointer}/durationMs`)
    }
  }

  if ('easing' in value && value.easing !== undefined) {
    if (!(EASINGS as readonly string[]).includes(String(value.easing))) {
      return packError('SP-CUE-907', file, `${pointer}/easing`)
    }
  }

  if ('params' in value && value.params !== undefined) {
    const params = value.params
    if (!isRecord(params)) {
      return packError('SP-CUE-906', file, `${pointer}/params`)
    }
    const keys = Object.keys(params)
    if (keys.length > MAX_CUE_PARAMS) {
      return packError('SP-CUE-906', file, `${pointer}/params`)
    }
    for (const key of keys) {
      if (!PARAM_KEY_PATTERN.test(key)) {
        return packError('SP-CUE-906', file, `${pointer}/params/${key}`)
      }
      const parameterValue = params[key]
      if (typeof parameterValue === 'number') {
        if (!Number.isFinite(parameterValue) || parameterValue < 0) {
          return packError('SP-CUE-906', file, `${pointer}/params/${key}`)
        }
      } else if (typeof parameterValue === 'boolean') {
        continue
      } else if (typeof parameterValue === 'string') {
        if (CUE_INJECTION_PATTERN.test(parameterValue)) {
          return packError('SP-CUE-905', file, `${pointer}/params/${key}`)
        }
        if (parameterValue.length > CUE_PARAM_STRING_MAX_LENGTH) {
          return packError('SP-CUE-906', file, `${pointer}/params/${key}`)
        }
      } else {
        return packError('SP-CUE-906', file, `${pointer}/params/${key}`)
      }
    }
  }

  return undefined
}

export function validateCues(
  node: Record<string, unknown>,
  file: string,
  pointer: string,
): StoryPackError | undefined {
  return (
    checkMusic(node.audioCue, file, `${pointer}/audioCue`) ??
    checkVisual(node.visualCue, file, `${pointer}/visualCue`)
  )
}

export function buildSafeMusicCue(raw: Record<string, unknown>): MusicCue {
  return {
    mood: raw.mood as SceneMood,
    ...(raw.intensity !== undefined ? { intensity: Number(raw.intensity) } : {}),
    ...(raw.transitionType !== undefined
      ? { transitionType: raw.transitionType as MusicCue['transitionType'] }
      : {}),
    ...(raw.transitionDurationMs !== undefined
      ? { transitionDurationMs: Number(raw.transitionDurationMs) }
      : {}),
  }
}

export function buildSafeVisualCue(raw: Record<string, unknown>): VisualCue {
  let params: Record<string, string | number | boolean> | undefined
  if (isRecord(raw.params)) {
    params = {}
    for (const [k, v] of Object.entries(raw.params)) {
      if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        params[k] = v
      }
    }
  }
  return {
    template: raw.template as VisualCue['template'],
    ...(raw.durationMs !== undefined
      ? { durationMs: Number(raw.durationMs) }
      : {}),
    ...(raw.easing !== undefined
      ? { easing: raw.easing as VisualCue['easing'] }
      : {}),
    ...(params ? { params } : {}),
  }
}
