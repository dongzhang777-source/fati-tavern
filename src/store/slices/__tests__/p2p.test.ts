import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useP2PStore } from '../p2p'
import type { P2PMessage } from '../../../p2p/client'

const mem = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v) },
  removeItem: (k: string) => { mem.delete(k) },
})

const initial = useP2PStore.getState()
beforeEach(() => { useP2PStore.setState(initial, true); mem.clear() })

const handle = (msg: P2PMessage) => useP2PStore.getState()._handleP2PMessage(msg)

describe('useP2PStore 消息归约', () => {
  it('welcome 记录 peerId 与成员表', () => {
    handle({ kind: 'welcome', peerId: 'p_me', peers: [{ id: 'p_srv', isCompute: true }] })
    const s = useP2PStore.getState()
    expect(s.p2pPeerId).toBe('p_me')
    expect(s.p2pMembers).toEqual([{ id: 'p_srv', isCompute: true }])
  })

  it('presence 增员（去重）、leave 减员', () => {
    handle({ kind: 'welcome', peerId: 'p_me', peers: [] })
    handle({ kind: 'presence', from: 'p_a', isCompute: false })
    handle({ kind: 'presence', from: 'p_a', isCompute: false })
    expect(useP2PStore.getState().p2pMembers).toHaveLength(1)
    handle({ kind: 'leave', from: 'p_a' })
    expect(useP2PStore.getState().p2pMembers).toHaveLength(0)
  })

  it('chat 追加消息并区分 mine', () => {
    handle({ kind: 'welcome', peerId: 'p_me', peers: [] })
    handle({ kind: 'chat', id: 'm1', ts: 1, body: 'hi', from: 'p_other', encrypted: true })
    const m = useP2PStore.getState().p2pMessages[0]
    expect(m).toMatchObject({ id: 'm1', body: 'hi', from: 'p_other', mine: false, encrypted: true })
  })

  it('compute_result 按 reqId 聚合流式 chunk，done 结束', () => {
    useP2PStore.setState({ p2pComputes: [{ id: 'c1', prompt: 'q', result: '', done: false }], p2pStreamingComputeId: 'c1' })
    handle({ kind: 'compute_result', reqId: 'c1', body: '第一段', done: false, ts: 1 })
    handle({ kind: 'compute_result', reqId: 'c1', body: '第二段', done: false, ts: 2 })
    handle({ kind: 'compute_result', reqId: 'c1', body: '', done: true, ts: 3 })
    const c = useP2PStore.getState().p2pComputes[0]
    expect(c.result).toBe('第一段第二段')
    expect(c.done).toBe(true)
    expect(useP2PStore.getState().p2pStreamingComputeId).toBeNull()
  })

  it('无关 reqId 的 compute_result 忽略（房间广播里别人的流）', () => {
    useP2PStore.setState({ p2pComputes: [{ id: 'c1', prompt: 'q', result: '', done: false }] })
    handle({ kind: 'compute_result', reqId: 'c_other', body: 'x', done: false, ts: 1 })
    expect(useP2PStore.getState().p2pComputes[0].result).toBe('')
  })

  it('reject / _max_retries 写入 p2pError', () => {
    handle({ kind: 'reject', reason: 'invalid token' })
    expect(useP2PStore.getState().p2pError).toBe('invalid token')
    handle({ kind: '_max_retries' })
    expect(useP2PStore.getState().p2pError).toBe('reconnect_failed')
  })

  it('_state_change / _e2e_ready 更新状态', () => {
    handle({ kind: '_state_change', state: 'joined' })
    expect(useP2PStore.getState().p2pState).toBe('joined')
    handle({ kind: '_e2e_ready' })
    expect(useP2PStore.getState().p2pEncrypted).toBe(true)
  })

  it('chat 收到或发送自伤关键词触发 p2pSafetyNotice', () => {
    handle({ kind: 'chat', id: 'm_harm', ts: 1, body: '我不想活了', from: 'p_other' })
    expect(useP2PStore.getState().p2pSafetyNotice).toBe(true)
    useP2PStore.getState().dismissP2PSafetyNotice()
    expect(useP2PStore.getState().p2pSafetyNotice).toBe(false)
  })

  it('joinWithToken 在无法提取 Relay 且未指定时写入 invalid_relay 阻断误连', async () => {
    const { generateKeyPair, createInvite } = await import('../../../p2p/token')
    const kp = await generateKeyPair()
    const token = await createInvite(kp, { endpoint: 'invalid_scheme_ep' })
    await useP2PStore.getState().joinWithToken(token)
    expect(useP2PStore.getState().p2pError).toBe('invalid_relay')
  })

  it('chat 重复 id 消息去重，且维护最多 200 条消息滑动窗口', () => {
    handle({ kind: 'chat', id: 'dup_1', ts: 1, body: 'msg', from: 'p1' })
    handle({ kind: 'chat', id: 'dup_1', ts: 2, body: 'msg', from: 'p1' })
    expect(useP2PStore.getState().p2pMessages.length).toBe(1)

    for (let i = 0; i < 250; i++) {
      handle({ kind: 'chat', id: `m_${i}`, ts: i, body: `msg_${i}`, from: 'p1' })
    }
    expect(useP2PStore.getState().p2pMessages.length).toBe(200)
    expect(useP2PStore.getState().p2pMessages[0].id).toBe('m_50')
  })
})
