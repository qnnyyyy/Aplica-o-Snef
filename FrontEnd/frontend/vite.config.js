import { defineConfig } from 'vite'

function startOnHome() {
  return {
    name: 'start-on-home',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url === '/home') {
          req.url = '/home.html'
        }
        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [startOnHome()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
