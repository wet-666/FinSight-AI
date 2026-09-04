import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const require = createRequire(import.meta.url)

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
      'tdesign-icons-vue-next': dirname(
        require.resolve('tdesign-icons-vue-next/package.json')
      ),
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