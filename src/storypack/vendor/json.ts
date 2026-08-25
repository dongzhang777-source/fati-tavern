import { packError, type StoryPackError } from './errors'

const HAZARD_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function escapeJsonPointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

export function parseJson(text: string): unknown {
  return JSON.parse(text)
}

export function parseManifest(text: string): unknown | StoryPackError {
  try {
    return JSON.parse(text)
  } catch {
    return packError('SP-MAN-002', 'manifest.json', '')
  }
}

export function parseGraph(text: string): unknown | StoryPackError {
  try {
    return JSON.parse(text)
  } catch {
    return packError('SP-MAN-004', 'script/graph.json', '')
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function findHazardKey(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') {
    return undefined
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const nested = findHazardKey(value[i])
      if (nested !== undefined) {
        return `/${i}${nested}`
      }
    }
    return undefined
  }

  const ownProps = Object.getOwnPropertyNames(value)
  for (const key of ownProps) {
    if (HAZARD_KEYS.has(key)) {
      return `/${escapeJsonPointer(key)}`
    }
  }

  for (const key of ownProps) {
    const child = (value as Record<string, unknown>)[key]
    const childPointer = findHazardKey(child)
    if (childPointer !== undefined) {
      return `/${escapeJsonPointer(key)}${childPointer}`
    }
  }
  return undefined
}
