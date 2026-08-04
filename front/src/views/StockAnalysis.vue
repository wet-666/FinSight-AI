<template>
  <div class="page-container">
    <LegalDisclaimer />
    <t-card :bordered="false">
      <template #title>
        <div class="stock-header">
          <span>{{ stockName }} ({{ stockCode }})</span>
          <span v-if="quote" :class="quote.change >= 0 ? 'text-up' : 'text-down'" class="price">
            {{ quote.price?.toFixed(2) }}
            {{ quote.changePercent >= 0 ? '+' : '' }}{{ quote.changePercent?.toFixed(2) }}%
          </span>
          <t-tag v-if="dataSource" size="small" variant="light">数据源: {{ sourceLabel }}</t-tag>
        </div>
      </template>
      <t-alert v-if="mountError" theme="error" :message="mountError" style="margin-bottom: 12px" />
      <div class="toolbar">
        <t-checkbox v-model="exportReport">导出报告</t-checkbox>
        <t-button theme="primary" :loading="analyzing" @click="runAnalysis">
          <t-icon name="chat" /> AI 分析师（RAG · 三 Agent · 流式）
        </t-button>
        <t-button
          variant="outline"
          @click="
            $router.push({
              path: '/notes',
              query: { stockCode, stockName },
            })
          "
        >
          写笔记
        </t-button>
        <t-button
          v-if="report"
          variant="outline"
          theme="primary"
          @click="saveReportToNotes"
        >
          保存分析到笔记
        </t-button>
        <t-button variant="outline" @click="$router.push('/agent-runs')">历史</t-button>
      </div>
      <div ref="klineRef" class="chart-box" />
      <div ref="sentimentRef" class="chart-box sentiment-chart" />
    </t-card>

    <t-card v-if="stages.length || analyzing" title="多智能体编排时间线" :bordered="false" style="margin-top: 16px">
      <div class="tag-row">
        <t-tag v-if="agentMode" size="small" :theme="modeTheme" variant="light">
          模式: {{ modeLabel }}
        </t-tag>
        <t-tag v-if="retrievalMode" size="small" theme="primary" variant="light">
          检索: {{ retrievalMode === 'embedding' ? 'Embedding RAG' : '关键词降级' }}
        </t-tag>
      </div>
      <t-timeline mode="same">
        <t-timeline-item
          v-for="stage in stages"
          :key="stage.role"
          :label="stage.title"
          :dot-color="
            stage.status === 'done' ? 'success' : stage.status === 'running' ? 'primary' : 'gray'
          "
        >
          <div class="stage-card" :class="{ 'is-running': stage.status === 'running' }">
            <p class="stage-status">状态：{{ statusLabel(stage.status) }}</p>
            <p class="stage-summary">{{ stage.summary || (stage.status === 'running' ? '分析中…' : '等待中') }}</p>
            <ul v-if="stage.role === 'sentiment_analyst' && stage.data?.highlights">
              <li v-for="(item, idx) in stage.data.highlights.slice(0, 3)" :key="idx">
                {{ item.title }}（{{ item.score }}）
              </li>
            </ul>
            <p v-if="stage.role === 'quant_researcher' && stage.data?.priceTrend" class="meta">
              趋势 {{ stage.data.priceTrend }} · {{ stage.data.priceVsMa20 }} ·
              支撑 {{ stage.data.keyLevels?.support }} / 压力 {{ stage.data.keyLevels?.resistance }}
            </p>
          </div>
        </t-timeline-item>
      </t-timeline>
    </t-card>

    <t-card
      v-if="citations.length"
      title="检索证据 / 引用"
      :bordered="false"
      style="margin-top: 16px"
    >
      <p class="hint">点击卡片可在报告区高亮对应引用。</p>
      <div class="cite-grid">
        <button
          v-for="c in citations"
          :key="c.id"
          type="button"
          class="cite-card"
          :class="{ active: activeCitationId === c.id }"
          @click="activeCitationId = activeCitationId === c.id ? '' : c.id"
        >
          <div class="cite-head">
            <span class="cite-id">{{ c.id }}</span>
            <t-tag size="small" variant="light">相关度 {{ c.score }}</t-tag>
          </div>
          <div class="cite-title">{{ c.title }}</div>
          <div class="cite-snippet">{{ c.snippet }}</div>
        </button>
      </div>
    </t-card>

    <t-card v-if="report" title="投资秘书 · 综合备忘录" :bordered="false" style="margin-top: 16px">
      <div v-if="conflicts.length" class="conflict-block">
        <t-alert
          v-for="(c, i) in conflicts"
          :key="i"
          :theme="conflictTheme(c.severity)"
          :message="`[${c.type}] ${c.summary}`"
          style="margin-bottom: 8px"
        />
      </div>
      <p v-if="evidenceSummary" class="evidence-summary">{{ evidenceSummary }}</p>
      <div
        class="report-content"
        :class="{ 'has-highlight': !!activeCitationId }"
        v-html="highlightedReport"
      />
      <t-button
        v-if="reportId"
        style="margin-top: 12px"
        theme="default"
        @click="$router.push('/reports')"
      >
        前往报告中心下载
      </t-button>
    </t-card>

    <t-card
      v-if="runId"
      title="基于本次分析追问"
      :bordered="false"
      style="margin-top: 16px"
    >
      <p class="hint">会再次检索证据，并结合当次 Agent 结果回答（runId={{ runId }}）。</p>
      <div class="ask-list">
        <div v-for="(m, i) in askMessages" :key="i" class="ask-msg" :class="m.role">
          <div class="ask-bubble">{{ m.content }}</div>
          <div v-if="m.citations?.length" class="ask-cites">
            <t-tag
              v-for="c in m.citations"
              :key="c.id"
              size="small"
              variant="outline"
              class="ask-chip"
              @click="activeCitationId = c.id"
            >
              {{ c.id }}
            </t-tag>
          </div>
        </div>
      </div>
      <div class="ask-input-row">
        <t-input
          v-model="askQuestion"
          placeholder="例如：支撑位怎么来的？和舆情是否冲突？"
          :disabled="asking"
          @enter="sendAsk"
        />
        <t-button theme="primary" :loading="asking" :disabled="!askQuestion.trim()" @click="sendAsk">
          追问
        </t-button>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'StockAnalysis' });
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { MessagePlugin } from 'tdesign-vue-next';
import LegalDisclaimer from '@/components/LegalDisclaimer.vue';
import { agentsApi, stockApi } from '@/api';
import { formatAiText } from '@/utils/aiText';
import type { QuoteData, KLineItem } from '@shared/types/dashboard';
import type { AgentStage, Citation, ConflictPoint, FollowupAskResult } from '@shared/types/agent';

