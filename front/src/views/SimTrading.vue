<template>
  <div class="page-container">
    <LegalDisclaimer />

    <t-row :gutter="16">
      <!-- 账户概览 -->
      <t-col :span="12">
        <t-card title="模拟账户" :bordered="false">
          <template #actions>
            <t-tag theme="warning" variant="light">虚拟资金 · 100万体验金</t-tag>
            <t-button size="small" variant="outline" @click="resetAccount">重置账户</t-button>
          </template>
          <t-row :gutter="16">
            <t-col :span="3">
              <t-statistic title="总资产" :value="portfolio?.totalAssets?.toFixed(2) ?? '--'" prefix="¥" />
            </t-col>
            <t-col :span="3">
              <t-statistic title="可用现金" :value="portfolio?.account?.cash_balance?.toFixed(2) ?? '--'" prefix="¥" />
            </t-col>
            <t-col :span="3">
              <t-statistic title="持仓市值" :value="portfolio?.marketValue?.toFixed(2) ?? '--'" prefix="¥" />
            </t-col>
            <t-col :span="3">
              <t-statistic
                title="总盈亏"
                :value="portfolio?.totalReturn?.toFixed(2) ?? '--'"
                prefix="¥"
                :suffix="portfolio ? ` (${portfolio.totalReturnRate}%)` : ''"
                :value-style="{ color: (portfolio?.totalReturn ?? 0) >= 0 ? '#e34d59' : '#00a870' }"
              />
            </t-col>
          </t-row>
        </t-card>
      </t-col>
    </t-row>

    <t-row :gutter="16" style="margin-top: 16px">
      <!-- 拖拽组合 -->
      <t-col :span="5">
        <t-card title="我的模拟组合" :bordered="false">
          <template #subtitle>
            <span class="hint">拖拽调整顺序</span>
          </template>
          <draggable
            v-model="positionList"
            item-key="stock_code"
            handle=".drag-handle"
            animation="200"
            @end="onDragEnd"
          >
            <template #item="{ element: pos }">
              <div
                class="position-item"
                :class="{ active: selectedCode === pos.stock_code }"
                @click="selectStock(pos)"
              >
                <t-icon name="move" class="drag-handle" />
                <div class="pos-info">
                  <div class="pos-name">{{ pos.stock_name }} ({{ pos.stock_code }})</div>
                  <div class="pos-detail">
                    {{ pos.shares }}股 · 成本 {{ pos.avg_cost?.toFixed(2) }}
                    · 现价 {{ pos.currentPrice?.toFixed(2) }}
                  </div>
                </div>
                <div :class="(pos.profit ?? 0) >= 0 ? 'text-up' : 'text-down'" class="pos-pnl">
                  {{ (pos.profit ?? 0) >= 0 ? '+' : '' }}{{ pos.profit?.toFixed(2) }}
                  ({{ pos.profitRate }}%)
                </div>
              </div>
            </template>
          </draggable>
          <t-empty v-if="positionList.length === 0" description="暂无持仓，去下方买入吧" />
        </t-card>

        <t-card title="最近成交" :bordered="false" style="margin-top: 16px">
          <t-table :data="orders" :columns="orderColumns" size="small" max-height="240" />
        </t-card>
      </t-col>

      <!-- 交易 + K线 -->
      <t-col :span="7">
        <t-card :bordered="false">
          <template #title>模拟交易 · {{ tradeForm.stockName || '选择股票' }}</template>
          <template #actions>
            <t-button size="small" variant="text" @click="goKline">查看K线分析 →</t-button>
          </template>

          <t-form :data="tradeForm" layout="inline" class="trade-form">
            <t-form-item label="代码">
              <t-input v-model="tradeForm.stockCode" placeholder="600519" style="width: 100px" />
            </t-form-item>
            <t-form-item label="名称">
              <t-input v-model="tradeForm.stockName" placeholder="贵州茅台" style="width: 120px" />
            </t-form-item>
            <t-form-item label="数量">
              <t-input-number v-model="tradeForm.shares" :min="100" :step="100" style="width: 120px" />
            </t-form-item>
            <t-form-item>
              <t-button theme="danger" :loading="trading" @click="submitOrder('buy')">买入</t-button>
              <t-button theme="success" variant="outline" :loading="trading" @click="submitOrder('sell')">卖出</t-button>
            </t-form-item>
          </t-form>

          <div ref="klineRef" class="mini-kline" />
        </t-card>

        <!-- AI 情景展望 -->
        <t-card title="AI 情景展望（非确定性预测）" :bordered="false" style="margin-top: 16px">
          <template #actions>
            <t-radio-group v-model="horizonDays" variant="default-filled" size="small">
              <t-radio-button :value="7">7日</t-radio-button>
              <t-radio-button :value="30">30日</t-radio-button>
              <t-radio-button :value="90">90日</t-radio-button>
            </t-radio-group>
            <t-button size="small" theme="primary" :loading="outlookLoading" @click="generateOutlook">
              生成展望
            </t-button>
          </template>

          <t-alert v-if="outlook" theme="info" :close="false" style="margin-bottom: 12px">
            {{ outlook.summary }}
          </t-alert>

          <t-row v-if="outlook" :gutter="12">
            <t-col v-for="(s, i) in outlook.scenarios" :key="i" :span="4">
              <div class="scenario-card" :class="'scenario-' + i">
                <div class="scenario-label">{{ s.label }}</div>
                <div class="scenario-prob">概率 {{ s.probability }}</div>
                <div class="scenario-range">{{ s.returnRange }}</div>
                <div class="scenario-desc">{{ s.description }}</div>
              </div>
            </t-col>
          </t-row>

          <p v-if="outlook" class="disclaimer-text">{{ outlook.disclaimer }}</p>
        </t-card>
      </t-col>
    </t-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import draggable from 'vuedraggable';
