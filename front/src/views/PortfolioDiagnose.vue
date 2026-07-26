<template>
  <div class="page-container">
    <LegalDisclaimer />
    <t-card title="模拟组合诊断" subtitle="集中度 / 行业分布 / 情绪暴露（教育模拟）" :bordered="false">
      <t-space>
        <t-button theme="primary" :loading="loading" @click="load">刷新诊断</t-button>
        <t-button variant="outline" :loading="exporting" @click="exportReport">导出报告</t-button>
        <t-button variant="text" @click="$router.push('/sim-trading')">去模拟交易</t-button>
      </t-space>

      <t-alert v-if="data?.empty" theme="warning" style="margin-top: 16px" :message="data.message" />

      <template v-else-if="data">
        <t-row :gutter="16" style="margin-top: 16px">
          <t-col :span="3"><t-statistic title="组合市值" :value="data.totalValue" /></t-col>
          <t-col :span="3"><t-statistic title="持仓数" :value="data.positionCount" /></t-col>
          <t-col :span="3"><t-statistic title="最大集中度" :value="data.concentration" suffix="%" /></t-col>
          <t-col :span="3">
            <t-statistic title="情绪暴露" :value="data.sentimentExposure" :suffix="data.sentimentLabel" />
          </t-col>
        </t-row>

        <t-row :gutter="16" style="margin-top: 16px">
          <t-col :span="12">
            <div ref="pieRef" class="chart-box" />
          </t-col>
          <t-col :span="12">
            <div ref="radarRef" class="chart-box" />
          </t-col>
        </t-row>

        <t-card title="风险提示" :bordered="true" style="margin-top: 16px">
          <ul>
            <li v-for="(r, i) in data.risks" :key="i">{{ r }}</li>
          </ul>
        </t-card>
        <t-card title="改进建议" :bordered="true" style="margin-top: 12px">
          <ul>
            <li v-for="(r, i) in data.suggestions" :key="i">{{ r }}</li>
          </ul>
        </t-card>
      </template>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import * as echarts from 'echarts';
import { MessagePlugin } from 'tdesign-vue-next';
import LegalDisclaimer from '@/components/LegalDisclaimer.vue';
import { portfolioApi } from '@/api';
import type { PortfolioDiagnosis } from '@shared/types/portfolio';

const data = ref<PortfolioDiagnosis | null>(null);
const loading = ref(false);
const exporting = ref(false);
const pieRef = ref<HTMLElement>();
const radarRef = ref<HTMLElement>();
let pieChart: echarts.ECharts | null = null;
let radarChart: echarts.ECharts | null = null;

function renderCharts() {
  if (!data.value || data.value.empty) return;
  if (pieRef.value) {
    if (!pieChart) pieChart = echarts.init(pieRef.value);
    pieChart.setOption({
      title: { text: '行业权重', left: 0, textStyle: { fontSize: 14 } },
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          data: (data.value.industryWeights || []).map((i) => ({
            name: i.industry,
            value: i.weight,
          })),
        },
      ],
    });
  }
  if (radarRef.value && data.value.radar) {
    if (!radarChart) radarChart = echarts.init(radarRef.value);
    const r = data.value.radar;
    radarChart.setOption({
      title: { text: '风险雷达', left: 0, textStyle: { fontSize: 14 } },
      radar: {
        indicator: [
          { name: '集中度', max: 100 },
          { name: '分散度', max: 100 },
          { name: '情绪', max: 100 },
          { name: '流动性', max: 100 },
        ],
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: [r.concentration, r.diversification, r.sentiment, r.liquidity],
              name: '组合画像',
            },
          ],
        },
      ],
    });
  }
}

async function load() {
  loading.value = true;
  try {
    const res = await portfolioApi.diagnose();
    data.value = res.data as PortfolioDiagnosis;
    await nextTick();
    renderCharts();
  } finally {
    loading.value = false;
  }
}

async function exportReport() {
  exporting.value = true;
  try {
    await portfolioApi.exportDiagnose();
    MessagePlugin.success('已生成报告，可前往报告中心下载');
  } catch {
    MessagePlugin.error('导出失败');
  } finally {
    exporting.value = false;
  }
}

onMounted(async () => {
  await load();
  window.addEventListener('resize', () => {
    pieChart?.resize();
    radarChart?.resize();
  });
});

onUnmounted(() => {
  pieChart?.dispose();
  radarChart?.dispose();
});
</script>

<style scoped>
.chart-box {
  height: 320px;
  margin-top: 8px;
}
ul {
  margin: 0;
  padding-left: 18px;
  line-height: 1.8;
}
</style>
