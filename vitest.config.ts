import { defineConfig } from 'vitest/config'

// 独立于 vite.config.ts——测试不需要 react/PWA 插件
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
