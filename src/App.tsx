import { useRef, useState, useEffect } from 'react'
import { useStore } from './store'
import { parseCharacterJson, parsePngCard } from './lib/tavern'
import { PRESETS, fetchModels } from './lib/api'
import './App.css'

export default function App() {
  const store = useStore()
  const { view } = store

  useEffect(() => { store.init() }, [])

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
  const { characters, importCard, removeCharacter, openCharacter } = useStore()
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
            throw new Error('JSON 解析失败')
          }
          const card = parseCharacterJson(json)
          if (!card) throw new Error('无法识别的角色卡格式')
          await importCard(card, file)
          ok++
        } else {
          throw new Error('仅支持 .png / .json 文件')
        }
      } catch (e: any) {
        fails.push({ name: file.name, reason: e?.message || '导入失败' })
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
      {dragOver && <div className="drop-overlay">松开导入角色卡（PNG / JSON）</div>}

      <header className="gallery-header">
        <h1>🍺 FATI Tavern</h1>
        <div className="gallery-actions">
          <button className="btn-import" onClick={() => fileRef.current?.click()}>+ 导入角色卡</button>
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
            <h2>拖一张角色卡进来，和 TA 聊天</h2>
            <p className="landing-sub">支持 SillyTavern 角色卡（PNG / JSON），3 分钟开始你的第一次对话</p>
          </div>

          <div className="landing-demo">
            <div className="demo-step">
              <span className="demo-num">1</span>
              <div className="demo-card">
                <span className="demo-icon">🃏</span>
                <span>拖入角色卡</span>
              </div>
            </div>
            <span className="demo-arrow">→</span>
            <div className="demo-step">
              <span className="demo-num">2</span>
              <div className="demo-card">
                <span className="demo-icon">⚙️</span>
                <span>填入你的 API Key</span>
              </div>
            </div>
            <span className="demo-arrow">→</span>
            <div className="demo-step">
              <span className="demo-num">3</span>
              <div className="demo-card">
                <span className="demo-icon">💬</span>
                <span>开始聊天</span>
              </div>
            </div>
          </div>

          <div className="landing-cta">
            <button className="btn-import big" onClick={() => fileRef.current?.click()}>导入第一张角色卡</button>
            <span className="landing-hint">或者直接把文件拖到页面任意位置</span>
          </div>

          <div className="landing-privacy">
            <h3>🔒 隐私承诺</h3>
            <p>你的 API Key、角色卡、聊天记录全部只存在你的浏览器中。没有后端服务器，没有数据上传，没有账号注册。关闭页面后一切仍在本地。</p>
          </div>

          <div className="landing-features">
            <div className="feature"><span>🚀</span><p>纯前端 PWA<br/>零安装零注册</p></div>
            <div className="feature"><span>🔑</span><p>BYOK 自带 Key<br/>DeepSeek / Kimi / OpenAI / 本地</p></div>
            <div className="feature"><span>📱</span><p>手机电脑通用<br/>可添加到主屏幕</p></div>
            <div className="feature"><span>💾</span><p>数据存本地<br/>刷新不丢失</p></div>
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
                <span className="card-desc">{c.card.description?.slice(0, 60) || c.card.personality?.slice(0, 60) || '暂无描述'}</span>
                {c.card.tags?.length > 0 && (
                  <span className="card-tags">{c.card.tags.slice(0, 3).join(' · ')}</span>
                )}
              </div>
              <button className="btn-del" onClick={(e) => { e.stopPropagation(); removeCharacter(c.id) }} title="删除">×</button>
            </div>
          ))}
        </div>
      )}

      <footer className="gallery-footer">
        <span>BYOK · 你的 Key 和聊天记录不离开你的设备</span>
      </footer>

      {importResult && (
        <div className={`import-toast ${importResult.fails.length > 0 ? 'has-fail' : ''}`} onClick={() => setImportResult(null)}>
          {importResult.ok > 0 && <p>✓ 已导入 {importResult.ok} 张角色卡</p>}
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
            <h3>对话</h3>
            <button onClick={() => newConversation()}>+ 新对话</button>
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
          <button className="btn-back" onClick={backToGallery}>← 角色库</button>
          <div className="chat-title">
            {char.avatarUrl && <img className="header-avatar" src={char.avatarUrl} alt="" />}
            <strong>{char.card.name}</strong>
          </div>
          <div className="chat-actions">
            <button onClick={() => setShowConvList(!showConvList)} title="对话列表">☰</button>
            <button onClick={clearChat} title="清空">🗑</button>
          </div>
        </header>

        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="msg-content">{m.content || (streaming && i === messages.length - 1 ? '…' : '')}</div>
              {m.ts && <span className="msg-time">{new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {error && <div className="error-bar">⚠ {error}</div>}

        <footer className="input-bar">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder={`对 ${char.card.name} 说点什么…`}
            disabled={streaming}
            autoFocus
          />
          {streaming
            ? <button className="btn-stop" onClick={stopStreaming}>■ 停止</button>
            : <button className="btn-send" onClick={handleSend} disabled={!input.trim()}>发送</button>
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
  const { endpoint, setEndpoint } = useStore()
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')

  async function handleTest() {
    setStatus('loading')
    setStatusMsg('')
    try {
      const list = await fetchModels(endpoint)
      setModels(list)
      setStatus('ok')
      setStatusMsg(`连接成功，发现 ${list.length} 个模型`)
    } catch (e: any) {
      setStatus('error')
      setStatusMsg(e.message || '连接失败')
      setModels([])
    }
  }

  return (
    <div className="settings-panel">
      <h3>API 端点</h3>
      <div className="presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={endpoint.baseUrl === p.baseUrl ? 'active' : ''}
            onClick={() => { setEndpoint({ baseUrl: p.baseUrl, model: p.hint || endpoint.model }); setModels([]); setStatus('idle') }}
          >{p.label}</button>
        ))}
      </div>
      <label>Base URL
        <input value={endpoint.baseUrl} onChange={(e) => setEndpoint({ baseUrl: e.target.value })} placeholder="https://api.deepseek.com/v1" />
      </label>
      <label>API Key（只存本地，不离开你的设备）
        <input type="password" value={endpoint.apiKey} onChange={(e) => setEndpoint({ apiKey: e.target.value })} placeholder="sk-..." />
      </label>
      <label>模型
        {models.length > 0 ? (
          <select value={endpoint.model} onChange={(e) => setEndpoint({ model: e.target.value })}>
            {!models.includes(endpoint.model) && <option value={endpoint.model}>{endpoint.model}</option>}
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input value={endpoint.model} onChange={(e) => setEndpoint({ model: e.target.value })} placeholder="deepseek-chat" />
        )}
      </label>
      <div className="test-row">
        <button className="btn-test" onClick={handleTest} disabled={status === 'loading' || !endpoint.baseUrl}>
          {status === 'loading' ? '测试中…' : '测试连接 & 拉取模型'}
        </button>
        {statusMsg && <span className={`test-msg ${status}`}>{statusMsg}</span>}
      </div>
    </div>
  )
}
