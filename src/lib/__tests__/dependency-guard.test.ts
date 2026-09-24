import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 依赖守卫（TV-02b）：守住 package.json overrides 对 uuid 漏洞链的修复，防止被误删或降档。
 *
 * 背景：@capacitor/cli@8.5.1 → xcode@3.0.1 → uuid@7.0.3 触发 GHSA-w5hq-g745-h8pq
 * （v3/v5/v6 传 buf 参数缺边界检查；xcode 只调 v4()，实际不可达，但 7.0.3 存量
 * 持续制造 audit/dependabot 噪声）。修复方式是顶层 overrides 把 xcode 下的 uuid
 * 锁到 ^11.1.1，锁定条目由 npx npm@11 install 写入 lockfile。
 *
 * 本文件任一断言变红：先检查 overrides 是否被删/降档，恢复后重跑 npx npm@11 install。
 */
const rootDir = fileURLToPath(new URL('../../../', import.meta.url))
const readJson = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(`${rootDir}${rel}`, 'utf-8'))

/** 从 overrides 的范围写法中取版本下限；只认 ^ ~ >= 前缀与裸版本（其他写法判失败，fail-closed）。 */
const versionFloor = (range: string): [number, number, number] | null => {
  const m = range.trim().match(/^(?:\^|~|>=|v)?(\d+)\.(\d+)\.(\d+)$/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

const atLeast = (floor: [number, number, number], min: [number, number, number]): boolean => {
  for (let i = 0; i < 3; i++) {
    if (floor[i] !== min[i]) return floor[i] > min[i]
  }
  return true
}

const MIN_UUID = '11.1.1'
const MIN_UUID_TUPLE: [number, number, number] = [11, 1, 1]

describe('dependency-guard（TV-02b uuid 依赖链守卫）', () => {
  const pkg = readJson('package.json') as {
    overrides?: { uuid?: unknown; xcode?: { uuid?: unknown } }
    dependencies?: Record<string, string>
  }

  it('overrides 存在，且对 uuid 的版本下限 ≥ 11.1.1（作用域/全局两种形式，哪种生效判哪种）', () => {
    expect(
      pkg.overrides,
      'package.json 顶层 overrides 缺失——TV-02b 修复被回退，uuid@7.0.3 漏洞链会回来',
    ).toBeDefined()

    const global = pkg.overrides?.uuid
    const scoped = pkg.overrides?.xcode?.uuid
    const candidates = [global, scoped].filter((v): v is string => typeof v === 'string')

    expect(
      candidates.length,
      'overrides 里没有任何 uuid 锁定（既无全局 uuid 形式也无 xcode 作用域形式）',
    ).toBeGreaterThan(0)

    for (const range of candidates) {
      const floor = versionFloor(range)
      expect(
        floor,
        `overrides uuid="${range}" 不是可解析的写法（^ ~ >= 裸版本），守卫拒判——改成显式下限`,
      ).not.toBeNull()
      expect(
        atLeast(floor as [number, number, number], MIN_UUID_TUPLE),
        `overrides uuid="${range}" 下限低于 ${MIN_UUID}，低于 GHSA-w5hq-g745-h8pq 的修复版本`,
      ).toBe(true)
    }
  })

  it('实际安装的 uuid ≥ 11.1.1（node_modules 与 overrides 同步，由 npx npm@11 install 重算）', () => {
    const installed = readJson('node_modules/uuid/package.json') as { version: string }
    const floor = versionFloor(installed.version)
    expect(floor, `实装 uuid 版本号 ${installed.version} 不是 x.y.z 形式`).not.toBeNull()
    expect(
      atLeast(floor as [number, number, number], MIN_UUID_TUPLE),
      `实装 uuid ${installed.version} < ${MIN_UUID}：overrides 与 lockfile 失同步，重跑 npx npm@11 install`,
    ).toBe(true)
  })

  it('dependencies 不得直接引入 uuid（不允许用「加直接依赖」的方式掩盖传递链问题）', () => {
    expect(
      pkg.dependencies?.['uuid'],
      'uuid 出现在 dependencies——这不是 TV-02b 约定的修复路径，请走 overrides',
    ).toBeUndefined()
  })
})
