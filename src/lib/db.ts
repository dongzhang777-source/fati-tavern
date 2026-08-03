/**
 * IndexedDB 持久化层——角色卡 + 会话 + 世界书 + 剧情。
 * 纯浏览器 API，无第三方依赖。
 */
import type { TavernCard, TavernBook } from './tavern'
import type { ChatMessage } from '../store'

const DB_NAME = 'fati-tavern'
const DB_VERSION = 2

export interface StoredCharacter {
  id: string
  card: TavernCard
  avatarUrl?: string // data URL（从 PNG 提取）
  createdAt: number
  builtin?: true     // 内置角色标记，不写 IndexedDB
  boundLorebookId?: string // 该角色绑定的世界书（注入优先级最高）
}

export interface StoredConversation {
  id: string
  characterId: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

// ── 世界书（v2 新增）──
export interface StoredLorebook {
  id: string
  book: TavernBook
  source?: string // 来源文件名，便于用户辨认
  imported: number
  builtin?: boolean // 内置样本：不落库，删除仅当次会话生效
}

// ── 剧情模式（v2 新增）──
export interface StoryScene {
  id: string
  text: string
  choices: string[]
  createdAt: number
}

export interface StoredStory {
  id: string
  lorebookId: string
  title: string
  premise: string
  scenes: StoryScene[]
  createdAt: number
  updatedAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('characters')) {
        db.createObjectStore('characters', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('conversations')) {
        const store = db.createObjectStore('conversations', { keyPath: 'id' })
        store.createIndex('characterId', 'characterId', { unique: false })
      }
      // v2 新增：世界书 + 剧情（幂等——只建不存在的 store，旧数据无损）
      if (!db.objectStoreNames.contains('lorebooks')) {
        db.createObjectStore('lorebooks', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('stories')) {
        const store = db.createObjectStore('stories', { keyPath: 'id' })
        store.createIndex('lorebookId', 'lorebookId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ─── Characters ───

export async function dbGetCharacters(): Promise<StoredCharacter[]> {
  const db = await openDB()
  const all = await tx(db, 'characters', 'readonly', (s) => s.getAll())
  db.close()
  return (all as StoredCharacter[]).sort((a, b) => b.createdAt - a.createdAt)
}

export async function dbPutCharacter(char: StoredCharacter): Promise<void> {
  const db = await openDB()
  await tx(db, 'characters', 'readwrite', (s) => s.put(char))
  db.close()
}

export async function dbDeleteCharacter(id: string): Promise<void> {
  const db = await openDB()
  await tx(db, 'characters', 'readwrite', (s) => s.delete(id))
  // 同时删除该角色的所有会话
  const convs = await tx(db, 'conversations', 'readonly', (s) => s.index('characterId').getAll(id))
  for (const c of convs as StoredConversation[]) {
    await tx(db, 'conversations', 'readwrite', (s) => s.delete(c.id))
  }
  db.close()
}

// ─── Conversations ───

export async function dbGetConversations(characterId: string): Promise<StoredConversation[]> {
  const db = await openDB()
  const all = await tx(db, 'conversations', 'readonly', (s) => s.index('characterId').getAll(characterId))
  db.close()
  return (all as StoredConversation[]).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function dbPutConversation(conv: StoredConversation): Promise<void> {
  const db = await openDB()
  await tx(db, 'conversations', 'readwrite', (s) => s.put(conv))
  db.close()
}

export async function dbDeleteConversation(id: string): Promise<void> {
  const db = await openDB()
  await tx(db, 'conversations', 'readwrite', (s) => s.delete(id))
  db.close()
}

// ─── Lorebooks（v2）──

export async function dbGetLorebooks(): Promise<StoredLorebook[]> {
  const db = await openDB()
  const all = await tx(db, 'lorebooks', 'readonly', (s) => s.getAll())
  db.close()
  return (all as StoredLorebook[]).sort((a, b) => b.imported - a.imported)
}

export async function dbPutLorebook(lb: StoredLorebook): Promise<void> {
  const db = await openDB()
  await tx(db, 'lorebooks', 'readwrite', (s) => s.put(lb))
  db.close()
}

export async function dbDeleteLorebook(id: string): Promise<void> {
  const db = await openDB()
  await tx(db, 'lorebooks', 'readwrite', (s) => s.delete(id))
  // 级联删除该书衍生的剧情会话（lorebookId 索引）
  const stories = await tx(db, 'stories', 'readonly', (s) => s.index('lorebookId').getAll(id))
  for (const st of stories as StoredStory[]) {
    await tx(db, 'stories', 'readwrite', (s) => s.delete(st.id))
  }
  db.close()
}

// ─── Stories（v2）──

export async function dbGetStories(lorebookId?: string): Promise<StoredStory[]> {
  const db = await openDB()
  const all = lorebookId
    ? await tx(db, 'stories', 'readonly', (s) => s.index('lorebookId').getAll(lorebookId))
    : await tx(db, 'stories', 'readonly', (s) => s.getAll())
  db.close()
  return (all as StoredStory[]).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function dbPutStory(story: StoredStory): Promise<void> {
  const db = await openDB()
  await tx(db, 'stories', 'readwrite', (s) => s.put(story))
  db.close()
}

export async function dbDeleteStory(id: string): Promise<void> {
  const db = await openDB()
  await tx(db, 'stories', 'readwrite', (s) => s.delete(id))
  db.close()
}

// ─── 工具 ───

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 从 PNG 文件提取头像 data URL（缩小到 128x128） */
export async function extractAvatar(file: File): Promise<string | undefined> {
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    // 居中裁切
    const min = Math.min(img.width, img.height)
    const sx = (img.width - min) / 2
    const sy = (img.height - min) / 2
    ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
    URL.revokeObjectURL(url)
    return canvas.toDataURL('image/webp', 0.8)
  } catch {
    return undefined
  }
}
