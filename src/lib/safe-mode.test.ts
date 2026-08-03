import { describe, it, expect } from 'vitest'
import { passesContentFilter, deriveBookRating, parseLorebookJson, type TavernBook } from './tavern'

const book = (over: Partial<TavernBook> = {}): TavernBook => ({ entries: [], ...over })

describe('deriveBookRating（世界书分级）', () => {
  it('显式分级优先', () => {
    expect(deriveBookRating(book({ contentRating: 'adult', tags: ['fantasy'] }))).toBe('adult')
    expect(deriveBookRating(book({ contentRating: 'all', tags: ['nsfw'] }))).toBe('all')
  })
  it('无显式分级时按 tags 推断', () => {
    expect(deriveBookRating(book({ tags: ['dark fantasy', 'NSFW'] }))).toBe('adult')
    expect(deriveBookRating(book({ tags: ['成人向设定'] }))).toBe('adult')
    expect(deriveBookRating(book({ tags: ['fantasy', 'sci-fi'] }))).toBe('unknown')
    expect(deriveBookRating(book())).toBe('unknown')
  })
  it('parseLorebookJson 保留 tags 与显式分级', () => {
    const parsed = parseLorebookJson({
      name: 'test', entries: [],
      tags: ['nsfw', 'horror'], contentRating: 'adult',
    })
    expect(parsed?.tags).toEqual(['nsfw', 'horror'])
    expect(parsed?.contentRating).toBe('adult')
  })
  it('safeMode 下 adult 世界书被过滤', () => {
    expect(passesContentFilter(deriveBookRating(book({ tags: ['nsfw'] })), true)).toBe(false)
    expect(passesContentFilter(deriveBookRating(book({ tags: ['fantasy'] })), true)).toBe(true)
    expect(passesContentFilter(deriveBookRating(book({ tags: ['nsfw'] })), false)).toBe(true)
  })
})

describe('passesContentFilter（安全模式过滤）', () => {
  it('safeMode=false 时全部可见', () => {
    expect(passesContentFilter('adult', false)).toBe(true)
    expect(passesContentFilter('all', false)).toBe(true)
    expect(passesContentFilter('suggestive', false)).toBe(true)
    expect(passesContentFilter('unknown', false)).toBe(true)
    expect(passesContentFilter(undefined, false)).toBe(true)
  })

  it('safeMode=true 时排除 adult', () => {
    expect(passesContentFilter('adult', true)).toBe(false)
  })

  it('safeMode=true 时保留 all/suggestive/unknown/缺失', () => {
    expect(passesContentFilter('all', true)).toBe(true)
    expect(passesContentFilter('suggestive', true)).toBe(true)
    expect(passesContentFilter('unknown', true)).toBe(true)
    expect(passesContentFilter(undefined, true)).toBe(true)
  })
})
