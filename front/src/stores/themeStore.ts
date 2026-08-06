import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'finsight:theme'

function readStored(): ThemeMode {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === 'dark' || raw === 'light') return raw
  return 'light'
}

/** 同步到 <html theme-mode="dark">，TDesign 组件靠这个切换设计令牌 */
function applyDom(mode: ThemeMode) {
  const root = document.documentElement
  if (mode === 'dark') {
    root.setAttribute('theme-mode', 'dark')
  } else {
    root.removeAttribute('theme-mode')
  }
  window.dispatchEvent(new CustomEvent('finsight:theme-changed', { detail: { mode } }))
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(readStored())
  const isDark = computed(() => mode.value === 'dark')

  function setMode(next: ThemeMode) {
    mode.value = next
    localStorage.setItem(STORAGE_KEY, next)
    applyDom(next)
  }

  function toggle() {
    setMode(mode.value === 'dark' ? 'light' : 'dark')
  }

  /** 应用启动时调用一次 */
  function init() {
    applyDom(mode.value)
  }

  return { mode, isDark, setMode, toggle, init }
})
