<template>
  <t-layout class="main-layout">
    <t-aside width="220px" class="sidebar">
      <div class="sidebar-inner">
        <div class="logo">
          <span class="logo-icon">📈</span>
          <span class="logo-text">FinSight</span>
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
          <t-menu-item value="agent-runs">
            <template #icon><t-icon name="root-list" /></template>
            Agent 运行历史
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
      </div>
    </t-aside>
    <t-layout class="main-body">
      <SystemStatusBanner />
      <t-header class="header">
        <div class="header-left">
          <span class="subtitle">FinSight · 可观测三 Agent · 教育模拟</span>
        </div>
        <div class="header-right">
          <t-button theme="default" variant="text" @click="triggerSentiment">
            <t-icon name="refresh" /> 更新舆情
          </t-button>
          <t-dropdown :options="userOptions" @click="onUserAction">
            <t-button variant="text" class="user-btn">
              <t-avatar
                v-if="avatarSrc"
                size="28px"
                :image="avatarSrc"
                style="margin-right: 6px"
              />
              <t-avatar v-else size="28px" style="margin-right: 6px">
                {{ (userStore.user?.nickname || '用').slice(0, 1) }}
              </t-avatar>
              {{ userStore.user?.nickname || '用户' }}
              <t-icon name="chevron-down" />
            </t-button>
          </t-dropdown>
        </div>
      </t-header>
      <t-content class="content">
        <router-view v-slot="{ Component, route: r }">
          <keep-alive :include="['Backtest', 'SimTrading']">
            <component :is="Component" :key="r.name === 'StockAnalysis' ? r.fullPath : String(r.name)" />
          </keep-alive>
        </router-view>
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
import SystemStatusBanner from '@/components/SystemStatusBanner.vue';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const avatarSrc = computed(() => {
  const a = userStore.user?.avatar || '';
  if (!a) return '';
  if (a.startsWith('http') || a.startsWith('data:') || a.startsWith('/')) return a;
  return a;
});

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
    const res = await sentimentApi.triggerAnalyze();
    const data = res.data as { source?: string; fetched?: number };
    MessagePlugin.success(
      data?.source === 'mock'
        ? '外部快讯不可用，已使用本地样例资讯并完成分析'
        : `舆情已更新（抓取 ${data?.fetched ?? 0} 条）`
    );
    window.dispatchEvent(new CustomEvent('finsight:sentiment-updated'));
  } catch {
    // handled by interceptor
  }
}

/** 登录进主布局后静默抓一轮舆情（每个浏览器会话只跑一次） */
async function bootstrapNewsAfterLogin() {
  const flag = 'finsight:news-bootstrapped';
  if (sessionStorage.getItem(flag)) return;
  sessionStorage.setItem(flag, '1');
  try {
    const res = await sentimentApi.triggerAnalyze();
    const data = res.data as { source?: string; fetched?: number };
    window.dispatchEvent(new CustomEvent('finsight:sentiment-updated'));
    if (data?.source === 'eastmoney') {
      MessagePlugin.success(`已自动更新舆情（东方财富 ${data.fetched ?? 0} 条）`);
    }
  } catch {
    sessionStorage.removeItem(flag);
  }
}

onMounted(() => {
  userStore.fetchProfile().catch(() => {});
  void bootstrapNewsAfterLogin();
});
</script>

<style scoped>
/* 整页固定视口：左侧栏不随右侧滚动 */
.main-layout {
  height: 100vh;
  overflow: hidden;
}

.main-layout :deep(.t-layout) {
  height: 100%;
}

.sidebar {
  flex-shrink: 0;
  height: 100vh;
  overflow: hidden;
  background: #fff;
  border-right: 1px solid #e7e7e7;
}

.sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.main-body {
  flex: 1;
  min-width: 0;
  height: 100vh;
  overflow: hidden;
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
  flex-shrink: 0;
}

.logo-icon {
  font-size: 24px;
}

.header {
  flex-shrink: 0;
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
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background: #f5f7fa;
}

.sidebar-footer {
  margin-top: auto;
  padding: 16px;
  flex-shrink: 0;
}

.agent-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

:deep(.t-button .t-button--text){
  display: flex;
}
</style>
