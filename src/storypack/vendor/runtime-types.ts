/**
 * 本地 runtime 类型——替代 fati agent/types 的外部依赖。
 * tavern 只需 Scene/Choice 的最小接口，不需要 fati agent 的完整定义。
 */
export interface Choice {
  id: string
  text: string
  signals?: Partial<Record<string, number>>
  growthIntent?: boolean
}

export interface Scene {
  id: string
  text: string
  choices: Choice[]
  createdAt: number
  imageUrl?: string
}
