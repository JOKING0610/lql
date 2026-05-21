import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'

// 自定义插件：将 /lql/usercenter 映射到 user-center.html
// 使用 enforce: 'pre' 确保在 Vite 内置中间件之前执行
function userCenterPlugin() {
  return {
    name: 'vite-plugin-user-center',
    enforce: 'pre',
    configureServer(server) {
      // 使用 prepend 将中间件添加到栈的最前面
      server.middlewares.use((req, res, next) => {
        // Vite dev server 会将 base 从 URL 中去掉
        // 所以 /lql/usercenter 变成 /usercenter
        if (req.url === '/usercenter' || req.url === '/usercenter/' ||
            req.url === '/lql/usercenter' || req.url === '/lql/usercenter/') {
          // 优先 public（构建安全），其次 dist，再次 others
          const candidates = [
            resolve(__dirname, 'public/usercenter/index.html'),
            resolve(__dirname, 'dist/usercenter/index.html'),
            resolve(__dirname, 'others/user-center.html')
          ]
          for (const filePath of candidates) {
            if (existsSync(filePath)) {
              const html = readFileSync(filePath, 'utf-8')
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(html)
              return
            }
          }
        }
        next()
      })
    }
  }
}

export default defineConfig({
  base: '/lql/',
  plugins: [react(), userCenterPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      }
    }
  },
  appType: 'spa',
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