const route = useRoute();
const router = useRouter();
const stockCode = route.params.code as string;
const stockName = ref(stockCode);
const quote = ref<Pick<QuoteData, 'name' | 'price' | 'change' | 'changePercent'> | null>(null);
const report = ref('');
const analyzing = ref(false);
const exportReport = ref(true);
const stages = ref<AgentStage[]>([]);
const agentMode = ref('');
const retrievalMode = ref('');
const reportId = ref<number | undefined>();
const runId = ref<number | undefined>();
const dataSource = ref('');
const mountError = ref('');
const citations = ref<Citation[]>([]);
const conflicts = ref<ConflictPoint[]>([]);
const evidenceSummary = ref('');
const activeCitationId = ref('');
const askQuestion = ref('');
const asking = ref(false);
const askMessages = ref<
  { role: 'user' | 'assistant'; content: string; citations?: Citation[] }[]
>([]);

const sourceLabel = computed(() => {
  const map: Record<string, string> = {
    database: '数据库',
    eastmoney: '东方财富',
    seed: '种子数据（演示）',
  };
  return map[dataSource.value] || dataSource.value;
});

const modeLabel = computed(() => {
  if (agentMode.value === 'llm') return 'LLM 增强';
  if (agentMode.value === 'llm_fallback') return 'LLM 降级（模板兜底）';
  if (agentMode.value === 'demo') return 'Demo（无 Key）';
  return agentMode.value;
});

const modeTheme = computed(() => {
  if (agentMode.value === 'llm') return 'success';
  if (agentMode.value === 'llm_fallback') return 'warning';
  return 'default';
});

