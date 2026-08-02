/**
 * 剧情视图——沉浸式场景续写。
 * 世界书一键浓缩成剧情世界后在此播放：场景正文流式展示 + 选项按钮 + 自由输入。
 * WebLLM 降级档（plainMode）无选项，只有续写 + 自由输入。
 */
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useStoryStore } from '../store/slices/story'
import { WEBLLM_BASE } from '../lib/webllm'
import { t } from '../lib/i18n'

export function StoryView() {
  const { lang, backToGallery, endpoint } = useStore()
  const { activeStory, sceneStreaming, sceneBuffer, storyError, plainMode, storyProgress, advanceStory, stopStory, restartStory, closeStory } = useStoryStore()
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const scenes = activeStory?.scenes ?? []
  const lastScene = scenes[scenes.length - 1]
  const lastText = sceneStreaming && plainMode && sceneBuffer ? sceneBuffer : lastScene?.text
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [scenes.length, lastText])

  // 剧情视图但无 activeStory（restart 后 / 误入）→ 引导回画廊
  if (!activeStory) {
    return (
      <div className="story-empty">
        <p>{t(lang, 'story.noActive')}</p>
        <button className="btn-story-back" onClick={backToGallery}>{t(lang, 'story.backGallery')}</button>
      </div>
    )
  }

  function handleSend() {
    const text = input.trim()
    if (!text || sceneStreaming) return
    setInput('')
    void advanceStory(text)
  }

  // 开幕：无场景时点「开始」→ 生成第一幕（可附带用户给的引子）
  function handleBegin() {
    if (sceneStreaming) return
    const text = input.trim()
    setInput('')
    void advanceStory(text || undefined)
  }

  return (
    <div className="story-view">
      <header className="story-header">
        <button className="btn-back" onClick={() => { closeStory(); backToGallery() }}>{t(lang, 'story.back')}</button>
        <div className="story-title">
          <strong>{activeStory.title}</strong>
          <span className="story-meta">{t(lang, 'story.sceneCount', { n: scenes.length })}</span>
        </div>
        <button className="btn-icon" title={t(lang, 'story.restart')} onClick={() => {
          if (confirm(t(lang, 'story.restartConfirm'))) void restartStory()
        }}>↺</button>
      </header>

      <main className="story-scroll">
        {scenes.length === 0 && !sceneStreaming && (
          <div className="story-premise">
            <p className="story-premise-label">{t(lang, 'story.premise')}</p>
            <p>{activeStory.premise.slice(0, 400)}{activeStory.premise.length > 400 ? '…' : ''}</p>
          </div>
        )}

        {scenes.map((s, i) => (
          <article key={s.id} className="story-scene">
            <span className="story-scene-no">{t(lang, 'story.sceneNo', { n: i + 1 })}</span>
            <div className="story-scene-text">{s.text}</div>
            {i === scenes.length - 1 && s.choices.length > 0 && !sceneStreaming && (
              <div className="story-choices">
                {s.choices.map((c, ci) => (
                  <button key={ci} className="story-choice" onClick={() => void advanceStory(c)}>{c}</button>
                ))}
              </div>
            )}
          </article>
        ))}

        {sceneStreaming && (
          <article className="story-scene streaming">
            <span className="story-scene-no">{t(lang, 'story.sceneNo', { n: scenes.length + 1 })}</span>
            {plainMode ? (
              <div className="story-scene-text">{sceneBuffer}<span className="story-cursor">▍</span></div>
            ) : (
              <div className="story-thinking">{storyProgress ? `${t(lang, 'webllm.loading')}${storyProgress}` : t(lang, 'story.directing')}</div>
            )}
          </article>
        )}

        {storyError && <p className="story-error">{storyError}</p>}

        {/* 场景已出完且无选项时：自由输入推进（含 plainMode） */}
        {!sceneStreaming && (scenes.length === 0 || !lastScene || lastScene.choices.length === 0) && (
          <div className="story-input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (scenes.length === 0 ? handleBegin() : handleSend()) }}
              placeholder={scenes.length === 0 ? t(lang, 'story.beginPlaceholder') : t(lang, 'story.inputPlaceholder')}
            />
            <button
              className="btn-story-send"
              onClick={scenes.length === 0 ? handleBegin : handleSend}
              disabled={scenes.length > 0 && !input.trim()}
            >
              {scenes.length === 0 ? t(lang, 'story.begin') : t(lang, 'chat.send')}
            </button>
          </div>
        )}

        {sceneStreaming && <button className="btn-story-stop" onClick={stopStory}>{t(lang, 'chat.stop')}</button>}
        <div ref={endRef} />
      </main>

      <footer className="story-footer">
        <span>{t(lang, 'chat.aiDisclosure')}</span>
        {plainMode && endpoint.baseUrl === WEBLLM_BASE && <span className="story-plain-hint">{t(lang, 'story.plainHint')}</span>}
      </footer>
    </div>
  )
}
