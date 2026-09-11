// TV 交付修复回归（2026-09-11，全库审查 P1-1/P1-2）
//
// 漏洞成因：`store.ts` 里 `dbPutConversation(...)` 是 **fire-and-forget**，
// 而 `lib/db.ts` 的该函数**会抛**（openDB/tx reject）→ 未接住即 unhandled rejection，
// 表现为「界面已显示、磁盘未落、刷新后整段对话消失且无任何提示」。
//
// 本测试钉住修复：**写库失败时必须给出用户可见的错误**（不是静默）。
// 变异验证方式：把 store.ts 里 `.catch(...)` 去掉 → 本测试应变红。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../lib/db')
  return { ...actual, dbPutConversation: vi.fn() }
})

import { dbPutConversation } from '../../lib/db'
import { useStore } from '../../store'

const mockPut = dbPutConversation as unknown as { mockReset: () => void; mockRejectedValueOnce: (e: unknown) => void }

describe('落库失败必须可见（P1-1/P1-2）', () => {
  beforeEach(() => {
    mockPut.mockReset()
    useStore.setState({ error: null })
  })

  it('renameConversation 落库失败 → 设置 error，不再静默回退', async () => {
    mockPut.mockRejectedValueOnce(new Error('QuotaExceededError'))
    useStore.setState({
      conversations: [
        { id: 'c1', characterId: 'ch1', title: '旧标题', messages: [], updatedAt: 0 },
      ] as never,
    })

    useStore.getState().renameConversation('c1', '新标题')
    await new Promise((r) => setTimeout(r, 0))

    // 修复前：error 为 null（静默）；修复后：必须有可见提示
    expect(useStore.getState().error).toBeTruthy()
  })
})
