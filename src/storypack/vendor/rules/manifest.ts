import { packError, type StoryPackError } from '../errors'
import {
  ALLOWED_MIME_TYPES,
  CHANNELS,
  CREATOR_NAME_MAX_LENGTH,
  CREATOR_PEER_ID_MAX_LENGTH,
  GENRES,
  ID_PATTERN,
  LICENSE_MAX_LENGTH,
  LOCALES,
  MEDIA_EXTENSIONS,
  MEDIA_KINDS,
  MEDIA_LIMITS,
  ORIGIN_CHANNELS,
  PACK_ID_PATTERN,
  PROVENANCES,
  RATINGS,
  SHA256_PATTERN,
  TAGS_MAX_COUNT,
  TAG_MAX_LENGTH,
  TIERS,
} from '../constants'
import { isRecord } from '../json'
import type { ContentRating, Locale, Manifest, MediaAsset, PackTier } from '../types'
import { copyLocalizedText } from './localized-text'
import { buildSafeEmbedding } from './embedding'

const MANIFEST_KEYS = [
  'schemaVersion',
  'packId',
  'title',
  'summary',
  'language',
  'origin',
  'creator',
  'license',
  'contentRating',
  'ageGateRequired',
  'distribution',
  'tier',
  'genres',
  'tags',
  'media',
  'cast',
  'lorebooks',
  'embedding',
  'stats',
  'size',
  // 2026-09-04 仲裁规范升级：fati-server 生产管线注入的进化/溯源关联字段
  //（pipeline.ts：personaId=反馈→bandit 键、sourceTrendId/references=trend 溯源）。
  // 缺省合法；存在时经 buildSafeManifest 白名单重建透传，类型校验见下方 license 同款。
  'personaId',
  'sourceTrendId',
  'references',
] as const

