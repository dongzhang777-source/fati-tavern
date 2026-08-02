import { describe, it, expect } from 'vitest'
import { passesContentFilter } from './tavern'

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
