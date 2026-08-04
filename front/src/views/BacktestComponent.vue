<template>
  <div class="page-container">
    <LegalDisclaimer />
    <t-row :gutter="16">
      <t-col :span="4">
        <t-card title="策略配置" :bordered="false">
          <t-alert
            v-if="riskHint"
            theme="info"
            :close="false"
            style="margin-bottom: 12px"
            :message="riskHint"
          />
          <t-form :data="form" label-width="120px">
            <t-form-item label="选择股票">
              <StockSuggestInput
                v-model:stock-code="form.stockCode"
                v-model:stock-name="formStockName"
                :show-hot="true"
                :hot-limit="6"
                code-width="100%"
                name-width="100%"
              />
            </t-form-item>
            <t-form-item label="情绪阈值">
              <div class="threshold-row">
                <t-slider v-model="form.sentimentThreshold" :min="-1" :max="1" :step="0.1" />
                <span class="hint">当前: {{ form.sentimentThreshold }}</span>
              </div>
            </t-form-item>
            <t-form-item label="使用MA20">
              <t-switch v-model="form.useMa20" />
            </t-form-item>
            <t-form-item label="初始资金">
              <t-input-number v-model="form.initialCapital" :min="10000" :step="10000" />
            </t-form-item>
            <t-form-item label="导出报告">
              <t-switch v-model="form.exportReport" />
            </t-form-item>
            <t-form-item>
              <t-space direction="vertical" style="width: 100%">
                <t-button theme="primary" block :loading="running" @click="runBacktest">
                  开始回测
                </t-button>
                <t-button variant="outline" block @click="applyRecommended">
                  一键推荐参数（更易出成交）
                </t-button>
              </t-space>
            </t-form-item>
          </t-form>

          <t-divider />
          <div class="strategy-desc">
            <h4>策略说明</h4>
            <p>
              当情绪 ≥ {{ form.sentimentThreshold }}
              <span v-if="form.useMa20">且股价低于20日均线</span>
              时买入；情绪转弱或价格突破MA20上方5%时卖出。基准为沪深300ETF（510300）买入持有。
              高价股（如茅台）请把初始资金调到 ≥ 价格×100，否则买不起 1 手会显示 0 成交。
            </p>
          </div>
        </t-card>
      </t-col>

      <t-col :span="8">
        <t-card title="回测结果" :bordered="false">
          <t-empty v-if="!result && !running" description="点击左侧开始回测，默认参数阈值较低，便于样例跑通" />

          <t-alert
            v-if="result?.diagnostics?.reasonIfEmpty"
            theme="warning"
            :message="result.diagnostics.reasonIfEmpty"
            style="margin-bottom: 12px"
          >
            <template #operation>
              <t-button
                size="small"
                variant="text"
                @click="applySuggested"
              >
                应用建议阈值 {{ result.diagnostics.suggestedThreshold }}
              </t-button>
            </template>
          </t-alert>

          <t-row v-if="result" :gutter="12" class="stats-row">
            <t-col :span="3">
              <t-statistic title="总收益率" :value="(result.totalReturn * 100).toFixed(2)" suffix="%" />
            </t-col>
            <t-col :span="3">
              <t-statistic title="超额收益" :value="(result.excessReturn * 100).toFixed(2)" suffix="%" />
            </t-col>
            <t-col :span="3">
              <t-statistic title="最大回撤" :value="(result.maxDrawdown * 100).toFixed(2)" suffix="%" />
            </t-col>
            <t-col :span="3">
              <t-statistic title="夏普比率" :value="result.sharpeRatio" />
            </t-col>
          </t-row>
          <t-row v-if="result" :gutter="12" class="stats-row">
            <t-col :span="3">
              <t-statistic title="胜率" :value="(result.winRate * 100).toFixed(1)" suffix="%" />
            </t-col>
            <t-col :span="3">
              <t-statistic title="交易次数" :value="result.tradeCount" />
            </t-col>
            <t-col :span="3">
              <t-statistic title="换手" :value="result.turnover" />
            </t-col>
            <t-col :span="3">
              <t-statistic title="数据源" :value="result.dataSource || '-'" />
            </t-col>
          </t-row>

          <div v-if="result?.diagnostics" class="diag">
            诊断：分析 {{ result.diagnostics.daysAnalyzed }} 天 · 情绪达标
            {{ result.diagnostics.daysSentimentOk }} 天 · 买入信号
            {{ result.diagnostics.daysBuySignal }} 天
          </div>

          <div ref="equityRef" class="chart-box" />

          <t-card v-if="result?.aiSummary" title="AI 策略点评" :bordered="true" style="margin-top: 16px">
            <p class="ai-summary" v-html="formatAiText(result.aiSummary)" />
            <t-button
              v-if="result.reportId"
              size="small"
              style="margin-top: 8px"
              @click="$router.push('/reports')"
            >
              查看导出报告
            </t-button>
          </t-card>

          <t-table
            v-if="result?.trades?.length"
            :data="result.trades"
            :columns="tradeColumns"
            size="small"
            style="margin-top: 16px"
          />
        </t-card>
      </t-col>
    </t-row>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Backtest' });