export function validateManifestStructure(
  raw: Record<string, unknown>,
): StoryPackError | undefined {
  // S3: Manifest structure, whitelist, required, types, enums, formats
  for (const key of Object.keys(raw)) {
    if (!(MANIFEST_KEYS as readonly string[]).includes(key)) {
      return packError('SP-MAN-012', 'manifest.json', `/${key}`)
    }
  }

  // schemaVersion
  if (!('schemaVersion' in raw) || raw.schemaVersion === undefined) {
    return packError('SP-MAN-011', 'manifest.json', '/schemaVersion')
  }
  if (typeof raw.schemaVersion !== 'string') {
    return packError('SP-MAN-015', 'manifest.json', '/schemaVersion')
  }
  if (
    !/^\d+\.\d+$/.test(raw.schemaVersion) ||
    !raw.schemaVersion.startsWith('2.')
  ) {
    return packError('SP-MAN-010', 'manifest.json', '/schemaVersion')
  }

  // packId
  if (!('packId' in raw) || raw.packId === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/packId')
  }
  if (typeof raw.packId !== 'string') {
    return packError('SP-MAN-015', 'manifest.json', '/packId')
  }
  if (!PACK_ID_PATTERN.test(raw.packId)) {
    return packError('SP-MAN-016', 'manifest.json', '/packId')
  }

  // title & summary presence / object check
  if (!('title' in raw) || raw.title === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/title')
  }
  if (!isRecord(raw.title)) {
    return packError('SP-MAN-015', 'manifest.json', '/title')
  }
  if (!('summary' in raw) || raw.summary === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/summary')
  }
  if (!isRecord(raw.summary)) {
    return packError('SP-MAN-015', 'manifest.json', '/summary')
  }

  // language
  if (!('language' in raw) || raw.language === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/language')
  }
  if (!Array.isArray(raw.language)) {
    return packError('SP-MAN-015', 'manifest.json', '/language')
  }
  if (raw.language.length === 0) {
    return packError('SP-TXT-703', 'manifest.json', '/language')
  }
  for (const lang of raw.language) {
    if (typeof lang !== 'string') {
      return packError('SP-MAN-015', 'manifest.json', '/language')
    }
    if (!(LOCALES as readonly string[]).includes(lang)) {
      return packError('SP-TXT-703', 'manifest.json', '/language')
    }
  }

  // origin
  if (!('origin' in raw) || raw.origin === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/origin')
  }
  if (!isRecord(raw.origin)) {
    return packError('SP-MAN-015', 'manifest.json', '/origin')
  }
  for (const key of Object.keys(raw.origin)) {
    if (!['channel', 'provenance'].includes(key)) {
      return packError('SP-MAN-012', 'manifest.json', `/origin/${key}`)
    }
  }
  if (!('channel' in raw.origin) || raw.origin.channel === undefined) {
    return packError('SP-RAT-606', 'manifest.json', '/origin/channel')
  }
  if (
    !(ORIGIN_CHANNELS as readonly string[]).includes(String(raw.origin.channel))
  ) {
    return packError('SP-RAT-606', 'manifest.json', '/origin/channel')
  }
  if (!('provenance' in raw.origin) || raw.origin.provenance === undefined) {
    return packError('SP-RAT-605', 'manifest.json', '/origin/provenance')
  }
  if (
    !(PROVENANCES as readonly string[]).includes(String(raw.origin.provenance))
  ) {
    return packError('SP-RAT-605', 'manifest.json', '/origin/provenance')
  }

  // creator
  if (!('creator' in raw) || raw.creator === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/creator')
  }
  if (!isRecord(raw.creator)) {
    return packError('SP-MAN-015', 'manifest.json', '/creator')
  }
  for (const key of Object.keys(raw.creator)) {
    if (!['name', 'peerId'].includes(key)) {
      return packError('SP-MAN-012', 'manifest.json', `/creator/${key}`)
    }
  }
  if (!('name' in raw.creator) || raw.creator.name === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/creator/name')
  }
  if (typeof raw.creator.name !== 'string') {
    return packError('SP-MAN-015', 'manifest.json', '/creator/name')
  }
  if (raw.creator.name.length < 1 || raw.creator.name.length > CREATOR_NAME_MAX_LENGTH) {
    return packError('SP-MAN-017', 'manifest.json', '/creator/name')
  }
  if ('peerId' in raw.creator && raw.creator.peerId !== undefined) {
    if (typeof raw.creator.peerId !== 'string') {
      return packError('SP-MAN-015', 'manifest.json', '/creator/peerId')
    }
    if (raw.creator.peerId.length > CREATOR_PEER_ID_MAX_LENGTH) {
      return packError('SP-MAN-017', 'manifest.json', '/creator/peerId')
    }
  }

  // license
  if ('license' in raw && raw.license !== undefined) {
    if (typeof raw.license !== 'string') {
      return packError('SP-MAN-015', 'manifest.json', '/license')
    }
    if (raw.license.length > LICENSE_MAX_LENGTH) {
      return packError('SP-MAN-017', 'manifest.json', '/license')
    }
  }

  // personaId / sourceTrendId / references（2026-09-04 仲裁规范升级：类型沿 SP-MAN-015、
  // 长度沿 license 的 SP-MAN-017 先例；上限与 schema.json $defs.manifest 同批对齐）
  if ('personaId' in raw && raw.personaId !== undefined) {
    if (typeof raw.personaId !== 'string' || raw.personaId.length === 0) {
      return packError('SP-MAN-015', 'manifest.json', '/personaId')
    }
    if (raw.personaId.length > 48) {
      return packError('SP-MAN-017', 'manifest.json', '/personaId')
    }
  }
  if ('sourceTrendId' in raw && raw.sourceTrendId !== undefined) {
    if (typeof raw.sourceTrendId !== 'string' || raw.sourceTrendId.length === 0) {
      return packError('SP-MAN-015', 'manifest.json', '/sourceTrendId')
    }
    if (raw.sourceTrendId.length > 64) {
      return packError('SP-MAN-017', 'manifest.json', '/sourceTrendId')
    }
  }
  if ('references' in raw && raw.references !== undefined) {
    if (!Array.isArray(raw.references) || raw.references.length > 16 || raw.references.some(r => typeof r !== 'string')) {
      return packError('SP-MAN-015', 'manifest.json', '/references')
    }
    if (raw.references.some(r => r.length === 0 || r.length > 256)) {
      return packError('SP-MAN-017', 'manifest.json', '/references')
    }
  }

  // contentRating
  if (!('contentRating' in raw) || raw.contentRating === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/contentRating')
  }
  if (!(RATINGS as readonly string[]).includes(String(raw.contentRating))) {
    return packError('SP-RAT-601', 'manifest.json', '/contentRating')
  }

  // ageGateRequired
  if (!('ageGateRequired' in raw) || raw.ageGateRequired === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/ageGateRequired')
  }
  if (typeof raw.ageGateRequired !== 'boolean') {
    return packError('SP-MAN-015', 'manifest.json', '/ageGateRequired')
  }

  // distribution
  if (!('distribution' in raw) || raw.distribution === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/distribution')
  }
  if (!isRecord(raw.distribution)) {
    return packError('SP-MAN-015', 'manifest.json', '/distribution')
  }
  for (const key of Object.keys(raw.distribution)) {
    if (!['channels', 'publicIndex'].includes(key)) {
      return packError('SP-MAN-012', 'manifest.json', `/distribution/${key}`)
    }
  }
  if (
    !('channels' in raw.distribution) ||
    raw.distribution.channels === undefined
  ) {
    return packError('SP-MAN-014', 'manifest.json', '/distribution/channels')
  }
  if (
    !Array.isArray(raw.distribution.channels) ||
    raw.distribution.channels.length === 0
  ) {
    return packError('SP-RAT-606', 'manifest.json', '/distribution/channels')
  }
  for (const channel of raw.distribution.channels) {
    if (!(CHANNELS as readonly string[]).includes(String(channel))) {
      return packError('SP-RAT-606', 'manifest.json', '/distribution/channels')
    }
  }
  if (
    !('publicIndex' in raw.distribution) ||
    raw.distribution.publicIndex === undefined
  ) {
    return packError('SP-MAN-014', 'manifest.json', '/distribution/publicIndex')
  }
  if (typeof raw.distribution.publicIndex !== 'boolean') {
    return packError('SP-MAN-015', 'manifest.json', '/distribution/publicIndex')
  }

  // tier
  if (!('tier' in raw) || raw.tier === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/tier')
  }
  if (!(TIERS as readonly string[]).includes(String(raw.tier))) {
    return packError('SP-MAN-019', 'manifest.json', '/tier')
  }

  // genres
  if (!('genres' in raw) || raw.genres === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/genres')
  }
  if (!Array.isArray(raw.genres)) {
    return packError('SP-MAN-015', 'manifest.json', '/genres')
  }
  if (raw.genres.length < 1 || raw.genres.length > 3) {
    return packError('SP-MAN-019', 'manifest.json', '/genres')
  }
  for (const [index, genre] of raw.genres.entries()) {
    if (!(GENRES as readonly string[]).includes(String(genre))) {
      return packError('SP-MAN-019', 'manifest.json', `/genres/${index}`)
    }
  }

  // tags
  if (!('tags' in raw) || raw.tags === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/tags')
  }
  if (!Array.isArray(raw.tags)) {
    return packError('SP-MAN-015', 'manifest.json', '/tags')
  }
  if (raw.tags.length > TAGS_MAX_COUNT) {
    return packError('SP-MAN-017', 'manifest.json', '/tags')
  }
  for (const [index, tag] of raw.tags.entries()) {
    if (typeof tag !== 'string') {
      return packError('SP-MAN-015', 'manifest.json', `/tags/${index}`)
    }
    if (tag.length < 1 || tag.length > TAG_MAX_LENGTH) {
      return packError('SP-MAN-017', 'manifest.json', `/tags/${index}`)
    }
  }

  // stats
  if (!('stats' in raw) || raw.stats === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/stats')
  }
  if (!isRecord(raw.stats)) {
    return packError('SP-MAN-015', 'manifest.json', '/stats')
  }
  for (const key of Object.keys(raw.stats)) {
    if (!['nodes', 'endings', 'blanks'].includes(key)) {
      return packError('SP-MAN-012', 'manifest.json', `/stats/${key}`)
    }
  }
  for (const key of ['nodes', 'endings', 'blanks']) {
    if (!(key in raw.stats) || raw.stats[key] === undefined) {
      return packError('SP-MAN-014', 'manifest.json', `/stats/${key}`)
    }
    const val = raw.stats[key]
    // S3 只验类型；与图真值的一致性归 S18（SP-REF-209）
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
      return packError('SP-MAN-015', 'manifest.json', `/stats/${key}`)
    }
  }

  // size
  if (!('size' in raw) || raw.size === undefined) {
    return packError('SP-MAN-014', 'manifest.json', '/size')
  }
  if (!isRecord(raw.size)) {
    return packError('SP-MAN-015', 'manifest.json', '/size')
  }
  for (const key of Object.keys(raw.size)) {
    if (!['scriptBytes', 'mediaBytes', 'totalBytes'].includes(key)) {
      return packError('SP-MAN-012', 'manifest.json', `/size/${key}`)
    }
  }
  for (const key of ['scriptBytes', 'mediaBytes', 'totalBytes']) {
    if (!(key in raw.size) || raw.size[key] === undefined) {
      return packError('SP-MAN-014', 'manifest.json', `/size/${key}`)
    }
    const val = raw.size[key]
    // S3 只验类型；与资产求和/上限的真值比对归 S5 与 S18
    if (typeof val !== 'number' || !Number.isInteger(val)) {
      return packError('SP-MAN-015', 'manifest.json', `/size/${key}`)
    }
  }

  // cast (optional)
  if ('cast' in raw && raw.cast !== undefined) {
    if (!Array.isArray(raw.cast)) {
      return packError('SP-MAN-015', 'manifest.json', '/cast')
    }
    for (const [index, item] of raw.cast.entries()) {
      if (
        typeof item !== 'string' ||
        !/^characters\/[a-z0-9._-]+\.json$/.test(item)
      ) {
        return packError('SP-MAN-016', 'manifest.json', `/cast/${index}`)
      }
    }
  }

  // lorebooks (optional)
  if ('lorebooks' in raw && raw.lorebooks !== undefined) {
    if (!Array.isArray(raw.lorebooks)) {
      return packError('SP-MAN-015', 'manifest.json', '/lorebooks')
    }
    for (const [index, item] of raw.lorebooks.entries()) {
      if (
        typeof item !== 'string' ||
        !/^lorebooks\/[a-z0-9._-]+\.json$/.test(item)
      ) {
        return packError('SP-MAN-016', 'manifest.json', `/lorebooks/${index}`)
      }
    }
  }

  // S4: Rating policy
  const distribution = raw.distribution as Record<string, unknown>
  const channels = distribution.channels as string[]
  if (raw.contentRating === 'adult') {
    if (channels.includes('mobile-pwa')) {
      return packError(
        'SP-RAT-602',
        'manifest.json',
        '/distribution/channels',
      )
    }
    if (distribution.publicIndex !== false) {
      return packError(
        'SP-RAT-603',
        'manifest.json',
        '/distribution/publicIndex',
      )
    }
    if (raw.ageGateRequired !== true) {
      return packError('SP-RAT-604', 'manifest.json', '/ageGateRequired')
    }
  } else if (raw.contentRating === 'suggestive') {
    if (raw.ageGateRequired !== true) {
      return packError('SP-RAT-604', 'manifest.json', '/ageGateRequired')
    }
  }

  return undefined
}

