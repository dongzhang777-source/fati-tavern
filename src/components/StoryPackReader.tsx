import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { t } from '../lib/i18n'
import { loadPackIndex, loadPack, resolveLocalizedText, type PackIndexItem } from '../lib/storypack-loader'
import { shareEnding } from '../lib/storypack-share'
import { lookupNode } from '../storypack/vendor'
import type { StoryPackV2, Manifest } from '../storypack/vendor'

interface StoryPackCardData {
  item: PackIndexItem
  manifest?: Manifest
  error?: boolean
}

export function StoryPackReader() {
  const lang = useStore((s) => s.lang)
  const [cards, setCards] = useState<StoryPackCardData[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [activePack, setActivePack] = useState<StoryPackV2 | null>(null)
  const [packLoading, setPackLoading] = useState(false)
  const [packError, setPackError] = useState<string | null>(null)
  const [visitedPath, setVisitedPath] = useState<string[]>([])
  const [copiedToast, setCopiedToast] = useState(false)
  const [manualCopyText, setManualCopyText] = useState<string | null>(null)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollEndRef = useRef<HTMLDivElement>(null)

  // 加载故事包列表索引与 Manifest
  useEffect(() => {
    let mounted = true
    async function initList() {
      setListLoading(true)
      setListError(null)
      try {
        const index = await loadPackIndex()
        if (!mounted) return
        const cardList: StoryPackCardData[] = await Promise.all(
          index.packs.map(async (item) => {
            const res = await loadPack(item.dir)
            if (res.ok) {
              return { item, manifest: res.pack.manifest }
            }
            return { item, error: true }
          }),
        )
        if (mounted) {
          setCards(cardList)
          setListLoading(false)
        }
      } catch (err: any) {
        if (mounted) {
          setListError(err?.message || t(lang, 'sp.loadFail'))
          setListLoading(false)
        }
      }
    }
    void initList()
    return () => {
      mounted = false
    }
  }, [lang])

  // 滚动到最新场景
  useEffect(() => {
    if (activePack) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [visitedPath.length, activePack])

  async function handleOpenPack(dir: string) {
    setPackLoading(true)
    setPackError(null)
    const result = await loadPack(dir)
    if (result.ok) {
      setActivePack(result.pack)
      setVisitedPath([result.pack.graph.rootId])
    } else {
      setPackError(t(lang, 'sp.loadFail'))
    }
    setPackLoading(false)
  }

  function handleChoice(targetId: string) {
    if (!activePack) return
    const nextNode = lookupNode(activePack, targetId)
    if (nextNode) {
      setVisitedPath((prev) => [...prev, targetId])
    }
  }

  function handleRestart() {
    if (activePack) {
      setVisitedPath([activePack.graph.rootId])
    }
  }

  function handleBackToList() {
    setActivePack(null)
    setVisitedPath([])
    setPackError(null)
  }

  function triggerCopiedToast() {
    setCopiedToast(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setCopiedToast(false), 2500)
  }

  async function handleShareEnding() {
    if (!activePack) return
    await shareEnding(
      activePack,
      visitedPath,
      lang,
      () => triggerCopiedToast(),
      (text) => setManualCopyText(text),
    )
  }

  // 1. 阅读器界面（已选择故事包）
  if (activePack) {
    const currentNodeId = visitedPath[visitedPath.length - 1]
    const currentNode = lookupNode(activePack, currentNodeId)
    const isEnding = currentNode?.kind === 'ending'

    return (
      <div className="storypack-reader">
        <header className="storypack-header">
          <button className="btn-back" onClick={handleBackToList}>
            {t(lang, 'story.back')}
          </button>
          <div className="storypack-title-box">
            <strong>{resolveLocalizedText(activePack.manifest.title, lang)}</strong>
            <span className="storypack-meta">
              {resolveLocalizedText(activePack.manifest.summary, lang)}
            </span>
          </div>
          <button
            className="btn-icon"
            title={t(lang, 'sp.restart')}
            onClick={handleRestart}
          >
            ↺
          </button>
        </header>

        <main className="storypack-scroll">
          {visitedPath.map((nodeId, idx) => {
            const node = lookupNode(activePack, nodeId)
            if (!node) return null
            const isLast = idx === visitedPath.length - 1

            if (node.kind === 'ending') {
              return (
                <article key={`${node.id}-${idx}`} className="storypack-ending-card">
                  <span className="storypack-badge-ending">{t(lang, 'sp.endingTitle')}</span>
                  <div className="storypack-scene-text">
                    {resolveLocalizedText(node.text, lang)}
                  </div>
                  {isLast && (
                    <div className="storypack-ending-actions">
                      <button className="btn-sp-share" onClick={handleShareEnding}>
                        📤 {t(lang, 'sp.share')}
                      </button>
                      <button className="btn-sp-restart" onClick={handleRestart}>
                        ↺ {t(lang, 'sp.restart')}
                      </button>
                      <button className="btn-sp-back" onClick={handleBackToList}>
                        {t(lang, 'sp.backToList')}
                      </button>
                    </div>
                  )}
                </article>
              )
            }

            return (
              <article key={`${node.id}-${idx}`} className="storypack-scene">
                <span className="storypack-scene-no">
                  {t(lang, 'story.sceneNo', { n: idx + 1 })}
                </span>
                <div className="storypack-scene-text">
                  {'text' in node ? resolveLocalizedText(node.text, lang) : ''}
                </div>

                {isLast && !isEnding && node.choices && node.choices.length > 0 && (
                  <div className="storypack-choices">
                    {node.choices.map((choice) => (
                      <button
                        key={choice.id}
                        className="storypack-choice"
                        onClick={() => handleChoice(choice.target)}
                      >
                        {resolveLocalizedText(choice.label, lang)}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
          <div ref={scrollEndRef} />
        </main>

        {copiedToast && (
          <div className="sp-toast">
            ✓ {t(lang, 'sp.copied')}
          </div>
        )}

        {manualCopyText && (
          <div className="editor-overlay" onClick={() => setManualCopyText(null)}>
            <div className="editor-modal" onClick={(e) => e.stopPropagation()}>
              <div className="editor-header">
                <h3>{t(lang, 'sp.copyText')}</h3>
              </div>
              <div className="editor-body">
                <textarea
                  className="sp-copy-textarea"
                  readOnly
                  value={manualCopyText}
                  rows={6}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <div className="editor-footer">
                <button
                  className="btn-editor-cancel"
                  onClick={() => setManualCopyText(null)}
                >
                  {t(lang, 'editor.cancel')}
                </button>
                <button
                  className="btn-editor-save"
                  onClick={() => {
                    navigator.clipboard?.writeText(manualCopyText).catch(() => {})
                    triggerCopiedToast()
                    setManualCopyText(null)
                  }}
                >
                  {t(lang, 'sp.copyText')}
                </button>
              </div>
            </div>
          </div>
        )}

        <footer className="storypack-footer">
          <span>{t(lang, 'sp.subtitle')}</span>
        </footer>
      </div>
    )
  }

  // 2. 故事列表页
  return (
    <div className="storypack-panel">
      <div className="storypack-hero">
        <h2>{t(lang, 'sp.tab')}</h2>
        <p className="storypack-sub">{t(lang, 'sp.subtitle')}</p>
      </div>

      {listLoading && <div className="storypack-loading">Loading stories…</div>}
      {listError && <div className="story-error">{listError}</div>}
      {packError && <div className="story-error">{packError}</div>}

      <div className="card-grid">
        {cards.map(({ item, manifest }) => {
          if (!manifest) return null
          return (
            <div
              key={item.packId}
              className="char-card storypack-card"
              onClick={() => void handleOpenPack(item.dir)}
            >
              <div className="card-avatar storypack-avatar">
                <span>📖</span>
              </div>
              <div className="card-info">
                <strong className="card-name">
                  {resolveLocalizedText(manifest.title, lang)}
                  <span className="badge-free">{t(lang, 'catalog.free')}</span>
                </strong>
                <span className="card-desc">
                  {resolveLocalizedText(manifest.summary, lang)}
                </span>
                <div className="storypack-card-meta">
                  <span className="storypack-stat">
                    {t(lang, 'sp.nodes', { n: manifest.stats.nodes })}
                  </span>
                  <span className="storypack-stat">
                    {t(lang, 'sp.endings', { n: manifest.stats.endings })}
                  </span>
                </div>
                {manifest.tags && manifest.tags.length > 0 && (
                  <span className="card-tags">{manifest.tags.join(' · ')}</span>
                )}
              </div>
              <button
                className="btn-import btn-sp-play"
                disabled={packLoading}
                onClick={(e) => {
                  e.stopPropagation()
                  void handleOpenPack(item.dir)
                }}
              >
                {t(lang, 'sp.play')}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
