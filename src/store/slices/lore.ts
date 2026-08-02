/**
 * 世界书（lorebook）管理 slice——独立 store，避免主 store 膨胀。
 * 模块边界：tavern.ts → db.ts → 本文件 → UI（与 p2p slice 同模式）。
 * 与主 store 的关系：本 slice 不反向引用 store.ts；角色绑定世界书
 * 由主 store 的 updateCharacterBoundLorebook 落库（避免循环依赖）。
 */
import { create } from 'zustand'
import type { TavernBook } from '../../lib/tavern'
import { dbGetLorebooks, dbPutLorebook, dbDeleteLorebook, genId, type StoredLorebook } from '../../lib/db'

const LS_ACTIVE_KEY = 'tavern-active-lorebook'

function loadActiveLorebookId(): string | null {
  try { return localStorage.getItem(LS_ACTIVE_KEY) || null } catch { return null }
}
function saveActiveLorebookId(id: string | null) {
  try {
    if (id) localStorage.setItem(LS_ACTIVE_KEY, id)
    else localStorage.removeItem(LS_ACTIVE_KEY)
  } catch { /* ignore */ }
}

interface LoreState {
  lorebooks: StoredLorebook[]
  activeLorebookId: string | null // 全局激活书（聊天注入优先级：角色绑定 > 全局激活）
  initLore: () => Promise<void>
  importLorebook: (book: TavernBook, source?: string) => Promise<StoredLorebook>
  removeLorebook: (id: string) => Promise<void>
  setActiveLorebook: (id: string | null) => void
}

export const useLoreStore = create<LoreState>((set, get) => ({
  lorebooks: [],
  activeLorebookId: loadActiveLorebookId(),

  initLore: async () => {
    const lorebooks = await dbGetLorebooks()
    // 激活 id 指向已删除的书时静默清理
    const active = get().activeLorebookId
    const cleaned = active && !lorebooks.some((l) => l.id === active) ? null : active
    if (cleaned !== active) saveActiveLorebookId(cleaned)
    set({ lorebooks, activeLorebookId: cleaned })
  },

  importLorebook: async (book, source) => {
    const stored: StoredLorebook = {
      id: genId(),
      book,
      source,
      imported: Date.now(),
    }
    await dbPutLorebook(stored)
    set((s) => ({ lorebooks: [stored, ...s.lorebooks] }))
    return stored
  },

  removeLorebook: async (id) => {
    await dbDeleteLorebook(id) // 内部级联删除衍生剧情
    set((s) => {
      const clearingActive = s.activeLorebookId === id
      if (clearingActive) saveActiveLorebookId(null)
      return {
        lorebooks: s.lorebooks.filter((l) => l.id !== id),
        activeLorebookId: clearingActive ? null : s.activeLorebookId,
      }
    })
  },

  setActiveLorebook: (id) => {
    saveActiveLorebookId(id)
    set({ activeLorebookId: id })
  },
}))
