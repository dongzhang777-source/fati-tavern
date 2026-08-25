import { packError, type StoryPackError } from '../errors'
import { CONTROL_CHAR_PATTERN, LOCALES } from '../constants'
import { isRecord } from '../json'
import type { Locale, LocalizedText } from '../types'

export function copyLocalizedText(
  raw: Record<string, unknown>,
): LocalizedText {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      result[key] = value
    }
  }
  return result as LocalizedText
}

export function validateLocalized(
  value: unknown,
  file: string,
  pointer: string,
  languages: readonly Locale[],
  maxLength: number,
): StoryPackError | undefined {
  if (!isRecord(value)) {
    return packError('SP-MAN-015', file, pointer)
  }
  const keys = Object.keys(value)
  if (keys.length === 0) {
    return packError('SP-TXT-701', file, pointer)
  }

  // S10: Default language check (manifest.language[0] must be present)
  if (languages.length > 0 && !(languages[0] in value)) {
    return packError('SP-TXT-702', file, pointer)
  }

  // S10: Declared language coverage (all declared languages must be present)
  for (const language of languages) {
    if (!(language in value)) {
      return packError('SP-TXT-704', file, pointer)
    }
  }

  // S10: Locale registration, types, lengths, control characters
  for (const key of keys) {
    if (!(LOCALES as readonly string[]).includes(key)) {
      return packError('SP-TXT-703', file, `${pointer}/${key}`)
    }
    const text = value[key]
    if (typeof text !== 'string') {
      return packError('SP-MAN-015', file, `${pointer}/${key}`)
    }
    if (text.length === 0) {
      return packError('SP-TXT-701', file, `${pointer}/${key}`)
    }
    if (text.length > maxLength) {
      return packError('SP-MAN-017', file, `${pointer}/${key}`)
    }
    if (CONTROL_CHAR_PATTERN.test(text)) {
      return packError('SP-TXT-705', file, `${pointer}/${key}`)
    }
  }

  return undefined
}
