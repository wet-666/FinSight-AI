<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { MessagePlugin } from 'tdesign-vue-next';
import { dashboardApi, authApi } from '@/api';
import type { IndexItem, WatchItem, NewsItem } from '@shared/types/dashboard';

const router = useRouter();
const loading = ref(false);
const indices = ref<IndexItem[]>([]);
const watchlist = ref<WatchItem[]>([]);
const newsList = ref<NewsItem[]>([]);
const currentSentiment = ref(0);
const sentimentLabel = ref('中性');
const sentimentHistory = ref<{ date: string; score: number }[]>([]);
const showAddDialog = ref(false);
const addForm = reactive({ stockCode: '', stockName: '', market: 'SH' });

const thermometerRef = ref<HTMLElement>();
let chart: echarts.ECharts | null = null;

const labelMap: Record<string, string> = {
  positive: '正面',
  negative: '负面',
  neutral: '中性',
};

const sentimentClass = computed(() => {
  const s = currentSentiment.value;
  if (s >= 0.3) return 'optimistic';
  if (s <= -0.3) return 'pessimistic';
  if (s >= 0) return 'neutral';
  return 'cautious';
});

const watchlistColumns = [
  { colKey: 'name', title: '名称', width: 100 },
  { colKey: 'code', title: '代码', width: 80 },
  {
    colKey: 'price',
    title: '现价',
    width: 80,
    cell: (_h: unknown, { row }: { row: WatchItem }) => row.price?.toFixed(2),
  },
  {
    colKey: 'changePercent',
    title: '涨跌幅',
    width: 90,
    cell: (_h: unknown, { row }: { row: WatchItem }) => {
      const cls = row.changePercent >= 0 ? 'text-up' : 'text-down';
      const sign = row.changePercent >= 0 ? '+' : '';
      return `<span class="${cls}">${sign}${row.changePercent?.toFixed(2)}%</span>`;
    },
  },
  {
    colKey: 'sentimentLabel',
    title: 'AI情绪',
    width: 90,
    cell: (_h: unknown, { row }: { row: WatchItem }) => row.sentimentLabel,
  },
];

function sentimentTheme(label: string) {
  if (label === 'positive') return 'success';
  if (label === 'negative') return 'danger';
  return 'default';
}

// 渲染温度计图表
function renderThermometer() {
  if (!thermometerRef.value) return;
  if (!chart) chart = echarts.init(thermometerRef.value);

  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: sentimentHistory.value.map((h) => h.date.slice(5)),
    },
    yAxis: { type: 'value', min: -1, max: 1 },
    series: [
      {
        type: 'line',
        data: sentimentHistory.value.map((h) => h.score),
        smooth: true,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 82, 217, 0.3)' },
            { offset: 1, color: 'rgba(0, 82, 217, 0.02)' },
          ]),
        },
        lineStyle: { color: '#0052D9' },
        itemStyle: { color: '#0052D9' },
      },
    ],
  });
}

function onStockClick({ row }: { row: WatchItem }) {
  router.push(`/stock/${row.code}`);
}

async function addWatchlist() {
  if (!addForm.stockCode || !addForm.stockName) {
    MessagePlugin.warning('请填写完整信息');
    return;
  }
  await authApi.addWatchlist(addForm);
  MessagePlugin.success('已添加');
  showAddDialog.value = false;
  loadWatchlist();
}

async function loadOverview() {
  const res = await dashboardApi.getOverview();
  const data = res.data as {
    indices: IndexItem[];
    marketSentiment: { score: number; label: string; history: { date: string; score: number }[] };
  };
  indices.value = data.indices;
  currentSentiment.value = data.marketSentiment.score;
  sentimentLabel.value = data.marketSentiment.label;
  sentimentHistory.value = data.marketSentiment.history;
  renderThermometer();
}

async function loadWatchlist() {
  loading.value = true;
  try {
    const res = await dashboardApi.getWatchlistRadar();
    watchlist.value = res.data as WatchItem[];
  } finally {
    loading.value = false;
  }
}

async function loadNews() {
  const res = await dashboardApi.getNewsFeed();
  newsList.value = res.data as NewsItem[];
}

