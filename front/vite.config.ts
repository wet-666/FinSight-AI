import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [vue(), command === 'serve' ? vueDevTools() : null],
  build: {
    // LightningCSS 在 Vercel Linux 上会把部分选择器当成硬错误
    cssMinify: 'esbuild',
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        if (log.code === 'INVALID_ANNOTATION') return
        defaultHandler(level, log)
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3300',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3300',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',
        additionalData: '@use "@/styles/variable.scss" as *;',
      },
    },
  },
}))
