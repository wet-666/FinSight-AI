<template>
  <div class="page-container">
    <t-card title="Agent 运行历史" :bordered="false">
      <template #actions>
        <t-button size="small" variant="outline" :loading="loading" @click="load">刷新</t-button>
      </template>
      <t-alert
        theme="info"
        message="每次在个股页点击「AI 分析师」都会新增一条记录。点「详情」可查看证据/冲突，并对该次结果追问。"
        style="margin-bottom: 12px"
      />
      <t-table
        :data="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        empty="暂无记录，先去个股页跑一次 AI 分析"
      >
        <template #stock="{ row }">
          <a class="link" @click="$router.push(`/stock/${row.stock_code}`)">
            {{ row.stock_name || row.stock_code }}（{{ row.stock_code }}）
          </a>
        </template>
        <template #mode="{ row }">
          <t-tag size="small" :theme="modeTheme(row.mode)" variant="light">{{ row.mode }}</t-tag>
        </template>
        <template #status="{ row }">
          <t-tag size="small" :theme="statusTheme(row.status)" variant="light">
            {{ statusLabel(row.status) }}
          </t-tag>
        </template>
        <template #op="{ row }">
          <t-button size="small" variant="text" @click="openDetail(row.id)">详情 / 追问</t-button>
        </template>
      </t-table>
      <p v-if="rows.length" class="count-hint">共 {{ rows.length }} 条（最多展示 50 条）</p>
    </t-card>

    <t-drawer v-model:visible="drawer" header="运行详情 · 可追问" size="560px">
      <template v-if="detail">
        <p><b>标的：</b>{{ detail.stock_name }}（{{ detail.stock_code }}）</p>
        <p><b>模式：</b>{{ detail.mode }} · <b>状态：</b>{{ statusLabel(detail.status) }}</p>
        <t-alert
          v-if="!canAsk"
          theme="warning"
          :close="false"
          style="margin: 8px 0 12px"
          :message="askDisabledReason"
        />
        <t-divider />
        <div v-for="(s, i) in parsedStages" :key="i" class="stage">
          <h4>{{ s.title }} <t-tag size="small">{{ s.status }}</t-tag></h4>
          <p>{{ s.summary }}</p>
        </div>

        <template v-if="detailCitations.length">
          <t-divider />
          <h4>证据引用</h4>
          <div v-for="c in detailCitations" :key="c.id" class="cite-line">
            <b>{{ c.id }}</b> {{ c.title }}
            <span class="muted">（{{ c.score }}）</span>
            <div class="muted">{{ c.snippet }}</div>
          </div>
        </template>

        <template v-if="detailConflicts.length">
          <t-divider />
          <h4>冲突点</h4>
          <t-alert
            v-for="(c, i) in detailConflicts"
            :key="i"
            :theme="c.severity === 'high' ? 'error' : c.severity === 'warning' ? 'warning' : 'info'"
            :message="c.summary"
            style="margin-bottom: 8px"
          />
        </template>

        <t-divider />
        <pre class="report" v-html="formatAiText(detail.final_report || '（暂无报告正文）')" />

        <t-divider />
        <h4>追问本次结果</h4>
        <div class="ask-list">
          <div v-for="(m, i) in askMessages" :key="i" class="ask-msg" :class="m.role">
            <div class="ask-bubble">{{ m.content }}</div>
          </div>
          <t-empty v-if="askMessages.length === 0" description="输入问题后发送，将结合当次结果再检索回答" />
        </div>
        <div class="ask-input-row">
          <t-input
            v-model="askQuestion"
            placeholder="例如：支撑位怎么来的？和舆情冲突吗？"
            :disabled="asking || !canAsk"
            @enter="sendAsk"
          />
          <t-button
            theme="primary"
            size="small"
            :loading="asking"
            :disabled="!askQuestion.trim() || !canAsk"
            @click="sendAsk"
          >
            发送
          </t-button>
        </div>
      </template>
    </t-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { agentsApi } from '@/api';
import { formatAiText } from '@/utils/aiText';
import type { AgentStage, Citation, ConflictPoint, FollowupAskResult } from '@shared/types/agent';

type RunRow = {
  id: number;
  stock_code: string;
  stock_name: string;
  status: string;
  mode: string;
  created_at: string;
  finished_at?: string;
  has_report?: number;
};

type RunDetail = RunRow & {
  stages: string | AgentStage[];
  final_report?: string;
};

const loading = ref(false);
const rows = ref<RunRow[]>([]);
const drawer = ref(false);
const detail = ref<RunDetail | null>(null);
const askQuestion = ref('');
const asking = ref(false);
const askMessages = ref<{ role: 'user' | 'assistant'; content: string }[]>([]);

