import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['tonetic-semiprovincially-raeann.ngrok-free.dev'],
    proxy: {
      '/socket.io': {
        target: process.env.BACKEND_URL ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  }
})
