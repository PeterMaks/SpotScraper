import path from "path"
import { fileURLToPath } from "url"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: host || false,
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
