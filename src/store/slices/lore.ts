/**
 * 世界书（lorebook）管理 slice——独立 store，避免主 store 膨胀。
 * 模块边界：tavern.ts → db.ts → 本文件 → UI（与 p2p slice 同模式）。
 * 与主 store 的关系：本 slice 不反向引用 store.ts；角色绑定世界书
 * 由主 store 的 updateCharacterBoundLorebook 落库（避免循环依赖）。
 */
import { create } from 'zustand'
import type { TavernBook } from '../../lib/tavern'
import { dbGetLorebooks, dbPutLorebook, dbDeleteLorebook, genId, type StoredLorebook } from '../../lib/db'
import { BUILTIN_LOREBOOKS } from '../../lib/builtin-lorebooks'

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
  // TV-06：写/删库失败的可见通道。本 slice 拿不到 lang 且不得反向引用主 store（见文件头），
  // 故存 i18n key 字符串（如 'lore.saveFailed'），由 LorebookPanel 用 t(lang, key) 翻译渲染。
  loreError: string | null
  initLore: () => Promise<void>
  // TV-06：写库失败不再抛，改返回 null——调用方（App.tsx 批量导入）按返回值计数，
  // 否则失败书被计入成功数（toast 虚高），与 TV-05 修掉的 importCard 同型。
  importLorebook: (book: TavernBook, source?: string) => Promise<StoredLorebook | null>
  // TV-06：删除失败返回 false（成功 true），与 TV-05 的 importCard 布尔契约一致
  removeLorebook: (id: string) => Promise<boolean>
  clearLoreError: () => void
  setActiveLorebook: (id: string | null) => void
}

export const useLoreStore = create<LoreState>((set, get) => ({
  lorebooks: [],
  activeLorebookId: loadActiveLorebookId(),
  loreError: null,

  initLore: async () => {
    // TV-05（2026-09-11 读路径同族收尾，总管自修）：dbGetLorebooks 会抛（openDB/tx reject），
    // store.ts 以 void 调用本函数 → 裸 await 即 unhandled rejection。
    // 读失败降级为仅内置样本世界书继续；LoreState 无 error 通道且本 slice
    // 不反向引用主 store（见文件头），横幅接线需独立设计，此处先 console 可诊断。
    let userBooks: StoredLorebook[] = []
    try {
      userBooks = await dbGetLorebooks()
    } catch (e) {
      console.error('[db] 世界书读取失败（initLore）', e)
    }
    // 内置样本世界书（不写 IndexedDB，标记 builtin: true；与内置角色同模式）
    const builtinBooks: StoredLorebook[] = BUILTIN_LOREBOOKS.map((b) => ({
      id: b.id,
      book: b.book,
      imported: 0, // 时间戳为 0，排在用户导入的书后面
      builtin: true,
    }))
    const lorebooks = [...userBooks, ...builtinBooks]
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
    // TV-06：写库失败不再裸抛（IndexedDB 配额耗尽/隐私模式/事务冲突）。
    // 失败时置 loreError（i18n key，由面板翻译渲染）并返回 null，且不把书塞进
    // 内存列表——内存与库保持一致；调用方按返回值计数（App.tsx handleFiles）。
    try {
      await dbPutLorebook(stored)
    } catch (e) {
      console.error('[db] 世界书写入失败（importLorebook）', e)
      set({ loreError: 'lore.saveFailed' })
      return null
    }
    set((s) => ({ lorebooks: [stored, ...s.lorebooks] }))
    return stored
  },

  removeLorebook: async (id) => {
    // TV-06：删库失败（dbDeleteLorebook 内部级联删除衍生剧情）时不把书从内存移除、
    // 不清激活态——内存与库一致；置 loreError 并返回 false 供调用方反馈。
    try {
      await dbDeleteLorebook(id)
    } catch (e) {
      console.error('[db] 世界书删除失败（removeLorebook）', e)
      set({ loreError: 'lore.deleteFailed' })
      return false
    }
    set((s) => {
      const clearingActive = s.activeLorebookId === id
      if (clearingActive) saveActiveLorebookId(null)
      return {
        lorebooks: s.lorebooks.filter((l) => l.id !== id),
        activeLorebookId: clearingActive ? null : s.activeLorebookId,
      }
    })
    return true
  },

  clearLoreError: () => set({ loreError: null }),

  setActiveLorebook: (id) => {
    saveActiveLorebookId(id)
    set({ activeLorebookId: id })
  },
}))