import * as echarts from 'echarts';
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next';
import { tradingApi, stockApi, outlookApi } from '@/api';
import LegalDisclaimer from '@/components/LegalDisclaimer.vue';
import type { SimPosition, PortfolioSnapshot, OutlookResult } from '@shared/types/trading';
import type { KLineItem } from '@shared/types/dashboard';

const router = useRouter();
const portfolio = ref<PortfolioSnapshot | null>(null);
const positionList = ref<SimPosition[]>([]);
const orders = ref<Record<string, unknown>[]>([]);
const selectedCode = ref('');
const trading = ref(false);
const outlookLoading = ref(false);
const horizonDays = ref(30);
const outlook = ref<OutlookResult | null>(null);

const tradeForm = reactive({
  stockCode: '600519',
  stockName: '贵州茅台',
  shares: 100,
});

const klineRef = ref<HTMLElement>();
let klineChart: echarts.ECharts | null = null;

const orderColumns = [
  { colKey: 'created_at', title: '时间', width: 140, cell: (_h: unknown, { row }: { row: { created_at: string } }) => new Date(row.created_at).toLocaleString('zh-CN') },
  { colKey: 'side', title: '方向', width: 60, cell: (_h: unknown, { row }: { row: { side: string } }) => (row.side === 'buy' ? '买' : '卖') },
  { colKey: 'stock_code', title: '代码', width: 80 },
  { colKey: 'shares', title: '数量', width: 70 },
  { colKey: 'price', title: '价格', width: 80 },
];

async function loadPortfolio() {
  const res = await tradingApi.getPortfolio();
  portfolio.value = res.data as PortfolioSnapshot;
  positionList.value = [...(portfolio.value?.positions || [])];
  if (!selectedCode.value && positionList.value.length > 0) {
    selectStock(positionList.value[0]!);
  }
}

async function loadOrders() {
  const res = await tradingApi.getOrders();
  orders.value = res.data as Record<string, unknown>[];
}

function selectStock(pos: SimPosition) {
  selectedCode.value = pos.stock_code;
  tradeForm.stockCode = pos.stock_code;
  tradeForm.stockName = pos.stock_name;
  loadKline(pos.stock_code);
}