const highlightedReport = computed(() => {
  let html = formatAiText(report.value || '');
  if (!activeCitationId.value) return html;
  const id = activeCitationId.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(
    new RegExp(id, 'g'),
    `<mark class="cite-mark">${activeCitationId.value}</mark>`
  );
});

function conflictTheme(severity: ConflictPoint['severity']) {
  if (severity === 'high') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}

function statusLabel(s: string) {
  return ({ pending: '等待', running: '运行中', done: '完成', failed: '失败' } as Record<string, string>)[
    s
  ] || s;
}

function extractEvidenceFromStages(nextStages: AgentStage[]) {
  const sentiment = nextStages.find((s) => s.role === 'sentiment_analyst');
  const secretary = nextStages.find((s) => s.role === 'invest_secretary');
  const fromSecretary = (secretary?.data?.citations as Citation[] | undefined) || [];
  const fromSentiment = (sentiment?.data?.citations as Citation[] | undefined) || [];
  citations.value = fromSecretary.length ? fromSecretary : fromSentiment;
  conflicts.value = (secretary?.data?.conflicts as ConflictPoint[] | undefined) || [];
  evidenceSummary.value = String(secretary?.data?.evidenceSummary || '');
  if (sentiment?.data?.retrievalMode) {
    retrievalMode.value = String(sentiment.data.retrievalMode);
  }
}

const klineRef = ref<HTMLElement>();
const sentimentRef = ref<HTMLElement>();
let klineChart: echarts.ECharts | null = null;
let sentimentChart: echarts.ECharts | null = null;

const CHART_FONT = 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif';

function axisDate(date: string) {
  return date.length >= 10 ? date.slice(5, 10) : date;
}

