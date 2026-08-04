import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '@/api';
import type { PublicUser } from '@shared/types/login';

export type UserInfo = PublicUser;

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '');
  const user = ref<PublicUser | null>(null);

  const isLoggedIn = computed(() => !!token.value);

  function setToken(t: string) {
    token.value = t;
    localStorage.setItem('token', t);
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
    try {
      // 避免循环依赖：动态导入
      import('./aiSessionStore').then(({ useAiSessionStore }) => {
        useAiSessionStore().clear();
      });
    } catch {
      /* ignore */
    }
  }

  async function fetchProfile() {
    const res = await authApi.getProfile();
    user.value = res.data as PublicUser;
  }

  return { token, user, isLoggedIn, setToken, logout, fetchProfile };
});
