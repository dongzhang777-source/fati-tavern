import { packError, type StoryPackError } from '../errors'
import { EMBEDDING_DIM, EMBEDDING_DTYPE, EMBEDDING_FILE, SHA256_PATTERN } from '../constants'
import { isRecord } from '../json'
import type { EmbeddingRef } from '../types'

const EMBEDDING_KEYS = ['file', 'dtype', 'dim', 'count', 'sha256'] as const

export function validateEmbedding(
  embedding: unknown,
): StoryPackError | undefined {
  if (embedding === null || embedding === undefined) {
    return undefined
  }
  if (!isRecord(embedding)) {
    return packError('SP-MAN-015', 'manifest.json', '/embedding')
  }
  for (const [key, value] of Object.entries(embedding)) {
    if (Array.isArray(value)) {
      return packError('SP-EMB-401', 'manifest.json', `/embedding/${key}`)
    }
  }
  for (const key of Object.keys(embedding)) {
    if (!(EMBEDDING_KEYS as readonly string[]).includes(key)) {
      return packError('SP-MAN-012', 'manifest.json', `/embedding/${key}`)
    }
  }
  for (const key of EMBEDDING_KEYS) {
    if (!(key in embedding) || embedding[key] === undefined) {
      return packError('SP-MAN-014', 'manifest.json', `/embedding/${key}`)
    }
  }
  if (typeof embedding.file !== 'string') {
    return packError('SP-MAN-015', 'manifest.json', '/embedding/file')
  }
  if (embedding.file.includes('..') || embedding.file.includes('/')) {
    return packError('SP-REF-212', 'manifest.json', '/embedding/file')
  }
  if (embedding.file !== EMBEDDING_FILE) {
    return packError('SP-MAN-016', 'manifest.json', '/embedding/file')
  }
  if (embedding.dtype !== EMBEDDING_DTYPE) {
    return packError('SP-EMB-403', 'manifest.json', '/embedding/dtype')
  }
  if (embedding.dim !== EMBEDDING_DIM) {
    return packError('SP-EMB-402', 'manifest.json', '/embedding/dim')
  }
  if (
    typeof embedding.count !== 'number' ||
    !Number.isInteger(embedding.count) ||
    embedding.count < 1
  ) {
    return packError('SP-MAN-015', 'manifest.json', '/embedding/count')
  }
  if (
    typeof embedding.sha256 !== 'string' ||
    !SHA256_PATTERN.test(embedding.sha256)
  ) {
    return packError('SP-MED-304', 'manifest.json', '/embedding/sha256')
  }
  return undefined
}

export function buildSafeEmbedding(
  raw: unknown,
): EmbeddingRef | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null) return null
  if (!isRecord(raw)) return null
  return {
    file: 'vectors.bin',
    dtype: 'int8',
    dim: 384,
    count: Number(raw.count),
    sha256: String(raw.sha256),
  }
}
