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
      '/api': {
        target: 'http://localhost:3009',
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
})
