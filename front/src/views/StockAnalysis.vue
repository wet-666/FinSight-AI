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
      <template #actions>
        <t-checkbox v-model="exportReport">导出报告</t-checkbox>
        <t-button theme="primary" :loading="analyzing" @click="runAnalysis">
          <t-icon name="chat" /> AI 分析师（三 Agent）
        </t-button>
        <t-button variant="outline" @click="$router.push('/notes')">写笔记</t-button>
      </template>

      <div ref="klineRef" class="chart-box" />
      <div ref="sentimentRef" class="chart-box" style="height: 200px; margin-top: 8px" />
    </t-card>

    <t-card v-if="stages.length" title="多智能体编排时间线" :bordered="false" style="margin-top: 16px">
      <t-tag v-if="agentMode" size="small" theme="primary" variant="light" style="margin-bottom: 12px">
        模式: {{ agentMode === 'llm' ? 'LLM' : 'Demo（无 Key 可演示）' }}
      </t-tag>
      <t-timeline mode="same">
        <t-timeline-item
          v-for="stage in stages"
          :key="stage.role"
          :label="stage.title"
          :dot-color="stage.status === 'done' ? 'success' : 'primary'"
        >
          <div class="stage-card">
            <p class="stage-summary">{{ stage.summary }}</p>
            <ul v-if="stage.role === 'sentiment_analyst' && stage.data?.highlights">
              <li v-for="(h, idx) in stage.data.highlights.slice(0, 3)" :key="idx">
                {{ h.title }}（{{ h.score }}）
              </li>
            </ul>
            <p v-if="stage.role === 'quant_researcher' && stage.data" class="meta">
              趋势 {{ stage.data.priceTrend }} · {{ stage.data.priceVsMa20 }} ·
              支撑 {{ stage.data.keyLevels?.support }} / 压力 {{ stage.data.keyLevels?.resistance }}
            </p>
          </div>
        </t-timeline-item>
      </t-timeline>
    </t-card>

    <t-card v-if="report" title="投资秘书 · 综合备忘录" :bordered="false" style="margin-top: 16px">
      <div class="report-content">{{ report }}</div>
      <t-button
        v-if="reportId"
        style="margin-top: 12px"
        theme="default"
        @click="$router.push('/reports')"
      >
        前往报告中心下载
      </t-button>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import * as echarts from 'echarts';
import { MessagePlugin } from 'tdesign-vue-next';
import LegalDisclaimer from '@/components/LegalDisclaimer.vue';
import { stockApi } from '@/api';
import type { QuoteData, KLineItem } from '@shared/types/dashboard';
import type { AgentStage } from '@shared/types/agent';

const route = useRoute();
const stockCode = route.params.code as string;
const stockName = ref(stockCode);
const quote = ref<Pick<QuoteData, 'name' | 'price' | 'change' | 'changePercent'> | null>(null);
const report = ref('');
const analyzing = ref(false);
const exportReport = ref(true);
const stages = ref<AgentStage[]>([]);
const agentMode = ref('');
const reportId = ref<number | undefined>();
const dataSource = ref('');

const sourceLabel = computed(() => {
  const map: Record<string, string> = {
    database: '数据库',
    eastmoney: '东方财富',
    seed: '种子数据',
  };
  return map[dataSource.value] || dataSource.value;
});

const klineRef = ref<HTMLElement>();
const sentimentRef = ref<HTMLElement>();
let klineChart: echarts.ECharts | null = null;
let sentimentChart: echarts.ECharts | null = null;

function renderKLine(kline: KLineItem[]) {
  if (!klineRef.value) return;
  if (!klineChart) klineChart = echarts.init(klineRef.value);
  klineChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['K线', '成交量'] },
    grid: [
      { left: 60, right: 20, top: 40, height: '55%' },
      { left: 60, right: 20, top: '72%', height: '18%' },
    ],
    xAxis: [
      { type: 'category', data: kline.map((k) => k.date.slice(5)), gridIndex: 0 },
      { type: 'category', data: kline.map((k) => k.date.slice(5)), gridIndex: 1 },
    ],
    yAxis: [
      { scale: true, gridIndex: 0 },
      { scale: true, gridIndex: 1, splitNumber: 2 },
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
  });
}

function renderSentiment(
  sentiment: { date: string; score: number }[],
  kline: KLineItem[]
) {
  if (!sentimentRef.value) return;
  if (!sentimentChart) sentimentChart = echarts.init(sentimentRef.value);
  const dates = kline.map((k) => k.date.slice(5));
  const scoreMap = new Map(sentiment.map((s) => [s.date, s.score]));
  const scores = kline.map((k) => scoreMap.get(k.date) ?? 0);
  sentimentChart.setOption({
    title: { text: '情绪叠加图', left: 0, textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: dates },
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
  });
}

async function runAnalysis() {
  analyzing.value = true;
  try {
    const res = await stockApi.analyze(stockCode, stockName.value, exportReport.value);
    const data = res.data as {
      report: string;
      stages: AgentStage[];
      mode: string;
      reportId?: number;
    };
    report.value = data.report;
    stages.value = data.stages || [];
    agentMode.value = data.mode;
    reportId.value = data.reportId;
    MessagePlugin.success(data.mode === 'llm' ? '三 Agent 分析完成' : 'Demo Agent 分析完成');
  } catch {
    MessagePlugin.error('分析失败');
  } finally {
    analyzing.value = false;
  }
}

onMounted(async () => {
  const [detailRes, chartRes] = await Promise.all([
    stockApi.getDetail(stockCode),
    stockApi.getChart(stockCode, 60),
  ]);
  quote.value = detailRes.data as Pick<QuoteData, 'name' | 'price' | 'change' | 'changePercent'>;
  stockName.value = quote.value.name;
  const chartData = chartRes.data as {
    kline: KLineItem[];
    sentiment: { date: string; score: number }[];
    source?: string;
  };
  dataSource.value = chartData.source || '';
  renderKLine(chartData.kline);
  renderSentiment(chartData.sentiment, chartData.kline);
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
.price {
  font-size: 20px;
  font-weight: 600;
}
.report-content {
  line-height: 1.8;
  white-space: pre-wrap;
  color: #333;
}
.stage-card {
  background: #f7f8fa;
  padding: 10px 12px;
  border-radius: 6px;
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
  height: 420px;
}
</style>