export function validateMedia(
  media: unknown,
  tier?: string,
): StoryPackError | undefined {
  if (media === undefined) return undefined
  if (!Array.isArray(media)) {
    return packError('SP-MAN-015', 'manifest.json', '/media')
  }
  const ids = new Set<string>()
  for (const [index, asset] of media.entries()) {
    const pointer = `/media/${index}`
    if (!isRecord(asset)) {
      return packError('SP-MAN-015', 'manifest.json', pointer)
    }
    for (const key of Object.keys(asset)) {
      if (!['id', 'kind', 'file', 'mimeType', 'sha256', 'bytes'].includes(key)) {
        return packError('SP-MAN-012', 'manifest.json', `${pointer}/${key}`)
      }
    }
    for (const key of ['id', 'kind', 'file', 'mimeType', 'sha256', 'bytes']) {
      if (!(key in asset) || asset[key] === undefined) {
        if (key === 'mimeType') {
          return packError('SP-MED-303', 'manifest.json', `${pointer}/mimeType`)
        }
        return packError('SP-MAN-014', 'manifest.json', `${pointer}/${key}`)
      }
    }
    if (typeof asset.id !== 'string' || !ID_PATTERN.test(asset.id)) {
      return packError('SP-MAN-016', 'manifest.json', `${pointer}/id`)
    }
    if (ids.has(asset.id)) {
      return packError('SP-REF-208', 'manifest.json', `${pointer}/id`)
    }
    ids.add(asset.id)

    if (!(MEDIA_KINDS as readonly string[]).includes(String(asset.kind))) {
      return packError('SP-MAN-019', 'manifest.json', `${pointer}/kind`)
    }
    if (asset.kind !== 'illustration' && tier === 'base') {
      return packError('SP-MED-307', 'manifest.json', `${pointer}/kind`)
    }

    if (typeof asset.mimeType !== 'string') {
      return packError('SP-MED-303', 'manifest.json', `${pointer}/mimeType`)
    }
    if (asset.mimeType === 'image/svg+xml') {
      return packError('SP-MED-301', 'manifest.json', `${pointer}/mimeType`)
    }
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(asset.mimeType)) {
      return packError('SP-MED-301', 'manifest.json', `${pointer}/mimeType`)
    }

    if (
      typeof asset.file !== 'string' ||
      !/^media\/[a-z0-9._-]+$/.test(asset.file) ||
      asset.file !== asset.file.toLowerCase()
    ) {
      return packError('SP-MAN-016', 'manifest.json', `${pointer}/file`)
    }

    const extension = asset.file.split('.').pop() ?? ''
    const expectedMime = MEDIA_EXTENSIONS[extension]
    if (asset.mimeType !== expectedMime) {
      return packError('SP-MED-302', 'manifest.json', `${pointer}/mimeType`)
    }

    if (
      typeof asset.sha256 !== 'string' ||
      !SHA256_PATTERN.test(asset.sha256)
    ) {
      return packError('SP-MED-304', 'manifest.json', `${pointer}/sha256`)
    }
    if (
      typeof asset.bytes !== 'number' ||
      !Number.isInteger(asset.bytes) ||
      asset.bytes <= 0
    ) {
      return packError('SP-MED-308', 'manifest.json', `${pointer}/bytes`)
    }
    if (
      asset.bytes > MEDIA_LIMITS[asset.kind as keyof typeof MEDIA_LIMITS]
    ) {
      return packError('SP-MED-305', 'manifest.json', `${pointer}/bytes`)
    }
  }
  return undefined
}

