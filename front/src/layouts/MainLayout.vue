<template>
  <t-layout class="main-layout">
    <t-aside width="220px" class="sidebar">
      <div class="logo">
        <span class="logo-icon">📈</span>
        <span class="logo-text">FinSight-AI</span>
      </div>
      <t-menu :value="activeMenu" theme="light" @change="onMenuChange">
        <t-menu-item value="dashboard">
          <template #icon><t-icon name="dashboard" /></template>
          智能仪表盘
        </t-menu-item>
        <t-menu-item value="sim-trading">
          <template #icon><t-icon name="wallet" /></template>
          模拟投资体验
        </t-menu-item>
        <t-menu-item value="risk-assessment">
          <template #icon><t-icon name="secured" /></template>
          风险测评
        </t-menu-item>
        <t-menu-item value="backtest">
          <template #icon><t-icon name="chart-line" /></template>
          策略回测实验室
        </t-menu-item>
        <t-menu-item value="portfolio">
          <template #icon><t-icon name="chart-pie" /></template>
          组合诊断
        </t-menu-item>
        <t-menu-item value="reports">
          <template #icon><t-icon name="file" /></template>
          报告中心
        </t-menu-item>
        <t-menu-item value="notes">
          <template #icon><t-icon name="edit" /></template>
          智能投资笔记
        </t-menu-item>
        <t-menu-item value="profile">
          <template #icon><t-icon name="user" /></template>
          个人设置
        </t-menu-item>
      </t-menu>
      <div class="sidebar-footer">
        <p class="agent-tags">
          <t-tag size="small" theme="default" variant="light">模拟交易</t-tag>
          <t-tag size="small" theme="primary" variant="light">舆情分析师</t-tag>
          <t-tag size="small" theme="success" variant="light">量化研究员</t-tag>
          <t-tag size="small" theme="warning" variant="light">投资秘书</t-tag>
        </p>
      </div>
    </t-aside>
    <t-layout>
      <t-header class="header">
        <div class="header-left">
          <span class="subtitle">FinSight-AI · 三Agent投研工作流 · 教育模拟</span>
        </div>
        <div class="header-right">
          <t-button theme="default" variant="text" @click="triggerSentiment">
            <t-icon name="refresh" /> 更新舆情
          </t-button>
          <t-dropdown :options="userOptions" @click="onUserAction">
            <t-button variant="text">
              {{ userStore.user?.nickname || '用户' }}
              <t-icon name="chevron-down" />
            </t-button>
          </t-dropdown>
        </div>
      </t-header>
      <t-content class="content">
        <router-view />
      </t-content>
    </t-layout>
  </t-layout>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useUserStore } from '@/stores/userStore';
import { sentimentApi } from '@/api';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const activeMenu = computed(() => {
  const path = route.path.split('/')[1];
  if (path === 'stock') return 'dashboard';
  return path || 'dashboard';
});

const userOptions = [
  { content: '个人设置', value: 'profile' },
  { content: '退出登录', value: 'logout' },
];

function onMenuChange(val: string | number) {
  router.push(`/${String(val)}`);
}

function onUserAction(data: { value: string }) {
  if (data.value === 'logout') {
    userStore.logout();
    router.push('/login');
  } else if (data.value === 'profile') {
    router.push('/profile');
  }
}

async function triggerSentiment() {
  try {
    MessagePlugin.loading('正在抓取并分析舆情...');
    await sentimentApi.triggerAnalyze();
    MessagePlugin.success('舆情分析已更新');
  } catch {
    // handled by interceptor
  }
}

onMounted(() => {
  userStore.fetchProfile().catch(() => {});
});
</script>

<style scoped>
.main-layout {
  min-height: 100vh;
}

.sidebar {
  background: #fff;
  border-right: 1px solid #e7e7e7;
  display: flex;
  flex-direction: column;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 16px;
  font-size: 18px;
  font-weight: 600;
  color: #0052d9;
}

.logo-icon {
  font-size: 24px;
}

.header {
  background: #fff;
  border-bottom: 1px solid #e7e7e7;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
}

.subtitle {
  color: #666;
  font-size: 14px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.content {
  background: #f5f7fa;
  min-height: calc(100vh - 56px);
}

.sidebar-footer {
  margin-top: auto;
  padding: 16px;
}

.agent-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
