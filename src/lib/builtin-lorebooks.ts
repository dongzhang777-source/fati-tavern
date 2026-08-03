/**
 * 内置样本世界书——复用 samples/lorebooks/*.json（单一真相源），
 * 构建期经 Vite import.meta.glob 打包。新用户零导入即有可玩实例，
 * 与 lib/catalog.ts 内置角色卡的设计对称：不写 IndexedDB，标 builtin。
 */
import { parseLorebookJson, type TavernBook } from './tavern'

export interface BuiltinLorebook {
  id: string // 稳定 id：builtin-lore-<文件名>，重启不变
  name: string
  description: string
  book: TavernBook
}

const modules = import.meta.glob('../../samples/lorebooks/*.json', {
  eager: true,
  import: 'default',
})

export const BUILTIN_LOREBOOKS: BuiltinLorebook[] = Object.entries(modules)
  .flatMap(([path, raw]) => {
    const file = path.split('/').pop()!.replace(/\.json$/, '')
    const book = parseLorebookJson(raw)
    if (!book) return []
    return [{
      id: `builtin-lore-${file}`,
      name: book.name || file,
      description: book.description || '',
      book,
    }]
  })
  .sort((a, b) => a.id.localeCompare(b.id))