function renderKLine(kline: KLineItem[]) {
  if (!klineRef.value) return;
  if (!klineChart) klineChart = echarts.init(klineRef.value);
  const dates = kline.map((k) => axisDate(k.date));
  klineChart.setOption({
    textStyle: { fontFamily: CHART_FONT },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['K线', '成交量'], top: 4, left: 'center' },
    grid: [
      { left: 72, right: 28, top: 44, height: '52%', containLabel: false },
      { left: 72, right: 28, top: '72%', height: '18%', containLabel: false },
    ],
    xAxis: [
      { type: 'category', data: dates, gridIndex: 0, axisLabel: { hideOverlap: true } },
      { type: 'category', data: dates, gridIndex: 1, axisLabel: { hideOverlap: true } },
    ],
    yAxis: [
      { scale: true, gridIndex: 0, splitNumber: 4 },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: {
          formatter: (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}亿` : v >= 1e4 ? `${(v / 1e4).toFixed(0)}万` : String(v)),
        },
      },
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: [0, 1] }],
    series: [
      {
        name: 'K线',
        type: 'candlestick',
        data: kline.map((k) => [k.open, k.close, k.low, k.high]),
        xAxisIndex: 0,
        yAxisIndex: 0,
        itemStyle: {
          color: '#e34d59',
          color0: '#00a870',
          borderColor: '#e34d59',
          borderColor0: '#00a870',
        },
      },
      {
        name: '成交量',
        type: 'bar',
        data: kline.map((k) => k.volume),
        xAxisIndex: 1,
        yAxisIndex: 1,
        itemStyle: { color: '#bbb' },
      },
    ],
  }, true);
}

function renderSentiment(sentiment: { date: string; score: number }[], kline: KLineItem[]) {
  if (!sentimentRef.value) return;
  if (!sentimentChart) sentimentChart = echarts.init(sentimentRef.value);
  const dates = kline.map((k) => axisDate(k.date));
  const scoreMap = new Map(
    sentiment.map((s) => [s.date.length >= 10 ? s.date.slice(0, 10) : s.date, s.score])
  );
  const scores = kline.map((k) => {
    const key = k.date.length >= 10 ? k.date.slice(0, 10) : k.date;
    return scoreMap.get(key) ?? 0;
  });
  sentimentChart.setOption({
    textStyle: { fontFamily: CHART_FONT },
    title: { text: '情绪叠加图', left: 0, top: 0, textStyle: { fontSize: 14, fontFamily: CHART_FONT } },
    tooltip: { trigger: 'axis' },
    grid: { left: 72, right: 28, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: dates, axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', min: -1, max: 1 },
    series: [
      {
        type: 'bar',
        data: scores.map((s) => ({
          value: s,
          itemStyle: { color: s >= 0 ? '#00a870' : '#e34d59' },
        })),
      },
    ],
  }, true);
}

function ensureStageSlots() {
  if (stages.value.length) return;
  stages.value = [
    { role: 'sentiment_analyst', title: '舆情分析师', status: 'pending', summary: '', data: {} },
    { role: 'quant_researcher', title: '量化研究员', status: 'pending', summary: '', data: {} },
    { role: 'invest_secretary', title: '投资秘书', status: 'pending', summary: '', data: {} },
  ];
}

async function runAnalysis() {
  analyzing.value = true;
  report.value = '';
  runId.value = undefined;
  citations.value = [];
  conflicts.value = [];
  evidenceSummary.value = '';
  activeCitationId.value = '';
  askMessages.value = [];
  ensureStageSlots();
  try {
    const token = localStorage.getItem('token') || '';
    const res = await fetch(`/api/stock/${stockCode}/analyze-stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stockName: stockName.value, exportReport: exportReport.value }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const payload = JSON.parse(line.slice(6)) as {
          type: string;
          mode?: string;
          retrievalMode?: string;
          stage?: AgentStage;
          index?: number;
          result?: {
            finalReport: string;
            stages: AgentStage[];
            mode: string;
            retrievalMode?: string;
            runId?: number;
            structured?: {
              secretary?: {
                citations?: Citation[];
                conflicts?: ConflictPoint[];
                evidenceSummary?: string;
              };
            };
          };
          reportId?: number;
          message?: string;
        };

        if (payload.type === 'start') {
          if (payload.mode) agentMode.value = payload.mode;
          if (payload.retrievalMode) retrievalMode.value = payload.retrievalMode;
        }
        if (payload.type === 'stage' && payload.stage && payload.index != null) {
          const next = [...stages.value];
          next[payload.index] = payload.stage;
          stages.value = next;
          if (payload.stage.role === 'sentiment_analyst') {
            extractEvidenceFromStages(next);
          }
          if (payload.stage.role === 'invest_secretary') {
            extractEvidenceFromStages(next);
          }
        }
        if (payload.type === 'done' && payload.result) {
          report.value = payload.result.finalReport;
          stages.value = payload.result.stages;
          agentMode.value = payload.result.mode;
          if (payload.result.retrievalMode) retrievalMode.value = payload.result.retrievalMode;
          if (payload.result.runId) runId.value = payload.result.runId;
          extractEvidenceFromStages(payload.result.stages);
          const sec = payload.result.structured?.secretary;
          if (sec?.citations?.length) citations.value = sec.citations;
          if (sec?.conflicts) conflicts.value = sec.conflicts;
          if (sec?.evidenceSummary) evidenceSummary.value = sec.evidenceSummary;
        }
        if (payload.type === 'report') {
          reportId.value = payload.reportId;
          if (payload.mode) agentMode.value = payload.mode;
        }
        if (payload.type === 'error') {
          throw new Error(payload.message || '分析失败');
        }
      }
    }

    MessagePlugin.success(
      agentMode.value === 'llm'
        ? '三 Agent + RAG 分析完成（LLM）'
        : agentMode.value === 'llm_fallback'
          ? '分析完成（模型降级为模板）'
          : 'Demo Agent 分析完成（关键词检索）'
    );
  } catch (err) {
    console.error(err);
    MessagePlugin.error('分析失败，可检查顶部 LLM 状态或稍后重试');
  } finally {
    analyzing.value = false;
  }
}

function saveReportToNotes() {
  if (!report.value) {
    MessagePlugin.warning('请先完成一次 AI 分析');
    return;
  }
  sessionStorage.setItem(
    'finsight:note-draft',
    JSON.stringify({
      stockCode,
      stockName: stockName.value,
      title: `${stockName.value} AI 分析笔记`,
      seed: report.value,
    })
  );
  router.push({
    path: '/notes',
    query: { stockCode, stockName: stockName.value },
  });
}

