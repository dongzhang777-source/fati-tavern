/**
 * 世界书面板——画廊内的世界书管理区。
 * 列表 / 全局激活 / 删除 / 绑定角色 / 一键进入剧情。
 */
import { useState } from 'react'
import { useStore } from '../store'
import { useLoreStore } from '../store/slices/lore'
import { useStoryStore } from '../store/slices/story'
import { t } from '../lib/i18n'
import { deriveBookRating, passesContentFilter } from '../lib/tavern'
import type { StoredCharacter } from '../lib/db'

export function LorebookPanel() {
  const { characters, lang, endpoint, bindLorebookToCharacter, enterStoryView, safeMode, ageGate } = useStore()
  const { lorebooks, activeLorebookId, loreError, removeLorebook, clearLoreError, setActiveLorebook } = useLoreStore()
  const { openStory, stories } = useStoryStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // TV-06：写/删库失败横幅——loreError 存 i18n key（slice 拿不到 lang），此处翻译渲染；
  // 关闭按钮调 clearLoreError。空列表分支也渲染（首本导入失败时列表可能为空）。
  // 复用 .story-error 错误条样式（App.css 不在本单可写清单，不新增 CSS 类）。
  const loreErrorBanner = loreError && (
    <div className="story-error" role="alert">
      <span>{t(lang, loreError)}</span>{' '}
      <button onClick={clearLoreError} title={t(lang, 'imp.close')}>×</button>
    </div>
  )

  if (lorebooks.length === 0) {
    return (
      <section className="lore-panel">
        <h3 className="lore-title">📖 {t(lang, 'lore.section')}</h3>
        {loreErrorBanner}
        <div className="lore-empty">{t(lang, 'lore.empty')}</div>
      </section>
    )
  }

  // 绑定下拉里只显示用户角色（内置角色绑定会自动转副本，但列表太杂）
  const userChars = characters.filter((c) => !c.builtin)
  const charBoundTo = (charId: string) => characters.find((c) => c.id === charId)?.boundLorebookId

  // safeMode：隐藏 adult 世界书（与角色卡过滤语义一致）；H-3：minor 下 unknown 也隐藏
  const visibleBooks = lorebooks.filter((lb) => passesContentFilter(deriveBookRating(lb.book), safeMode, ageGate === 'minor'))
  const hiddenCount = lorebooks.length - visibleBooks.length

  return (
    <section className="lore-panel">
      <h3 className="lore-title">📖 {t(lang, 'lore.section')}</h3>
      {loreErrorBanner}
      <p className="lore-hint">{t(lang, 'lore.hint')}</p>
      {hiddenCount > 0 && (
        <p className="safe-hidden-note">{t(lang, 'lore.safeHidden', { n: hiddenCount })}</p>
      )}
      <div className="lore-list">
        {visibleBooks.map((lb) => {
          const entries = lb.book.entries.filter((e) => e.enabled).length
          const isActive = activeLorebookId === lb.id
          const expanded = expandedId === lb.id
          const boundChars = characters.filter((c) => c.boundLorebookId === lb.id)
          const progress = stories.find((s) => s.lorebookId === lb.id)
          return (
            <div key={lb.id} className={`lore-item ${isActive ? 'active' : ''}`}>
              <div className="lore-item-main" onClick={() => setExpandedId(expanded ? null : lb.id)}>
                <div className="lore-item-info">
                  <strong className="lore-item-name">
                    {lb.book.name || lb.source || t(lang, 'lore.untitled')}
                    {lb.builtin && <span className="lore-badge-builtin">{t(lang, 'lore.builtin')}</span>}
                    {isActive && <span className="lore-badge-active">{t(lang, 'lore.active')}</span>}
                  </strong>
                  <span className="lore-item-meta">
                    {t(lang, 'lore.entries', { n: entries })}
                    {boundChars.length > 0 && <> · {t(lang, 'lore.bound', { n: boundChars.length })}</>}
                    {progress && progress.scenes.length > 0 && <> · {t(lang, 'lore.progress', { n: progress.scenes.length })}</>}
                  </span>
                </div>
                <div className="lore-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-story"
                    title={t(lang, 'lore.enterStory')}
                    onClick={() => {
                      openStory(lb, endpoint, lang).then(() => enterStoryView())
                    }}
                  >
                    🎬 {t(lang, 'lore.enterStory')}
                  </button>
                  <button
                    className={`btn-activate ${isActive ? 'on' : ''}`}
                    title={t(lang, 'lore.activateHint')}
                    onClick={() => setActiveLorebook(isActive ? null : lb.id)}
                  >
                    {isActive ? '★' : '☆'}
                  </button>
                  <button
                    className="btn-del lore-del"
                    title={t(lang, 'gallery.delete')}
                    onClick={() => {
                      if (confirm(t(lang, 'lore.deleteConfirm'))) {
                        // TV-06：删除失败不再靠异常冒泡（slice 已 catch 返回 false）。
                        // 失败可见反馈由 slice 置 loreError → 本面板横幅承担（成功则条目消失）；
                        // 布尔返回值契约的消费方是 App.tsx 批量导入计数与本单回归测试。
                        void removeLorebook(lb.id)
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="lore-item-detail">
                  {lb.book.description && <p className="lore-desc">{lb.book.description}</p>}
                  {userChars.length > 0 && (
                    <div className="lore-bind">
                      <label>{t(lang, 'lore.bindChar')}</label>
                      <select
                        value=""
                        onChange={(e) => {
                          const charId = e.target.value
                          if (charId) void bindLorebookToCharacter(charId, lb.id)
                        }}
                      >
                        <option value="" disabled>{t(lang, 'lore.bindPick')}</option>
                        {userChars.filter((c) => charBoundTo(c.id) !== lb.id).map((c: StoredCharacter) => (
                          <option key={c.id} value={c.id}>{c.card.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {boundChars.length > 0 && (
                    <div className="lore-bound-list">
                      {boundChars.map((c) => (
                        <span key={c.id} className="lore-bound-chip">
                          {c.card.name}
                          <button onClick={() => void bindLorebookToCharacter(c.id, null)}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
