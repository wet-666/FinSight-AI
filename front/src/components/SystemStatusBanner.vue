<template>
  <div v-if="visible" class="sys-banner" :class="bannerClass">
    <div class="sys-banner__left">
      <t-tag size="small" :theme="dbOk ? 'success' : 'danger'"><!-- -->DB {{ dbOk ? '正常' : '异常' }}</t-tag>
      <t-tag size="small" :theme="marketOk ? 'success' : 'warning'">行情 {{ marketOk ? '可用' : '降级' }}</t-tag>
      <t-tag size="small" :theme="llmOk ? 'success' : 'warning'">LLM {{ llmOk ? '可用' : 'Demo/异常' }}</t-tag>
      <span class="sys-banner__msg">{{ message }}</span>
    </div>
    <t-button size="small" variant="text" @click="refresh">刷新状态</t-button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

type HealthPayload = {
  status: string;
  database?: { ok: boolean; message: string };
  market?: { ok: boolean; message: string };
  llm?: { ok: boolean; message: string; latencyMs?: number };
};

const health = ref<HealthPayload | null>(null);
const visible = computed(() => Boolean(health.value));
const dbOk = computed(() => health.value?.database?.ok ?? false);
const marketOk = computed(() => health.value?.market?.ok ?? false);
const llmOk = computed(() => health.value?.llm?.ok ?? false);

const message = computed(() => {
  if (!health.value) return '';
  const parts = [
    health.value.database?.message,
    health.value.market?.message,
    health.value.llm?.message,
  ].filter(Boolean);
  return parts.join(' · ');
});

const bannerClass = computed(() => {
  if (!dbOk.value) return 'is-error';
  if (!llmOk.value || !marketOk.value) return 'is-warn';
  return 'is-ok';
});

async function refresh() {
  try {
    const res = await fetch('/api/health');
    health.value = (await res.json()) as HealthPayload;
  } catch {
    health.value = {
      status: 'degraded',
      database: { ok: false, message: '无法连接后端 /api/health' },
      market: { ok: false, message: '未知' },
      llm: { ok: false, message: '未知' },
    };
  }
}

onMounted(refresh);
</script>

<style scoped>
.sys-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--fs-border);
  font-size: 12px;
  color: var(--fs-text-secondary);
  flex-shrink: 0;
  min-width: 0;
  overflow: hidden;
}
.sys-banner__left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
  flex: 1;
}
.sys-banner__msg {
  opacity: 0.9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.is-ok {
  background: #f2fbf6;
}
.is-warn {
  background: #fff8e8;
}
.is-error {
  background: #fff1f0;
}

</style>

<style>
html[theme-mode='dark'] .sys-banner.is-ok {
  background: rgba(0, 168, 112, 0.12);
}
html[theme-mode='dark'] .sys-banner.is-warn {
  background: rgba(227, 160, 8, 0.14);
}
html[theme-mode='dark'] .sys-banner.is-error {
  background: rgba(227, 77, 89, 0.14);
}
</style>
