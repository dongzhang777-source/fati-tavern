import { useState } from 'react'
import { useStore } from '../../store'
import { useP2PStore } from '../../store/slices/p2p'
import { t } from '../../lib/i18n'

export function P2PJoinPanel() {
  const lang = useStore(s => s.lang)
  const joinWithToken = useP2PStore(s => s.joinWithToken)
  const p2pError = useP2PStore(s => s.p2pError)
  const p2pState = useP2PStore(s => s.p2pState)
  const [token, setToken] = useState('')

  const join = () => {
    const tok = token.trim()
    if (!tok) return
    // L-4：移除死代码——https 页面连 ws:// 的拦截由浏览器混合内容策略执行，
    // 下方 p2pMixedContentWarn 提示已覆盖用户告知
    void joinWithToken(tok)
  }

  return (
    <div className="p2p-panel">
      <textarea
        className="p2p-token-box"
        placeholder={t(lang, 'p2pPasteToken')}
        value={token}
        onChange={e => setToken(e.target.value)}
        rows={3}
      />
      <button className="btn-p2p" onClick={join} disabled={p2pState === 'connecting'}>
        {p2pState === 'connecting' ? t(lang, 'p2pConnecting') : t(lang, 'p2pJoin')}
      </button>
      {location.protocol === 'https:' && (
        <p className="p2p-hint">{t(lang, 'p2pMixedContentWarn')}</p>
      )}
      {p2pError && <p className="p2p-error">{p2pError === 'reconnect_failed' ? t(lang, 'p2pReconnectFailed') : p2pError}</p>}
    </div>
  )
}
