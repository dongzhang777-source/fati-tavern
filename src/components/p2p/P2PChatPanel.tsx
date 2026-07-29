import { useState, useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { useP2PStore } from '../../store/slices/p2p'
import { t } from '../../lib/i18n'
import { P2PMemberList } from './P2PMemberList'
import { P2PComputePanel } from './P2PComputePanel'

export function P2PChatPanel() {
  const lang = useStore(s => s.lang)
  const messages = useP2PStore(s => s.p2pMessages)
  const p2pState = useP2PStore(s => s.p2pState)
  const encrypted = useP2PStore(s => s.p2pEncrypted)
  const p2pError = useP2PStore(s => s.p2pError)
  const sendP2PChat = useP2PStore(s => s.sendP2PChat)
  const p2pToken = useP2PStore(s => s.p2pToken)
  const joinWithToken = useP2PStore(s => s.joinWithToken)
  const [input, setInput] = useState('')
  const [showCompute, setShowCompute] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  const send = () => {
    if (!input.trim()) return
    sendP2PChat(input)
    setInput('')
  }

  return (
    <div className="p2p-chat">
      <div className="p2p-status-bar">
        <span className={`p2p-state ${p2pState}`}>
          {p2pState === 'joined' ? t(lang, 'p2pJoined')
            : p2pState === 'connecting' ? t(lang, 'p2pConnecting')
            : t(lang, 'p2pDisconnected')}
        </span>
        <span className="p2p-e2e">
          {encrypted ? `🔒 ${t(lang, 'p2pE2E')} | ${t(lang, 'p2pComputePlaintextShort')}` : t(lang, 'p2pPlaintext')}
        </span>
      </div>
      {p2pError === 'reconnect_failed' && p2pToken && (
        <div className="p2p-reconnect">
          {t(lang, 'p2pReconnectFailed')}
          <button className="btn-p2p" onClick={() => void joinWithToken(p2pToken)}>
            {t(lang, 'p2pReconnect')}
          </button>
        </div>
      )}
      <P2PMemberList />
      <div className="messages">
        {messages.map(m => (
          <div key={m.id} className={`msg ${m.mine ? 'user' : 'assistant'}`}>
            {!m.mine && <div className="p2p-msg-from">{m.from}{m.encrypted ? ' 🔒' : ''}</div>}
            <div>{m.body}</div>
            <div className="msg-time">{new Date(m.ts).toLocaleTimeString()}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {showCompute && <P2PComputePanel onClose={() => setShowCompute(false)} />}
      <div className="input-bar">
        <button className="btn-imp" onClick={() => setShowCompute(v => !v)} title={t(lang, 'p2pBorrowCompute')}>🖥</button>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={t(lang, 'p2pInputPlaceholder')}
          rows={1}
        />
        <button className="btn-send" onClick={send} disabled={p2pState !== 'joined'}>
          {t(lang, 'p2pSend')}
        </button>
      </div>
    </div>
  )
}