onMounted(async () => {
  await Promise.all([loadOverview(), loadWatchlist(), loadNews()]);
  window.addEventListener('resize', () => chart?.resize());
});

onUnmounted(() => {
  chart?.dispose();
});
</script>

<template>
  <div class="page-container">
    <t-row :gutter="16">
      <!-- 市场概览 -->
      <t-col :span="12">
        <t-card title="市场概览" :bordered="false">
          <t-row :gutter="12">
            <t-col v-for="idx in indices" :key="idx.code" :span="3">
              <div class="index-card">
                <div class="index-name">{{ idx.name }}</div>
                <div class="index-price">{{ idx.price.toFixed(2) }}</div>
                <div :class="idx.change >= 0 ? 'text-up' : 'text-down'">
                  {{ idx.change >= 0 ? '+' : '' }}{{ idx.change.toFixed(2) }}
                  ({{ idx.changePercent >= 0 ? '+' : '' }}{{ idx.changePercent.toFixed(2) }}%)
                </div>
              </div>
            </t-col>
          </t-row>
        </t-card>
      </t-col>

      <!-- 情绪温度计 -->
      <t-col :span="12">
        <t-card title="情绪温度计" :bordered="false">
          <div class="thermometer-header">
            <span>当前市场情绪：</span>
            <span :class="['sentiment-tag', sentimentClass]">{{ sentimentLabel }}</span>
            <span class="score">指数 {{ currentSentiment.toFixed(2) }}</span>
          </div>
          <div ref="thermometerRef" class="chart-box" style="height: 280px" />
        </t-card>
      </t-col>
    </t-row>

    <t-row :gutter="16" style="margin-top: 16px">
      <!-- 自选股雷达 -->
      <t-col :span="12">
        <t-card title="自选股雷达" :bordered="false">
          <template #actions>
            <t-button size="small" @click="showAddDialog = true">
              <t-icon name="add" /> 添加
            </t-button>
          </template>
          <t-table
            :data="watchlist"
            :columns="watchlistColumns"
            row-key="code"
            size="small"
            :loading="loading"
            @row-click="onStockClick"
          />
        </t-card>
      </t-col>

      <!-- AI 新闻流 -->
      <t-col :span="12">
        <t-card title="AI 新闻流" :bordered="false">
          <div class="news-list">
            <div v-for="(news, i) in newsList" :key="i" class="news-item">
              <div class="news-title">{{ news.title }}</div>
              <div class="news-summary">{{ news.sentiment?.summary || news.content?.slice(0, 80) }}</div>
              <div class="news-meta">
                <t-tag
                  v-if="news.sentiment"
                  size="small"
                  :theme="sentimentTheme(news.sentiment.label)"
                  variant="light"
                >
                  {{ labelMap[news.sentiment.label] || news.sentiment.label }}
                </t-tag>
                <span class="news-source">{{ news.source }}</span>
              </div>
            </div>
            <t-empty v-if="newsList.length === 0" description="暂无新闻" />
          </div>
        </t-card>
      </t-col>
    </t-row>

    <!-- 添加自选股 -->
    <t-dialog v-model:visible="showAddDialog" header="添加自选股" @confirm="addWatchlist">
      <t-form :data="addForm">
        <t-form-item label="股票代码">
          <t-input v-model="addForm.stockCode" placeholder="如 600519" />
        </t-form-item>
        <t-form-item label="股票名称">
          <t-input v-model="addForm.stockName" placeholder="如 贵州茅台" />
        </t-form-item>
        <t-form-item label="市场">
          <t-select v-model="addForm.market">
            <t-option value="SH" label="上海 SH" />
            <t-option value="SZ" label="深圳 SZ" />
          </t-select>
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.index-card {
  text-align: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.index-name {
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.index-price {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 4px;
}

.thermometer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.score {
  color: #666;
  font-size: 13px;
}

.news-list {
  max-height: 400px;
  overflow-y: auto;
}

.news-item {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.news-title {
  font-weight: 500;
  margin-bottom: 4px;
}

.news-summary {
  font-size: 13px;
  color: #666;
  margin-bottom: 6px;
}

.news-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.news-source {
  font-size: 12px;
  color: #999;
}
</style>
