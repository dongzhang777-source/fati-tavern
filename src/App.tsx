import { useRef, useState, useEffect } from 'react'
import { useStore } from './store'
import { parseCharacterJson, parsePngCard } from './lib/tavern'
import { PRESETS, fetchModels, testChat } from './lib/api'
import { t, brandName, docTitle, localizeError, type Lang } from './lib/i18n'
import './App.css'

export default function App() {
  const store = useStore()
  const { view, lang } = store

  useEffect(() => { store.init() }, [])
  // 中文=肥猫酒馆，其他语言=FATI Tavern
  useEffect(() => { document.title = docTitle(lang) }, [lang])

  return (
    <div className="app">
      {view === 'gallery' ? <Gallery /> : <ChatView />}
    </div>
  )
}

// ─── 角色库画廊 ───────────────────────────────────────────
interface ImportResult {
  ok: number
  fails: { name: string; reason: string }[]
}

function Gallery() {
  const { characters, importCard, removeCharacter, openCharacter, lang } = useStore()
  const [dragOver, setDragOver] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 每个文件独立解析，成功/失败都必须给用户可见反馈
  async function handleFiles(files: FileList | File[]) {
    let ok = 0
    const fails: { name: string; reason: string }[] = []
    for (const file of Array.from(files)) {
      try {
        if (file.name.toLowerCase().endsWith('.png')) {
          const buf = await file.arrayBuffer()
          const card = await parsePngCard(buf)
          await importCard(card, file)
          ok++
        } else if (file.name.toLowerCase().endsWith('.json')) {
          const text = await file.text()
          let json: any
          try {
            json = JSON.parse(text)
          } catch {
            throw new Error(t(lang, 'import.jsonFail'))
          }
          const card = parseCharacterJson(json)
          if (!card) throw new Error(t(lang, 'import.unknownFormat'))
          await importCard(card, file)
          ok++
        } else {
          throw new Error(t(lang, 'import.unsupported'))
        }
      } catch (e: any) {
        fails.push({ name: file.name, reason: localizeError(lang, e?.message || t(lang, 'import.fail')) })
      }
    }
    setImportResult({ ok, fails })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    // 有失败时多停留一会儿让用户看清原因
    toastTimer.current = setTimeout(() => setImportResult(null), fails.length > 0 ? 8000 : 3000)
  }

  return (
    <div
      className="gallery"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
    >
      {dragOver && <div className="drop-overlay">{t(lang, 'gallery.dropOverlay')}</div>}

      <header className="gallery-header">
        <h1><img className="brand-logo" src="/logo.svg" alt="" />{brandName(lang)}</h1>
        <div className="gallery-actions">
          <button className="btn-import" onClick={() => fileRef.current?.click()}>{t(lang, 'gallery.import')}</button>
          <button className="btn-icon" onClick={() => setShowSettings(!showSettings)}>⚙</button>
        </div>
      </header>

      <input
        ref={fileRef} type="file" accept=".png,.json" multiple hidden
        onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
      />

      {showSettings && <SettingsPanel />}

      {characters.length === 0 ? (
        <div className="landing">
          <div className="landing-hero">
            <h2>{t(lang, 'landing.title')}</h2>
            <p className="landing-sub">{t(lang, 'landing.sub')}</p>
          </div>

          <div className="landing-demo">
            <div className="demo-step">
              <span className="demo-num">1</span>
              <div className="demo-card">
                <span className="demo-icon">🃏</span>
                <span>{t(lang, 'landing.step1')}</span>
              </div>
            </div>
            <span className="demo-arrow">→</span>
            <div className="demo-step">
              <span className="demo-num">2</span>
              <div className="demo-card">
                <span className="demo-icon">⚙️</span>
                <span>{t(lang, 'landing.step2')}</span>
              </div>
            </div>
            <span className="demo-arrow">→</span>
            <div className="demo-step">
              <span className="demo-num">3</span>
              <div className="demo-card">
                <span className="demo-icon">💬</span>
                <span>{t(lang, 'landing.step3')}</span>
              </div>
            </div>
          </div>

          <div className="landing-cta">
            <button className="btn-import big" onClick={() => fileRef.current?.click()}>{t(lang, 'landing.cta')}</button>
            <span className="landing-hint">{t(lang, 'landing.ctaHint')}</span>
          </div>

          <div className="landing-privacy">
            <h3>{t(lang, 'landing.privacyTitle')}</h3>
            <p>{t(lang, 'landing.privacyBody')}</p>
          </div>

          <div className="landing-features">
            <div className="feature"><span>🚀</span><p dangerouslySetInnerHTML={{ __html: t(lang, 'landing.feat1') }} /></div>
            <div className="feature"><span>🔑</span><p dangerouslySetInnerHTML={{ __html: t(lang, 'landing.feat2') }} /></div>
            <div className="feature"><span>📱</span><p dangerouslySetInnerHTML={{ __html: t(lang, 'landing.feat3') }} /></div>
            <div className="feature"><span>💾</span><p dangerouslySetInnerHTML={{ __html: t(lang, 'landing.feat4') }} /></div>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {characters.map((c) => (
            <div key={c.id} className="char-card" onClick={() => openCharacter(c.id)}>
              <div className="card-avatar">
                {c.avatarUrl
                  ? <img src={c.avatarUrl} alt={c.card.name} />
                  : <span className="avatar-placeholder">{c.card.name[0]}</span>
                }
              </div>
              <div className="card-info">
                <strong className="card-name">{c.card.name}</strong>
                <span className="card-desc">{c.card.description?.slice(0, 60) || c.card.personality?.slice(0, 60) || t(lang, 'gallery.noDesc')}</span>
                {c.card.tags?.length > 0 && (
                  <span className="card-tags">{c.card.tags.slice(0, 3).join(' · ')}</span>
                )}
              </div>
              <button className="btn-del" onClick={(e) => { e.stopPropagation(); removeCharacter(c.id) }} title={t(lang, 'gallery.delete')}>×</button>
            </div>
          ))}
        </div>
      )}

      <footer className="gallery-footer">
        <span>{t(lang, 'gallery.footer')}</span>
      </footer>

      {importResult && (
        <div className={`import-toast ${importResult.fails.length > 0 ? 'has-fail' : ''}`} onClick={() => setImportResult(null)}>
          {importResult.ok > 0 && <p>{t(lang, 'toast.imported', { n: importResult.ok })}</p>}
          {importResult.fails.map((f) => (
            <p key={f.name} className="fail-line">✗ {f.name}：{f.reason}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 聊天视图 ───────────────────────────────────────────
function ChatView() {
  const {
    characters, activeCharId, conversations, activeConvId,
    streaming, error, sendMessage, stopStreaming, clearChat,
    newConversation, selectConversation, deleteConversation, backToGallery,
    lang, safetyNotice, dismissSafetyNotice, webllmProgress,
  } = useStore()

  const [input, setInput] = useState('')
  const [showConvList, setShowConvList] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const char = characters.find((c) => c.id === activeCharId)
  const conv = conversations.find((c) => c.id === activeConvId)
  const messages = conv?.messages ?? []

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.content])

  function handleSend() {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    sendMessage(text)
  }

  if (!char) return null

  return (
    <div className="chat-layout">
      {/* 会话侧边栏 */}
      {showConvList && (
        <aside className="conv-sidebar">
          <div className="conv-header">
            <h3>{t(lang, 'chat.convHeader')}</h3>
            <button onClick={() => newConversation()}>{t(lang, 'chat.newConv')}</button>
          </div>
          <ul className="conv-list">
            {conversations.map((c) => (
              <ConvItem key={c.id} conv={c} active={c.id === activeConvId}
                onSelect={() => selectConversation(c.id)}
                onDelete={() => deleteConversation(c.id)}
              />
            ))}
          </ul>
        </aside>
      )}

      {/* 主聊天区 */}
      <main className="chat-main">
        <header className="chat-header">
          <button className="btn-back" onClick={backToGallery}>{t(lang, 'chat.back')}</button>
          <div className="chat-title">
            {char.avatarUrl && <img className="header-avatar" src={char.avatarUrl} alt="" />}
            <div className="chat-title-text">
              <strong>{char.card.name}</strong>
              {/* AI 身份披露——州级陪聊法规底线要求，常驻不可关闭 */}
              <span className="ai-disclosure">{t(lang, 'chat.aiDisclosure')}</span>
            </div>
          </div>
          <div className="chat-actions">
            <button onClick={() => setShowConvList(!showConvList)} title={t(lang, 'chat.convList')}>☰</button>
            <button onClick={clearChat} title={t(lang, 'chat.clear')}>🗑</button>
          </div>
        </header>

        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="msg-content">{m.content || (streaming && i === messages.length - 1 ? '…' : '')}</div>
              {m.ts && <span className="msg-time">{new Date(m.ts).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* 自伤关键词命中后的危机资源提示（非阻断、可关闭） */}
        {safetyNotice && (
          <div className="crisis-bar">
            <span>💛 {t(lang, 'chat.crisis')}</span>
            <button onClick={dismissSafetyNotice}>{t(lang, 'chat.crisisDismiss')}</button>
          </div>
        )}

        {/* WebLLM 模型下载/编译进度 */}
        {webllmProgress !== null && (
          <div className="webllm-progress">⏳ {t(lang, 'webllm.loading')}{webllmProgress}</div>
        )}

        {error && <div className="error-bar">⚠ {error}</div>}

        <footer className="input-bar">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={t(lang, 'chat.placeholder', { name: char.card.name })}
            disabled={streaming}
            autoFocus
          />
          {streaming
            ? <button className="btn-stop" onClick={stopStreaming}>{t(lang, 'chat.stop')}</button>
            : <button className="btn-send" onClick={handleSend} disabled={!input.trim()}>{t(lang, 'chat.send')}</button>
          }
        </footer>
      </main>
    </div>
  )
}

// ─── 会话列表项（双击编辑标题）───────────────────────
function ConvItem({ conv, active, onSelect, onDelete }: {
  conv: { id: string; title: string }
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { renameConversation } = useStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conv.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    const t = draft.trim()
    if (t && t !== conv.title) renameConversation(conv.id, t)
    setEditing(false)
  }

  return (
    <li className={active ? 'active' : ''} onClick={onSelect} onDoubleClick={() => { setDraft(conv.title); setEditing(true) }}>
      {editing ? (
        <input
          ref={inputRef}
          className="conv-rename"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span>{conv.title}</span>
      )}
      <button className="btn-del" onClick={(e) => { e.stopPropagation(); onDelete() }}>×</button>
    </li>
  )
}

// ─── 设置面板 ───────────────────────────────────────────
function SettingsPanel() {
  const { endpoint, setEndpoint, lang, setLang } = useStore()
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [chatStatus, setChatStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [chatMsg, setChatMsg] = useState('')

  // 本地端点需要用户自行开启 CORS，否则从 HTTPS 页面必然连不上
  const isLocalEndpoint = /localhost|127\.0\.0\.1/.test(endpoint.baseUrl)
  // WebLLM 免 Key 档：浏览器本地推理，无 HTTP 端点可测
  const isWebllm = endpoint.baseUrl === 'webllm'

  async function handleTest() {
    setStatus('loading')
    setStatusMsg('')
    try {
      const list = await fetchModels(endpoint)
      setModels(list)
      setStatus('ok')
      setStatusMsg(t(lang, 'settings.testOk', { n: list.length }))
    } catch (e: any) {
      setStatus('error')
      setStatusMsg(e.message || t(lang, 'settings.testFail'))
      setModels([])
    }
  }

  // /models 通了不代表聊天可用——真实走一次 /chat/completions
  async function handleTestChat() {
    setChatStatus('loading')
    setChatMsg('')
    try {
      await testChat(endpoint)
      setChatStatus('ok')
      setChatMsg(t(lang, 'settings.chatOk'))
    } catch (e: any) {
      setChatStatus('error')
      setChatMsg(e.message || t(lang, 'settings.chatFail'))
    }
  }

  return (
    <div className="settings-panel">
      <div className="settings-head">
        <h3>{t(lang, 'settings.title')}</h3>
        <div className="lang-toggle" title={t(lang, 'settings.lang')}>
          {(['zh', 'en'] as Lang[]).map((l) => (
            <button key={l} className={lang === l ? 'active' : ''} onClick={() => setLang(l)}>
              {l === 'zh' ? '中文' : 'EN'}
            </button>
          ))}
        </div>
      </div>
      <div className="presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={endpoint.baseUrl === p.baseUrl ? 'active' : ''}
            onClick={() => { setEndpoint({ baseUrl: p.baseUrl, model: p.hint || endpoint.model }); setModels([]); setStatus('idle') }}
          >{p.baseUrl === 'webllm' ? t(lang, 'webllm.preset') : p.label}</button>
        ))}
      </div>
      {isWebllm ? (
        <p className="cors-hint">{t(lang, 'webllm.hint')}</p>
      ) : (
        <>
          <label>{t(lang, 'settings.baseUrl')}
            <input value={endpoint.baseUrl} onChange={(e) => setEndpoint({ baseUrl: e.target.value })} placeholder="https://api.deepseek.com/v1" />
          </label>
          {isLocalEndpoint && (
            <p className="cors-hint">{t(lang, 'settings.corsHint')}</p>
          )}
          <label>{t(lang, 'settings.apiKey')}
            <input type="password" value={endpoint.apiKey} onChange={(e) => setEndpoint({ apiKey: e.target.value })} placeholder="sk-..." />
          </label>
          <label>{t(lang, 'settings.model')}
            {models.length > 0 ? (
              <select value={endpoint.model} onChange={(e) => setEndpoint({ model: e.target.value })}>
                {!models.includes(endpoint.model) && <option value={endpoint.model}>{endpoint.model}</option>}
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input value={endpoint.model} onChange={(e) => setEndpoint({ model: e.target.value })} placeholder="deepseek-chat" />
            )}
          </label>
        </>
      )}
      <div className="param-row">
        <label>{t(lang, 'settings.temp')}
          <input
            type="number" min="0" max="2" step="0.1"
            value={endpoint.temperature ?? 0.8}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) setEndpoint({ temperature: v }) }}
          />
        </label>
        <label>{t(lang, 'settings.maxTokens')}
          <input
            type="number" min="128" max="8192" step="128"
            value={endpoint.maxTokens ?? 2048}
            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) setEndpoint({ maxTokens: v }) }}
          />
        </label>
      </div>
      {!isWebllm && (
        <>
          <div className="test-row">
            <button className="btn-test" onClick={handleTest} disabled={status === 'loading' || !endpoint.baseUrl}>
              {status === 'loading' ? t(lang, 'settings.testing') : t(lang, 'settings.test')}
            </button>
            {statusMsg && <span className={`test-msg ${status}`}>{statusMsg}</span>}
          </div>
          <div className="test-row">
            <button className="btn-test" onClick={handleTestChat} disabled={chatStatus === 'loading' || !endpoint.baseUrl || !endpoint.model}>
              {chatStatus === 'loading' ? t(lang, 'settings.sending') : t(lang, 'settings.sendTest')}
            </button>
            {chatMsg && <span className={`test-msg ${chatStatus}`}>{chatMsg}</span>}
          </div>
        </>
      )}
    </div>
  )
}
