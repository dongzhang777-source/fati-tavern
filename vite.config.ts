import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // 开发时自动签发 HTTPS，WebGPU 要求安全上下文（手机真机调试必须）
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // 故事包 JSON 进预缓存：免 Key 试玩是离线卖点，
        // 总量约 36KB，不值得为省这点体积牺牲离线可用
        globPatterns: ['**/*.{js,css,html}', 'storypacks/**/*.json'],
        // web-llm 推理引擎分包（数 MB）只被免 Key 体验档懒加载，
        // 不进 SW 预缓存，避免所有访客后台白下载
        globIgnores: ['**/webllm-*.js'],
        // 移动端 dynamic import 大分包时 SW 拦截会导致
        // "importing a module script failed"，排除运行时缓存策略
        runtimeCaching: [
          {
            urlPattern: /webllm-.*\.js$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'webllm-chunks',
              expiration: { maxEntries: 3, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: 'FATI Tavern',
        short_name: 'Tavern',
        description: '肥猫酒馆 · Drop a character card in and chat',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // 固定 web-llm 分包名，配合上面的 globIgnores
        manualChunks: (id: string) => (id.includes('@mlc-ai') ? 'webllm' : undefined),
      },
    },
  },
})
