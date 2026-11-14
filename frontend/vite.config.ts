/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const backend = process.env.SELENORA_BACKEND_URL ?? 'http://127.0.0.1:8000'
const devPort = Number(process.env.SELENORA_WEB_PORT ?? 5173)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: devPort,
    // Dev proxy: the browser talks to the Vite origin; no API keys ever reach the client.
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/health': { target: backend, changeOrigin: true },
      // Capability detection: the UI enables contracted features only if the live schema lists them.
      '/openapi.json': { target: backend, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/health': { target: backend, changeOrigin: true },
      // Capability detection: the UI enables contracted features only if the live schema lists them.
      '/openapi.json': { target: backend, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // Heavy libraries (OpenLayers, Recharts) are split per route via React.lazy.
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
