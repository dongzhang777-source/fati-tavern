import { useState } from 'react'
import { useStore } from '../../store'
import { useP2PStore } from '../../store/slices/p2p'
import { t } from '../../lib/i18n'

export function P2PComputePanel({ onClose }: { onClose: () => void }) {
  const lang = useStore(s => s.lang)
  const computes = useP2PStore(s => s.p2pComputes)
  const streamingId = useP2PStore(s => s.p2pStreamingComputeId)
  const requestP2PCompute = useP2PStore(s => s.requestP2PCompute)
  const cancelP2PCompute = useP2PStore(s => s.cancelP2PCompute)
  const hasCompute = useP2PStore(s => s.p2pMembers.some(m => m.isCompute))
  const [prompt, setPrompt] = useState('')

  const ask = () => {
    if (!prompt.trim() || streamingId) return
    requestP2PCompute(prompt)
    setPrompt('')
  }

  return (
    <div className="p2p-compute">
      <div className="p2p-compute-head">
        <span>🖥 {t(lang, 'p2pBorrowCompute')}</span>
        <button className="btn-icon" onClick={onClose}>×</button>
      </div>
      <p className="p2p-hint">{t(lang, 'p2pComputePlaintextWarn')}</p>
      {computes.map(c => (
        <div key={c.id} className="p2p-compute-item">
          <div className="p2p-compute-prompt">{c.prompt}</div>
          <div className="p2p-compute-result">
            {c.result || (!c.done && '…')}
            {c.cancelled && ' [已取消]'}
          </div>
          {!c.done && c.id === streamingId && (
            <button className="btn-stop" onClick={() => cancelP2PCompute(c.id)}>
              {t(lang, 'p2pCancel')}
            </button>
          )}
          {c.done && !c.cancelled && (
            <button className="btn-p2p" onClick={() => requestP2PCompute(c.prompt)}>
              {t(lang, 'p2pRetry')}
            </button>
          )}
        </div>
      ))}
      <div className="input-bar">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={t(lang, 'p2pComputePlaceholder')}
          rows={2}
        />
        <button className="btn-send" onClick={ask} disabled={!hasCompute || !!streamingId}>
          {t(lang, 'p2pSend')}
        </button>
      </div>
    </div>
  )
}
