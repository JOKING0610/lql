import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/musicapp/',
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      // 酷我音乐 CDN 代理 — 绕过 CORS 限制
      '/api/kuwo-proxy': {
        target: 'https://lv-sycdn.kuwo.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kuwo-proxy/, ''),
        headers: {
          'Referer': 'https://www.kuwo.cn/',
          'Origin': 'https://www.kuwo.cn'
        }
      }
    }
  }
})
