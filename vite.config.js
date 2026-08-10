import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { localizeDevelopmentCookie } from './src/apiSession.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const useLocalApi = mode === 'local-dev'
  const proxy = {
    target: useLocalApi ? 'http://127.0.0.1:8788' : 'https://api.vault.deze.me',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '/v1'),
  }

  if (!useLocalApi) {
    proxy.headers = { origin: 'https://vault.deze.me' }
    proxy.configure = (server) => {
      server.on('proxyRes', (response) => {
        const cookies = response.headers['set-cookie']
        if (cookies) response.headers['set-cookie'] = cookies.map(localizeDevelopmentCookie)
      })
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: { '/api': proxy },
    },
  }
})