import { ref, reactive, onMounted, onUnmounted, onActivated, watch } from 'vue';
import * as echarts from 'echarts';
import { MessagePlugin } from 'tdesign-vue-next';
import LegalDisclaimer from '@/components/LegalDisclaimer.vue';
import StockSuggestInput from '@/components/StockSuggestInput.vue';
import { backtestApi, riskApi } from '@/api';
import { useAiSessionStore } from '@/stores/aiSessionStore';
import { formatAiText } from '@/utils/aiText';
import type { BacktestRunResponse } from '@shared/types/backtest';
import type { RiskProfile } from '@shared/types/risk';

const session = useAiSessionStore();

const form = reactive({
  stockCode: session.backtestForm.stockCode,
  sentimentThreshold: session.backtestForm.sentimentThreshold,
  useMa20: session.backtestForm.useMa20,
  initialCapital: session.backtestForm.initialCapital,
  exportReport: session.backtestForm.exportReport,
});
const formStockName = ref(session.backtestForm.stockName);
const riskHint = ref('');

const running = ref(false);
const result = ref<BacktestRunResponse | null>(session.backtestResult);
const equityRef = ref<HTMLElement>();
let chart: echarts.ECharts | null = null;

const tradeColumns = [
  { colKey: 'date', title: '日期', width: 110 },
  {
    colKey: 'type',
    title: '类型',
    width: 70,
    cell: (_h: unknown, { row }: { row: { type: string } }) =>
      row.type === 'buy' ? '买入' : '卖出',
  },
  { colKey: 'price', title: '价格', width: 80 },
  { colKey: 'shares', title: '数量', width: 80 },
  { colKey: 'reason', title: '原因' },
];

function applyRecommended() {
  form.sentimentThreshold = 0.2;
  form.useMa20 = false;
  MessagePlugin.info('已应用推荐参数：阈值 0.2，关闭 MA20');
}

function applySuggested() {
  if (result.value?.diagnostics?.suggestedThreshold != null) {
    form.sentimentThreshold = result.value.diagnostics.suggestedThreshold;
    form.useMa20 = false;
    MessagePlugin.success(`已应用建议阈值 ${form.sentimentThreshold}`);
  }
}

const CHART_FONT = 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif';

