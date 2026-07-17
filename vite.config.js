import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const useLocalApi = mode === 'local-dev'
  const proxy = {
    target: useLocalApi ? 'http://127.0.0.1:8788' : 'https://api.vault.deze.me',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '/v1'),
  }

  if (!useLocalApi) {
    proxy.cookieDomainRewrite = ''
    proxy.headers = { origin: 'https://vault.deze.me' }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: { '/api': proxy },
    },
  }
})