const columns = [
  { colKey: 'id', title: 'ID', width: 70 },
  { colKey: 'stock', title: '标的', cell: 'stock' },
  { colKey: 'mode', title: '模式', cell: 'mode', width: 120 },
  { colKey: 'status', title: '状态', cell: 'status', width: 110 },
  {
    colKey: 'created_at',
    title: '开始时间',
    width: 180,
    cell: (_h: unknown, { row }: { row: RunRow }) =>
      row.created_at ? new Date(row.created_at).toLocaleString('zh-CN') : '-',
  },
  { colKey: 'op', title: '操作', cell: 'op', width: 110 },
];

const parsedStages = computed<AgentStage[]>(() => {
  if (!detail.value?.stages) return [];
  if (typeof detail.value.stages === 'string') {
    try {
      return JSON.parse(detail.value.stages) as AgentStage[];
    } catch {
      return [];
    }
  }
  return detail.value.stages;
});

const detailCitations = computed<Citation[]>(() => {
  const secretary = parsedStages.value.find((s) => s.role === 'invest_secretary');
  const sentiment = parsedStages.value.find((s) => s.role === 'sentiment_analyst');
  return (
    (secretary?.data?.citations as Citation[] | undefined) ||
    (sentiment?.data?.citations as Citation[] | undefined) ||
    []
  );
});

const detailConflicts = computed<ConflictPoint[]>(() => {
  const secretary = parsedStages.value.find((s) => s.role === 'invest_secretary');
  return (secretary?.data?.conflicts as ConflictPoint[] | undefined) || [];
});

const canAsk = computed(() => {
  if (!detail.value) return false;
  const status = String(detail.value.status || '').toLowerCase();
  if (status === 'completed') return true;
  return Boolean(detail.value.final_report?.trim());
});

const askDisabledReason = computed(() => {
  if (!detail.value) return '';
  const status = String(detail.value.status || '').toLowerCase();
  if (status === 'running') return '该次分析仍显示进行中（可能是旧数据未落完成态）。可刷新列表；若仍不可追问，请重新跑一次 AI 分析。';
  if (status === 'failed') return '该次分析失败，请回个股页重新分析后再追问。';
  return '暂无完整报告，无法追问。';
});

function modeTheme(mode: string) {
  if (mode === 'llm') return 'success';
  if (mode === 'llm_fallback') return 'warning';
  return 'default';
}

function statusTheme(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return 'success';
  if (s === 'failed') return 'danger';
  return 'warning';
}

function statusLabel(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return '已完成';
  if (s === 'failed') return '失败';
  if (s === 'running') return '进行中';
  return status || '-';
}

async function load() {
  loading.value = true;
  try {
    const res = await agentsApi.runs();
    const data = res.data;
    rows.value = Array.isArray(data) ? (data as RunRow[]) : [];
  } finally {
    loading.value = false;
  }
}

async function openDetail(id: number) {
  const res = await agentsApi.runDetail(id);
  detail.value = res.data as RunDetail;
  askMessages.value = [];
  askQuestion.value = '';
  drawer.value = true;
}

async function sendAsk() {
  const q = askQuestion.value.trim();
  if (!q || !detail.value || asking.value || !canAsk.value) return;
  asking.value = true;
  askMessages.value.push({ role: 'user', content: q });
  askQuestion.value = '';
  try {
    const res = await agentsApi.ask(detail.value.id, q);
    const data = res.data as FollowupAskResult;
    askMessages.value.push({
      role: 'assistant',
      content: data?.answer || '（未返回回答内容）',
    });
  } catch (err) {
    console.error(err);
    MessagePlugin.error('追问失败，请稍后重试');
    askMessages.value.push({ role: 'assistant', content: '追问失败，请稍后重试。' });
  } finally {
    asking.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.link {
  color: #0052d9;
  cursor: pointer;
}
.count-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}
.stage {
  margin-bottom: 12px;
}
.stage h4 {
  margin: 0 0 6px;
}
.stage p {
  margin: 0;
  color: #555;
  line-height: 1.6;
}
.cite-line {
  margin-bottom: 10px;
  font-size: 13px;
  line-height: 1.5;
}
.muted {
  color: #888;
  font-size: 12px;
}
.report {
  white-space: normal;
  background: #f7f8fa;
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.7;
  max-height: 240px;
  overflow: auto;
}
.ask-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  max-height: 220px;
  overflow: auto;
  min-height: 48px;
}
.ask-msg {
  display: flex;
}
.ask-msg.user {
  justify-content: flex-end;
}
.ask-msg.assistant {
  justify-content: flex-start;
}
.ask-bubble {
  max-width: 90%;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.ask-msg.user .ask-bubble {
  background: #0052d9;
  color: #fff;
}
.ask-msg.assistant .ask-bubble {
  background: #f3f3f3;
}
.ask-input-row {
  display: flex;
  gap: 8px;
  position: sticky;
  bottom: 0;
  background: #fff;
  padding-top: 8px;
}
</style>
