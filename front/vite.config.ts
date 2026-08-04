import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  server:{
      proxy:{
         '/api':{
           target:'http://localhost:3300',
           changeOrigin:true,
         },
         '/uploads':{
           target:'http://localhost:3300',
           changeOrigin:true,
         }
      }
    },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'tdesign-icons-vue-next': fileURLToPath(
      new URL('../node_modules/tdesign-icons-vue-next', import.meta.url)
    )
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '@use "@/styles/variable.scss" as *;',
      },
    },
  },
})