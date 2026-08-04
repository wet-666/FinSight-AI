<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, h } from 'vue';
import { useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { MessagePlugin } from 'tdesign-vue-next';
import { dashboardApi, authApi } from '@/api';
import StockSuggestInput from '@/components/StockSuggestInput.vue';
import type { IndexItem, WatchItem, NewsItem } from '@shared/types/dashboard';
import type { StockOption } from '@/data/stockCatalog';

const router = useRouter();
const loading = ref(false);
const loadError = ref('');
const indices = ref<IndexItem[]>([]);
const watchlist = ref<WatchItem[]>([]);
const newsList = ref<NewsItem[]>([]);
const newsSource = ref('');
const newsStale = ref(false);
const newsMessage = ref('');
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
  乐观: '乐观',
  谨慎: '谨慎',
  中性: '中性',
};

const sentimentClass = computed(() => {
  const s = currentSentiment.value;
  if (s >= 0.3) return 'optimistic';
  if (s <= -0.3) return 'pessimistic';
  if (s >= 0) return 'neutral';
  return 'cautious';
});

const newsSourceLabel = computed(() => {
  const map: Record<string, string> = {
    database: '数据库',
    eastmoney: '东方财富',
    mock: '样例数据',
  };
  return map[newsSource.value] || newsSource.value;
});

const newsAlertTheme = computed(() => {
  if (newsSource.value === 'mock' || newsStale.value) return 'warning';
  if (newsSource.value === 'database') return 'info';
  return '';
});

const newsAlertMessage = computed(() => {
  if (newsMessage.value) return newsMessage.value;
  if (newsSource.value === 'mock') {
    return '外部快讯不可用或近 24 小时库中无数据，当前展示本地样例资讯。可点击顶部「更新舆情」尝试刷新。';
  }
  if (newsStale.value) {
    return '新闻偏旧（最新超过 6 小时）。请点击顶部「更新舆情」刷新。';
  }
  if (newsSource.value === 'database') {
    return '外部快讯暂时不可用，已回退到近 24 小时内的数据库缓存。可点击顶部「更新舆情」重试。';
  }
  return '';
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
      const up = (row.changePercent ?? 0) >= 0;
      const sign = up ? '+' : '';
      return h(
        'span',
        { class: up ? 'text-up' : 'text-down' },
        `${sign}${row.changePercent?.toFixed(2)}%`
      );
    },
  },
  {
    colKey: 'sentimentLabel',
    title: 'AI情绪',
    width: 90,
    cell: (_h: unknown, { row }: { row: WatchItem }) =>
      labelMap[row.sentimentLabel] || row.sentimentLabel,
  },
];

function sentimentTheme(label: string) {
  if (label === 'positive' || label === '乐观') return 'success';
  if (label === 'negative' || label === '谨慎' || label === '悲观') return 'danger';
  return 'default';
}

