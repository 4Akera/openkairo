import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@core': fileURLToPath(new URL('./src/core', import.meta.url)), '@packs': fileURLToPath(new URL('./src/packs', import.meta.url)) } },
  server: { port: 3000 },
})
