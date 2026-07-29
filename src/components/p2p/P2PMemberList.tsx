import { useStore } from '../../store'
import { useP2PStore } from '../../store/slices/p2p'
import { t } from '../../lib/i18n'

export function P2PMemberList() {
  const lang = useStore(s => s.lang)
  const members = useP2PStore(s => s.p2pMembers)
  const peerId = useP2PStore(s => s.p2pPeerId)

  return (
    <div className="p2p-members">
      <div className="p2p-members-title">{t(lang, 'p2pMembers')} ({members.length + 1})</div>
      <div className="p2p-member">
        <span className="p2p-member-dot online" />
        <span className="p2p-member-name">{peerId || 'me'} (我)</span>
      </div>
      {members.map(m => (
        <div key={m.id} className="p2p-member">
          <span className="p2p-member-dot online" />
          <span className="p2p-member-name">{m.id}</span>
          {m.isCompute && <span className="p2p-member-badge">🖥 {t(lang, 'p2pComputeNode')}</span>}
        </div>
      ))}
    </div>
  )
}