function renderThermometer() {
  if (!thermometerRef.value) return;
  if (!chart) chart = echarts.init(thermometerRef.value);

  chart.setOption({
    textStyle: { fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif' },
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 20, top: 24, bottom: 32 },
    xAxis: {
      type: 'category',
      data: sentimentHistory.value.map((h) =>
        h.date.length >= 10 ? h.date.slice(5, 10) : h.date
      ),
      axisLabel: { hideOverlap: true },
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
  }, true);
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
  await Promise.all([loadWatchlist(), loadNews()]);
}

function onAddPick(s: StockOption) {
  addForm.stockCode = s.code;
  addForm.stockName = s.name;
  addForm.market = s.market;
}

async function loadOverview() {
  const res = await dashboardApi.getOverview();
  const data = res.data as {
    indices: IndexItem[];
    marketSentiment: { score: number; label: string; history: { date: string; score: number }[] };
  };
  indices.value = data.indices;
  currentSentiment.value = data.marketSentiment.score;
  sentimentLabel.value = labelMap[data.marketSentiment.label] || data.marketSentiment.label;
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
  const data = res.data as {
    items?: NewsItem[];
    source?: string;
    sourceLabel?: string;
    stale?: boolean;
    freshnessHours?: number | null;
    message?: string | null;
  } & NewsItem[];
  // 兼容新旧接口
  if (Array.isArray(data)) {
    newsList.value = data;
    newsSource.value = '';
    newsStale.value = false;
    newsMessage.value = '';
  } else {
    newsList.value = data.items || [];
    newsSource.value = data.source || '';
    newsStale.value = Boolean(data.stale);
    newsMessage.value = data.message || '';
  }
}

function onSentimentUpdated() {
  Promise.all([loadOverview(), loadNews()]).catch(() => {});
}

onMounted(async () => {
  try {
    await Promise.all([loadOverview(), loadWatchlist(), loadNews()]);
  } catch {
    loadError.value = '仪表盘加载失败，请确认后端已启动且已登录';
  }
  window.addEventListener('resize', () => chart?.resize());
  window.addEventListener('finsight:sentiment-updated', onSentimentUpdated);
});

onUnmounted(() => {
  chart?.dispose();
  window.removeEventListener('finsight:sentiment-updated', onSentimentUpdated);
});
</script>

<template>
  <div class="page-container">
    <t-alert v-if="loadError" theme="error" :message="loadError" style="margin-bottom: 12px" />

    <t-row :gutter="16">
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
          <t-empty v-if="indices.length === 0" description="暂无指数数据" />
        </t-card>
      </t-col>

      <t-col :span="12">
        <t-card title="情绪温度计" :bordered="false">
          <template #subtitle>
            <span class="thermo-desc">
              综合近期财经舆情得到的市场情绪指数（约 −1 悲观 ～ +1 乐观）。0 附近表示多空相对平衡，并非系统故障。
            </span>
          </template>
          <div class="thermometer-header">
            <span>当前市场情绪：</span>
            <span :class="['sentiment-tag', sentimentClass]">{{ sentimentLabel }}</span>
            <span class="score">指数 {{ currentSentiment.toFixed(2) }}</span>
            <t-tag size="small" variant="light" theme="primary">区间 −1 ~ +1</t-tag>
          </div>
          <t-alert
            theme="info"
            :close="false"
            style="margin-bottom: 8px"
            message="说明：指数来自新闻情绪聚合。样例/中性舆情时接近 0；可点击顶部「更新舆情」刷新。"
          />
          <div ref="thermometerRef" class="chart-box" style="height: 280px" />
        </t-card>
      </t-col>
    </t-row>

    <t-row :gutter="16" style="margin-top: 16px">
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
            empty="暂无自选股，点击右上角添加，或使用 demo / demo123456 账号（需先 npm run seed）"
            @row-click="onStockClick"
          />
        </t-card>
      </t-col>

      <t-col :span="12">
        <t-card :bordered="false">
          <template #title>
            <span>AI 新闻流</span>
            <t-tag v-if="newsSource" size="small" variant="light" style="margin-left: 8px">
              数据源: {{ newsSourceLabel }}
            </t-tag>
            <t-tag
              v-if="newsStale"
              size="small"
              theme="warning"
              variant="light"
              style="margin-left: 8px"
            >
              偏旧
            </t-tag>
          </template>
          <t-alert
            v-if="newsAlertMessage"
            :theme="newsAlertTheme || 'info'"
            :message="newsAlertMessage"
            style="margin-bottom: 8px"
          />
          <div class="news-list">
            <div v-for="news in newsList" :key="news.id || news.title" class="news-item">
              <a
                v-if="news.url && news.url !== '#'"
                class="news-title news-link"
                :href="news.url"
                target="_blank"
                rel="noopener noreferrer"
              >{{ news.title }}</a>
              <div v-else class="news-title">{{ news.title }}</div>
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
                <span v-if="news.publishedAt" class="news-source">{{ news.publishedAt }}</span>
                <a
                  v-if="news.url && news.url !== '#'"
                  class="news-open"
                  :href="news.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >原文</a>
              </div>
            </div>
            <t-empty
              v-if="newsList.length === 0"
              description="近 24 小时暂无新闻，请点击顶部「更新舆情」刷新"
            />
          </div>
        </t-card>
      </t-col>
    </t-row>

    <t-dialog v-model:visible="showAddDialog" header="添加自选股" @confirm="addWatchlist">
      <StockSuggestInput
        v-model:stock-code="addForm.stockCode"
        v-model:stock-name="addForm.stockName"
        :show-hot="true"
        code-width="100%"
        name-width="100%"
        @select="onAddPick"
      />
      <t-form :data="addForm" style="margin-top: 12px">
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
  flex-wrap: wrap;
}
.thermo-desc {
  font-size: 12px;
  color: #888;
  line-height: 1.5;
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
.news-link {
  display: inline-block;
  color: #1d2129;
  text-decoration: none;
}
.news-link:hover {
  color: #0052d9;
  text-decoration: underline;
}
.news-open {
  font-size: 12px;
  color: #0052d9;
  text-decoration: none;
}
.news-open:hover {
  text-decoration: underline;
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
