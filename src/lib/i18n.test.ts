import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectLang, saveLang, brandName, docTitle, t, localizeError } from './i18n'

class LocalStorageMock {
  store: Record<string, string> = {}
  getItem(k: string) {
    return k in this.store ? this.store[k] : null
  }
  setItem(k: string, v: string) {
    this.store[k] = String(v)
  }
  removeItem(k: string) {
    delete this.store[k]
  }
  clear() {
    this.store = {}
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new LocalStorageMock())
})
afterEach(() => vi.unstubAllGlobals())

describe('detectLang', () => {
  it('优先读 localStorage 已存值', () => {
    ;(localStorage as any).setItem('tavern-lang', 'ja')
    expect(detectLang()).toBe('ja')
  })
  it('无存储时按 navigator.language 推断', () => {
    vi.stubGlobal('navigator', { language: 'ko-KR' })
    expect(detectLang()).toBe('ko')
    vi.stubGlobal('navigator', { language: 'zh-CN' })
    expect(detectLang()).toBe('zh')
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect(detectLang()).toBe('en')
  })
  it('未知语言回退 en', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    expect(detectLang()).toBe('en')
  })
})

describe('saveLang', () => {
  it('写入 localStorage', () => {
    saveLang('en')
    expect((localStorage as any).getItem('tavern-lang')).toBe('en')
  })
})

describe('brandName / docTitle', () => {
  it('中文用「肥猫酒馆」，其余用 FATI Tavern', () => {
    expect(brandName('zh')).toBe('肥猫酒馆')
    expect(brandName('en')).toBe('FATI Tavern')
    expect(docTitle('zh')).toBe('肥猫酒馆 · FATI Tavern')
  })
})

describe('t', () => {
  it('命中 key 返回对应语言', () => {
    expect(t('zh', 'tab.chars')).toBe('角色')
    expect(t('en', 'tab.chars')).toBe('Chars')
    expect(t('ja', 'tab.chars')).toBe('キャラ')
    expect(t('ko', 'tab.chars')).toBe('캐릭터')
  })
  it('未命中返回 key 原样', () => {
    expect(t('zh', 'nonexistent.key')).toBe('nonexistent.key')
  })
  it('变量替换 {n}', () => {
    expect(t('zh', 'toast.imported', { n: 3 })).toBe('✓ 已导入 3 张角色卡')
    expect(t('en', 'toast.imported', { n: 3 })).toBe('✓ Imported 3 card(s)')
  })
  it('冷启动新键（cs.*/rate.*）四语齐备且非空', () => {
    const keys = [
      'cs.cardChatT', 'cs.cardChatD', 'cs.cardFreeT', 'cs.cardFreeD',
      'cs.cardPrivacyT', 'cs.cardPrivacyD', 'cs.exampleNote',
      'cs.exampleUser', 'cs.exampleAI', 'rate.title', 'rate.skip',
    ]
    for (const key of keys) {
      for (const lang of ['zh', 'en', 'ja', 'ko'] as const) {
        const text = t(lang, key)
        expect(text, `${key}.${lang}`).not.toBe(key)
        expect(text.length, `${key}.${lang}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('localizeError', () => {
  it('中文原样返回', () => {
    expect(localizeError('zh', '不是有效的 PNG 文件')).toBe('不是有效的 PNG 文件')
  })
  it('英文映射', () => {
    expect(localizeError('en', '不是有效的 PNG 文件')).toBe('Not a valid PNG file')
  })
  it('日文映射', () => {
    expect(localizeError('ja', 'PNG 中没有角色卡数据（缺少 ccv3 / chara 区块）')).toBe(
      'PNGにキャラクターカードデータがありません（ccv3 / charaチャンク欠落）',
    )
  })
  it('韩文映射', () => {
    expect(localizeError('ko', '无法识别的角色卡数据结构')).toBe('인식할 수 없는 캐릭터 카드 구조')
  })
  it('前缀匹配（gzip/deflate 解压失败）', () => {
    expect(localizeError('en', '角色卡数据解压失败（gzip）')).toBe('Failed to decompress card data')
  })
  it('未命中返回原消息', () => {
    expect(localizeError('en', 'something else')).toBe('something else')
  })
})
