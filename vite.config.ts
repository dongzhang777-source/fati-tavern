import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // web-llm 推理引擎分包（数 MB）只被免 Key 体验档懒加载，
        // 不进 SW 预缓存，避免所有访客后台白下载
        globIgnores: ['**/webllm-*.js'],
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