async function loadKline(code: string) {
  const res = await stockApi.getChart(code, 40);
  const kline = (res.data as { kline: KLineItem[] }).kline;
  if (!klineRef.value) return;
  if (!klineChart) klineChart = echarts.init(klineRef.value);
  klineChart.setOption({
    title: { text: `${code} K线（模拟数据）`, left: 0, textStyle: { fontSize: 13, color: '#666' } },
    grid: { left: 50, right: 16, top: 36, bottom: 24 },
    xAxis: { type: 'category', data: kline.map((k) => k.date.slice(5)) },
    yAxis: { scale: true },
    series: [{
      type: 'candlestick',
      data: kline.map((k) => [k.open, k.close, k.low, k.high]),
      itemStyle: { color: '#e34d59', color0: '#00a870', borderColor: '#e34d59', borderColor0: '#00a870' },
    }],
  });
}

async function submitOrder(side: 'buy' | 'sell') {
  if (!tradeForm.stockCode) {
    MessagePlugin.warning('请输入股票代码');
    return;
  }
  trading.value = true;
  try {
    await tradingApi.placeOrder({
      stockCode: tradeForm.stockCode,
      stockName: tradeForm.stockName,
      side,
      shares: tradeForm.shares,
    });
    MessagePlugin.success(side === 'buy' ? '买入成功' : '卖出成功');
    await Promise.all([loadPortfolio(), loadOrders()]);
    loadKline(tradeForm.stockCode);
  } finally {
    trading.value = false;
  }
}

async function onDragEnd() {
  const items = positionList.value.map((p, i) => ({
    stockCode: p.stock_code,
    sortOrder: i + 1,
  }));
  await tradingApi.updatePortfolioOrder(items);
}

async function generateOutlook() {
  outlookLoading.value = true;
  try {
    const res = await outlookApi.generate({
      stockCode: tradeForm.stockCode,
      stockName: tradeForm.stockName,
      horizonDays: horizonDays.value,
    });
    outlook.value = res.data as OutlookResult;
  } finally {
    outlookLoading.value = false;
  }
}

function goKline() {
  router.push(`/stock/${tradeForm.stockCode}`);
}

function resetAccount() {
  const dialog = DialogPlugin.confirm({
    header: '重置模拟账户',
    body: '将清空所有持仓和交易记录，恢复100万虚拟资金。确定继续？',
    onConfirm: async () => {
      await tradingApi.reset();
      MessagePlugin.success('账户已重置');
      await Promise.all([loadPortfolio(), loadOrders()]);
      dialog.destroy();
    },
  });
}

watch(() => tradeForm.stockCode, (code) => {
  if (code.length >= 6) loadKline(code);
});

onMounted(async () => {
  await Promise.all([loadPortfolio(), loadOrders()]);
  loadKline(tradeForm.stockCode);
  window.addEventListener('resize', () => klineChart?.resize());
});

onUnmounted(() => klineChart?.dispose());
</script>

<style scoped>
.hint {
  font-size: 12px;
  color: #999;
}

.position-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #f9fafb;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.position-item:hover,
.position-item.active {
  background: #ecf2fe;
  border-color: #0052d9;
}

.drag-handle {
  cursor: grab;
  color: #999;
  flex-shrink: 0;
}

.pos-info {
  flex: 1;
  min-width: 0;
}

.pos-name {
  font-weight: 500;
  font-size: 14px;
}

.pos-detail {
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}

.pos-pnl {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.trade-form {
  margin-bottom: 12px;
}

.mini-kline {
  width: 100%;
  height: 280px;
}

.scenario-card {
  padding: 12px;
  border-radius: 8px;
  background: #f9fafb;
  min-height: 120px;
}

.scenario-0 {
  border-left: 3px solid #00a870;
}

.scenario-1 {
  border-left: 3px solid #0052d9;
}

.scenario-2 {
  border-left: 3px solid #e34d59;
}

.scenario-label {
  font-weight: 600;
  margin-bottom: 4px;
}

.scenario-prob {
  font-size: 12px;
  color: #666;
}

.scenario-range {
  font-size: 16px;
  font-weight: 600;
  margin: 6px 0;
  color: #0052d9;
}

.scenario-desc {
  font-size: 12px;
  color: #666;
  line-height: 1.5;
}

.disclaimer-text {
  margin-top: 12px;
  font-size: 12px;
  color: #999;
  line-height: 1.6;
}
</style>