async function sendAsk() {
  const q = askQuestion.value.trim();
  if (!q || !runId.value || asking.value) return;
  asking.value = true;
  askMessages.value.push({ role: 'user', content: q });
  askQuestion.value = '';
  try {
    const res = await agentsApi.ask(runId.value, q);
    const data = res.data as FollowupAskResult;
    askMessages.value.push({
      role: 'assistant',
      content: data.answer,
      citations: data.citations,
    });
    if (data.retrievalMode) retrievalMode.value = data.retrievalMode;
  } catch (err) {
    console.error(err);
    MessagePlugin.error('追问失败');
    askMessages.value.push({
      role: 'assistant',
      content: '追问失败，请稍后重试。',
    });
  } finally {
    asking.value = false;
  }
}

onMounted(async () => {
  try {
    const [detailRes, chartRes] = await Promise.all([
      stockApi.getDetail(stockCode),
      stockApi.getChart(stockCode, 60),
    ]);
    quote.value = detailRes.data as Pick<QuoteData, 'name' | 'price' | 'change' | 'changePercent'>;
    stockName.value = quote.value?.name || stockCode;
    const chartData = chartRes.data as {
      kline: KLineItem[];
      sentiment: { date: string; score: number }[];
      source?: string;
    };
    dataSource.value = chartData.source || '';
    renderKLine(chartData.kline);
    renderSentiment(chartData.sentiment, chartData.kline);
    await nextTick();
    klineChart?.resize();
    sentimentChart?.resize();
  } catch {
    mountError.value = '个股数据加载失败，请确认代码正确且后端可用';
  }
  window.addEventListener('resize', () => {
    klineChart?.resize();
    sentimentChart?.resize();
  });
});

onUnmounted(() => {
  klineChart?.dispose();
  sentimentChart?.dispose();
});
</script>

<style scoped>
.stock-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.price {
  font-size: 20px;
  font-weight: 600;
}
.tag-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.report-content {
  line-height: 1.8;
  color: #333;
}
.report-content :deep(.cite-mark) {
  background: #fff3cd;
  color: #8a6d3b;
  padding: 0 4px;
  border-radius: 3px;
}
.evidence-summary {
  color: #555;
  margin: 0 0 12px;
  font-size: 13px;
}
.conflict-block {
  margin-bottom: 12px;
}
.stage-card {
  background: #f7f8fa;
  padding: 10px 12px;
  border-radius: 6px;
}
.stage-card.is-running {
  border-left: 3px solid #0052d9;
}
.stage-status {
  margin: 0 0 4px;
  font-size: 12px;
  color: #888;
}
.stage-summary {
  margin: 0 0 6px;
  line-height: 1.6;
}
.meta {
  margin: 0;
  color: #666;
  font-size: 13px;
}
.chart-box {
  width: 100%;
  height: 420px;
}
.sentiment-chart {
  height: 220px;
  margin-top: 8px;
}
.hint {
  margin: 0 0 12px;
  color: #888;
  font-size: 13px;
}
.cite-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.cite-card {
  text-align: left;
  border: 1px solid #e7e7e7;
  background: #fff;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cite-card:hover,
.cite-card.active {
  border-color: #0052d9;
  box-shadow: 0 0 0 2px rgba(0, 82, 217, 0.08);
}
.cite-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.cite-id {
  font-size: 12px;
  color: #0052d9;
  font-family: ui-monospace, monospace;
}
.cite-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
  line-height: 1.4;
}
.cite-snippet {
  font-size: 12px;
  color: #666;
  line-height: 1.5;
}
.ask-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
  max-height: 320px;
  overflow: auto;
}
.ask-msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ask-msg.user {
  align-items: flex-end;
}
.ask-msg.assistant {
  align-items: flex-start;
}
.ask-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 10px;
  line-height: 1.6;
  white-space: pre-wrap;
  font-size: 13px;
}
.ask-msg.user .ask-bubble {
  background: #0052d9;
  color: #fff;
}
.ask-msg.assistant .ask-bubble {
  background: #f3f3f3;
  color: #333;
}
.ask-cites {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ask-chip {
  cursor: pointer;
}
.ask-input-row {
  display: flex;
  gap: 8px;
}
</style>
