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
function Gallery() {
  const { characters, importCard, removeCharacter, openCharacter } = useStore()
  const [dragOver, setDragOver] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.name.toLowerCase().endsWith('.png')) {
        const buf = await file.arrayBuffer()
        const card = parsePngCard(buf)
        if (card) await importCard(card, file)
      } else if (file.name.toLowerCase().endsWith('.json')) {
        const text = await file.text()
        try {
          const json = JSON.parse(text)
          const card = parseCharacterJson(json)
          if (card) await importCard(card, file)
        } catch { /* skip */ }
      }
    }
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
        <div className="empty-gallery">
          <p className="empty-icon">🃏</p>
          <p>拖一张 SillyTavern 角色卡到这里</p>
          <p className="sub">支持 .png（v3 tEXt）和 .json（v1/v2）格式</p>
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