function renderEquity(
  equity: { date: string; value: number }[],
  bench: { date: string; value: number }[]
) {
  if (!equityRef.value) return;
  if (!chart) chart = echarts.init(equityRef.value);
  const dates = equity.map((c) => (c.date.length >= 10 ? c.date.slice(5, 10) : c.date));
  const benchMap = new Map(
    bench.map((b) => [b.date.length >= 10 ? b.date.slice(0, 10) : b.date, b.value])
  );
  chart.setOption({
    textStyle: { fontFamily: CHART_FONT },
    tooltip: { trigger: 'axis' },
    legend: { data: ['策略净值', '基准(买入持有)'], top: 4, left: 'center' },
    grid: { left: 64, right: 24, top: 48, bottom: 32 },
    xAxis: { type: 'category', data: dates, axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', scale: true },
    series: [
      {
        name: '策略净值',
        type: 'line',
        data: equity.map((c) => c.value),
        smooth: true,
        areaStyle: { color: 'rgba(0, 82, 217, 0.08)' },
        lineStyle: { color: '#0052d9' },
      },
      {
        name: '基准(买入持有)',
        type: 'line',
        data: equity.map((c) => {
          const key = c.date.length >= 10 ? c.date.slice(0, 10) : c.date;
          return benchMap.get(key) ?? null;
        }),
        smooth: true,
        lineStyle: { color: '#00a870', type: 'dashed' },
      },
    ],
  }, true);
}

async function runBacktest() {
  running.value = true;
  try {
    const res = await backtestApi.run(form);
    result.value = res.data as BacktestRunResponse;
    session.setBacktestResult(result.value);
    session.backtestForm = {
      ...form,
      stockName: formStockName.value,
    };
    renderEquity(result.value.equityCurve, result.value.benchmarkCurve || []);
    if (result.value.tradeCount === 0) {
      MessagePlugin.warning('本次无成交，请看上方诊断说明');
    } else {
      MessagePlugin.success(`回测完成，成交 ${result.value.tradeCount} 次`);
    }
  } finally {
    running.value = false;
  }
}

function restoreChart() {
  if (result.value?.equityCurve?.length) {
    renderEquity(result.value.equityCurve, result.value.benchmarkCurve || []);
  }
}

async function hydrateFromHistory() {
  if (result.value) {
    restoreChart();
    return;
  }
  try {
    const res = await backtestApi.history();
    const rows = (res.data as Array<{
      stock_code: string;
      strategy_config: string | BacktestRunResponse;
      result: string | Record<string, unknown>;
      ai_summary: string;
    }>) || [];
    const latest = rows[0];
    if (!latest) return;
    const cfg =
      typeof latest.strategy_config === 'string'
        ? JSON.parse(latest.strategy_config)
        : latest.strategy_config;
    const raw =
      typeof latest.result === 'string' ? JSON.parse(latest.result) : latest.result;
    const restored = {
      ...(raw as BacktestRunResponse),
      aiSummary: latest.ai_summary || (raw as BacktestRunResponse).aiSummary || '',
      strategy: (raw as BacktestRunResponse).strategy,
    } as BacktestRunResponse;
    result.value = restored;
    session.setBacktestResult(restored);
    if (cfg?.stockCode) {
      form.stockCode = cfg.stockCode;
      form.sentimentThreshold = Number(cfg.sentimentThreshold ?? form.sentimentThreshold);
      form.useMa20 = Boolean(cfg.useMa20);
      form.initialCapital = Number(cfg.initialCapital ?? form.initialCapital);
    }
    restoreChart();
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  window.addEventListener('resize', () => chart?.resize());
  try {
    const res = await riskApi.getProfile();
    const profile = res.data as RiskProfile | null;
    if (profile && !session.backtestResult) {
      form.sentimentThreshold = profile.backtestDefaults.sentimentThreshold;
      form.useMa20 = profile.backtestDefaults.useMa20;
      riskHint.value = `已按风险测评「${profile.levelLabel}」预填参数：阈值 ${profile.backtestDefaults.sentimentThreshold}，MA20 ${profile.backtestDefaults.useMa20 ? '开' : '关'}。可手动调整。`;
    } else if (!profile) {
      riskHint.value = '尚未风险测评，当前为默认样例参数。可去「风险测评」生成个性化推荐。';
    }
  } catch {
    riskHint.value = '';
  }
  await hydrateFromHistory();
});

onActivated(() => {
  restoreChart();
  requestAnimationFrame(() => chart?.resize());
});

watch(
  () => [form.stockCode, form.sentimentThreshold, form.useMa20, form.initialCapital, form.exportReport, formStockName.value],
  () => {
    session.backtestForm = { ...form, stockName: formStockName.value };
  }
);

onUnmounted(() => {
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.threshold-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.threshold-row :deep(.t-slider) {
  flex: 1;
  min-width: 0;
}
.hint {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  flex-shrink: 0;
}
.strategy-desc h4 {
  margin-bottom: 8px;
  color: #333;
}
.strategy-desc p {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
}
.stats-row {
  margin-bottom: 12px;
}
.ai-summary {
  line-height: 1.8;
  color: #333;
}
.chart-box {
  width: 100%;
  height: 320px;
}
.diag {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}
</style>
