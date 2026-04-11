import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    // Explicit entry so electron-vite always compiles out/main/index.js
    // Without this, MAIN_WINDOW_VITE_DEV_SERVER_URL is never injected and
    // Electron falls back to loading the missing out/renderer/index.html
    entry: resolve(__dirname, 'src/main/index.ts'),
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    // Explicit entry for preload so contextBridge is always compiled
    entry: resolve(__dirname, 'src/preload/index.ts'),
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  }
})
