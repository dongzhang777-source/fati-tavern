import { useState } from 'react'
import { useStore } from '../../store'
import { useP2PStore, loadRelayUrl } from '../../store/slices/p2p'
import { t } from '../../lib/i18n'

export function P2PInvitePanel() {
  const lang = useStore(s => s.lang)
  const createInviteToken = useP2PStore(s => s.createInviteToken)
  const joinWithToken = useP2PStore(s => s.joinWithToken)
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')

  const generate = async () => {
    setErr('')
    try {
      const tok = await createInviteToken()
      setToken(tok)
      await joinWithToken(tok, loadRelayUrl()) // 自建房：签发后自己先进房
    } catch {
      setErr(t(lang, 'p2pUnsupported'))
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  return (
    <div className="p2p-panel">
      <p className="p2p-hint">{t(lang, 'p2pSelfHostWarn')}</p>
      <button className="btn-p2p" onClick={generate}>{t(lang, 'p2pCreateInvite')}</button>
      {token && (
        <>
          <textarea className="p2p-token-box" readOnly value={token} rows={3} />
          <button className="btn-p2p" onClick={copy}>
            {copied ? t(lang, 'p2pCopied') : t(lang, 'p2pCopy')}
          </button>
        </>
      )}
      {err && <p className="p2p-error">{err}</p>}
    </div>
  )
}
