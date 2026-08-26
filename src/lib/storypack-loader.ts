import { validateStoryPack } from '../storypack/vendor'
import type { StoryPackResult, LocalizedText } from '../storypack/vendor'
import type { Lang } from './i18n'

export interface PackIndexItem {
  packId: string
  dir: string
}

export interface PackIndex {
  packs: PackIndexItem[]
}

/** 包目录名白名单：先校验再拼 URL，防路径穿越与非法字符 */
const PACK_DIR_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i

export async function loadPackIndex(): Promise<PackIndex> {
  const baseUrl = import.meta.env.BASE_URL ?? '/'
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const res = await fetch(`${cleanBase}storypacks/manifest.json`)
  if (!res.ok) throw new Error('Failed to load pack index')
  return res.json()
}

export async function loadPack(dir: string): Promise<StoryPackResult> {
  if (!PACK_DIR_PATTERN.test(dir)) {
    return { ok: false, code: 'SP-MAN-001', file: dir, pointer: '' }
  }
  try {
    const baseUrl = import.meta.env.BASE_URL ?? '/'
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    const [manifestRes, graphRes] = await Promise.all([
      fetch(`${cleanBase}storypacks/${dir}/manifest.json`),
      fetch(`${cleanBase}storypacks/${dir}/script/graph.json`),
    ])
    if (!manifestRes.ok || !graphRes.ok) {
      return { ok: false, code: 'SP-MAN-001', file: dir, pointer: '' }
    }
    const manifest = await manifestRes.json()
    const graph = await graphRes.json()
    return validateStoryPack({ manifest, graph })
  } catch {
    return { ok: false, code: 'SP-MAN-001', file: dir, pointer: '' }
  }
}

/** 按用户语言解析 LocalizedText：zh→zh-Hans，缺失回退 en，再回退首值；异常入参安全返回空串 */
export function resolveLocalizedText(text: LocalizedText | undefined | null, lang: Lang): string {
  if (!text || typeof text !== 'object') return ''
  const locale = lang === 'zh' ? 'zh-Hans' : lang === 'en' ? 'en' : lang === 'ja' ? 'ja' : 'ko'
  return text[locale] ?? text.en ?? Object.values(text)[0] ?? ''
}
