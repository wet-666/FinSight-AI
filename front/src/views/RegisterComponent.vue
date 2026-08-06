<template>
  <div class="auth-page">
    <LoginBackground class="auth-bg" />
    <t-button
      class="theme-toggle"
      theme="default"
      variant="outline"
      shape="round"
      size="small"
      @click="themeStore.toggle()"
    >
      <template #icon>
        <t-icon :name="themeStore.isDark ? 'sunny' : 'moon'" />
      </template>
      {{ themeStore.isDark ? '浅色' : '暗黑' }}
    </t-button>
    <div class="auth-card">
      <div class="auth-header">
        <h1>注册账号</h1>
        <p>开启您的 AI 投研之旅</p>
      </div>
      <t-form ref="formRef" :data="form" :rules="rules" @submit="onSubmit">
        <t-form-item label="用户名" name="username">
          <t-input v-model="form.username" placeholder="请输入用户名" />
        </t-form-item>
        <t-form-item label="邮箱" name="email">
          <t-input v-model="form.email" placeholder="请输入邮箱" />
        </t-form-item>
        <t-form-item label="昵称" name="nickname">
          <t-input v-model="form.nickname" placeholder="可选" />
        </t-form-item>
        <t-form-item label="密码" name="password">
          <t-input v-model="form.password" type="password" placeholder="至少6位" />
        </t-form-item>
        <t-form-item>
          <t-button theme="primary" type="submit" block :loading="loading">注册</t-button>
        </t-form-item>
      </t-form>
      <p class="auth-footer">
        已有账号？<router-link to="/login">返回登录</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { authApi } from '@/api';
import { useUserStore } from '@/stores/userStore';
import { useThemeStore } from '@/stores/themeStore';
import LoginBackground from '@/components/LoginBackground.vue';

const router = useRouter();
const userStore = useUserStore();
const themeStore = useThemeStore();
const loading = ref(false);

const form = reactive({
  username: '',
  email: '',
  nickname: '',
  password: '',
});

const rules = {
  username: [{ required: true, message: '请输入用户名' }],
  email: [{ required: true, message: '请输入邮箱', type: 'email' }],
  password: [{ required: true, message: '请输入密码', min: 6 }],
};

async function onSubmit({ validateResult }: { validateResult: boolean }) {
  if (validateResult !== true) return;
  loading.value = true;
  try {
    const res = await authApi.register(form);
    userStore.setToken((res.data as { token: string }).token);
    MessagePlugin.success('注册成功');
    router.push('/dashboard');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fs-market-bg);
  overflow: hidden;
}

.auth-bg {
  z-index: 0;
}

.theme-toggle {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 2;
  background: var(--fs-bg-surface) !important;
  border-color: var(--fs-border) !important;
  color: var(--fs-text-primary) !important;
}

.auth-card {
  position: relative;
  z-index: 1;
  width: 420px;
  padding: 40px;
  background: var(--fs-bg-surface);
  border: 1px solid var(--fs-border);
  border-radius: 16px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
}

.auth-header {
  text-align: center;
  margin-bottom: 24px;
}

.auth-header h1 {
  font-size: 24px;
  color: var(--fs-brand);
}

.auth-header p {
  margin-top: 8px;
  color: var(--fs-text-secondary);
}

.auth-footer {
  text-align: center;
  margin-top: 16px;
  color: var(--fs-text-secondary);
}

.auth-footer a {
  color: var(--fs-brand);
}
</style>