export function buildSafeManifest(raw: Record<string, unknown>): Manifest {
  const originRaw = raw.origin as Record<string, unknown>
  const creatorRaw = raw.creator as Record<string, unknown>
  const distRaw = raw.distribution as Record<string, unknown>
  const statsRaw = raw.stats as Record<string, unknown>
  const sizeRaw = raw.size as Record<string, unknown>

  const safeManifest: Manifest = {
    schemaVersion: String(raw.schemaVersion) as `${number}.${number}`,
    packId: String(raw.packId),
    title: copyLocalizedText(raw.title as Record<string, unknown>),
    summary: copyLocalizedText(raw.summary as Record<string, unknown>),
    language: (raw.language as string[]).map((l) => l as Locale),
    origin: {
      channel: originRaw.channel as 'official' | 'ugc',
      provenance: originRaw.provenance as 'ai' | 'human' | 'hybrid',
    },
    creator: {
      name: String(creatorRaw.name),
      ...(creatorRaw.peerId !== undefined ? { peerId: String(creatorRaw.peerId) } : {}),
    },
    ...(raw.license !== undefined ? { license: String(raw.license) } : {}),
    // 2026-09-04 仲裁规范升级：进化/溯源关联字段透传（白名单同批扩展，类型已校验）
    ...(raw.personaId !== undefined ? { personaId: String(raw.personaId) } : {}),
    ...(raw.sourceTrendId !== undefined ? { sourceTrendId: String(raw.sourceTrendId) } : {}),
    ...(Array.isArray(raw.references) ? { references: (raw.references as unknown[]).map(String) } : {}),
    contentRating: raw.contentRating as ContentRating,
    ageGateRequired: Boolean(raw.ageGateRequired),
    distribution: {
      channels: (distRaw.channels as string[]).map((c) => c as 'desktop-web' | 'mobile-pwa'),
      publicIndex: Boolean(distRaw.publicIndex),
    },
    tier: raw.tier as PackTier,
    genres: (raw.genres as string[]).map((g) => g as any),
    tags: (raw.tags as string[]).map(String),
    stats: {
      nodes: Number(statsRaw.nodes),
      endings: Number(statsRaw.endings),
      blanks: Number(statsRaw.blanks),
    },
    size: {
      scriptBytes: Number(sizeRaw.scriptBytes),
      mediaBytes: Number(sizeRaw.mediaBytes),
      totalBytes: Number(sizeRaw.totalBytes),
    },
  }

  if (Array.isArray(raw.media)) {
    safeManifest.media = raw.media.map((asset) => {
      const a = asset as Record<string, unknown>
      return {
        id: String(a.id),
        kind: a.kind as MediaAsset['kind'],
        file: String(a.file),
        mimeType: String(a.mimeType),
        sha256: String(a.sha256),
        bytes: Number(a.bytes),
      }
    })
  }

  if (Array.isArray(raw.cast)) {
    safeManifest.cast = raw.cast.map(String)
  }

  if (Array.isArray(raw.lorebooks)) {
    safeManifest.lorebooks = raw.lorebooks.map(String)
  }

  if (raw.embedding !== undefined) {
    safeManifest.embedding = buildSafeEmbedding(raw.embedding)
  }

  return safeManifest
}
