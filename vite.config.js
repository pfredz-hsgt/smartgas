import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: "/gas",
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    host: true, 
    open: true,
    proxy: {
      '/gas/api': {
        target: 'http://localhost:3009',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gas/, ''),
      },
    },
  },
  plugins: [react()],
})
