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
          <t-alert
            :theme="riskProfile ? 'info' : 'warning'"
            :close="false"
            style="margin-bottom: 12px"
            :message="riskBanner"
          >
            <template v-if="!riskProfile" #operation>
              <t-button size="small" variant="text" @click="$router.push('/risk-assessment')">
                去测评
              </t-button>
            </template>
          </t-alert>
          <t-row :gutter="16">
            <t-col :span="3">
              <t-statistic title="总资产" :value="money(portfolio?.totalAssets)" prefix="¥" />
            </t-col>
            <t-col :span="3">
              <t-statistic title="可用现金" :value="money(portfolio?.account?.cash_balance)" prefix="¥" />
            </t-col>
            <t-col :span="3">
              <t-statistic title="持仓市值" :value="money(portfolio?.marketValue)" prefix="¥" />
            </t-col>
            <t-col :span="3">
              <t-statistic
                title="总盈亏"
                :value="money(portfolio?.totalReturn)"
                prefix="¥"
                :suffix="portfolio ? ` (${num(portfolio.totalReturnRate)}%)` : ''"
                :value-style="{ color: num(portfolio?.totalReturn) >= 0 ? '#e34d59' : '#00a870' }"
              />
            </t-col>
          </t-row>
          <p v-if="portfolio" class="pnl-hint">
            浮动盈亏
            <span :class="num(portfolio.unrealizedPnl) >= 0 ? 'text-up' : 'text-down'">
              {{ num(portfolio.unrealizedPnl) >= 0 ? '+' : '' }}{{ money(portfolio.unrealizedPnl) }}
            </span>
            · 累计佣金约 ¥{{ money(portfolio.feesPaid) }}
            · 总盈亏 = 浮动盈亏 − 佣金等（未卖出时，股票涨了但总盈亏仍可能为负，因为手续费已扣除）
          </p>
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
                    {{ pos.shares }}股 · 成本 {{ money(pos.avg_cost) }}
                    · 现价 {{ money(pos.currentPrice) }}
                  </div>
                </div>
                <div class="pos-pnl-wrap">
                  <div
                    :class="num(pos.dayChangePercent) >= 0 ? 'text-up' : 'text-down'"
                    class="pos-pnl"
                  >
                    {{ num(pos.dayChangePercent) >= 0 ? '+' : '' }}{{ num(pos.dayChangePercent) }}%
                  </div>
                  <div class="pos-pnl-label">当日涨跌</div>
                  <div
                    class="pos-cost-pnl"
                    :class="num(pos.profit) >= 0 ? 'text-up' : 'text-down'"
                  >
                    成本{{ num(pos.profit) >= 0 ? '+' : '' }}{{ money(pos.profit) }}
                    ({{ num(pos.profitRate) }}%)
                  </div>
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
            <t-form-item label="标的" style="width: 100%">
              <StockSuggestInput
                v-model:stock-code="tradeForm.stockCode"
                v-model:stock-name="tradeForm.stockName"
                :show-hot="true"
                @select="onStockPicked"
              />
            </t-form-item>
            <t-form-item label="数量">
              <t-input-number v-model="tradeForm.shares" :min="100" :step="100" style="width: 120px" />
            </t-form-item>
            <t-form-item class="trade-actions">
              <t-space>
                <t-button theme="danger" :loading="trading" @click="submitOrder('buy')">买入</t-button>
                <t-button theme="success" variant="outline" :loading="trading" @click="submitOrder('sell')">卖出</t-button>
              </t-space>
            </t-form-item>
          </t-form>

          <div ref="klineRef" class="mini-kline" />
        </t-card>

        <!-- AI 情景展望 -->
        <t-card title="AI 情景展望（非确定性预测）" :bordered="false" style="margin-top: 16px">
          <div class="outlook-toolbar">
            <t-radio-group v-model="horizonDays" variant="default-filled" size="small">
              <t-radio-button :value="7">7日</t-radio-button>
              <t-radio-button :value="30">30日</t-radio-button>
              <t-radio-button :value="90">90日</t-radio-button>
            </t-radio-group>
            <t-button size="small" theme="primary" :loading="outlookLoading" @click="generateOutlook">
              生成展望
            </t-button>
          </div>

          <t-alert v-if="outlook" theme="info" :close="false" style="margin-bottom: 12px">
            <div v-html="formatAiText(outlook.summary)" />
          </t-alert>

          <t-row v-if="outlook" :gutter="12">
            <t-col v-for="(s, i) in outlook.scenarios" :key="i" :span="4">
              <div class="scenario-card" :class="'scenario-' + i">
                <div class="scenario-label">{{ s.label }}</div>
                <div class="scenario-prob">概率 {{ s.probability }}</div>
                <div class="scenario-range">{{ s.returnRange }}</div>
                <div class="scenario-desc" v-html="formatAiText(s.description)" />
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
defineOptions({ name: 'SimTrading' });

import { ref, reactive, computed, onMounted, onUnmounted, onActivated, watch } from 'vue';
import { useRouter } from 'vue-router';
import draggable from 'vuedraggable';
import * as echarts from 'echarts';
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next';
import { tradingApi, stockApi, outlookApi, riskApi } from '@/api';
import LegalDisclaimer from '@/components/LegalDisclaimer.vue';
import StockSuggestInput from '@/components/StockSuggestInput.vue';
import { useAiSessionStore } from '@/stores/aiSessionStore';
import { formatAiText } from '@/utils/aiText';
import type { SimPosition, PortfolioSnapshot, OutlookResult } from '@shared/types/trading';
import type { KLineItem } from '@shared/types/dashboard';
import type { StockOption } from '@/data/stockCatalog';
import type { RiskProfile } from '@shared/types/risk';

const router = useRouter();
const session = useAiSessionStore();
const portfolio = ref<PortfolioSnapshot | null>(null);
const positionList = ref<SimPosition[]>([]);
const orders = ref<Record<string, unknown>[]>([]);
const selectedCode = ref('');
const trading = ref(false);
const outlookLoading = ref(false);
const horizonDays = ref(session.outlookHorizonDays);
const outlook = ref<OutlookResult | null>(session.outlookResult);
const riskProfile = ref<RiskProfile | null>(null);

const riskBanner = computed(() => {
  if (!riskProfile.value) {
    return '尚未完成风险测评，买入将按稳健型默认限制：单票不超过总资产 35%。建议先完成测评。';
  }
  return `风险偏好：${riskProfile.value.levelLabel} · 单票仓位上限 ${(riskProfile.value.maxPositionWeight * 100).toFixed(0)}% · ${riskProfile.value.hint}`;
});

const tradeForm = reactive({
  stockCode: session.outlookStock.code || '600519',
  stockName: session.outlookStock.name || '贵州茅台',
  shares: 100,
});

const klineRef = ref<HTMLElement>();
let klineChart: echarts.ECharts | null = null;

/** MySQL DECIMAL / 接口字段可能是 string，统一转 number 再展示 */
function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function money(v: unknown): string {
  if (v == null || v === '') return '--';
  const n = num(v, NaN);
  return Number.isFinite(n) ? n.toFixed(2) : '--';
}

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

function onStockPicked(s: StockOption) {
  tradeForm.stockCode = s.code;
  tradeForm.stockName = s.name;
  loadKline(s.code);
}

async function loadKline(code: string) {
  const res = await stockApi.getChart(code, 60);
  const payload = res.data as { kline: KLineItem[]; source?: string };
  const kline = payload.kline || [];
  if (!klineRef.value || kline.length === 0) return;
  if (!klineChart) klineChart = echarts.init(klineRef.value);
  const first = kline[0]!.date;
  const last = kline[kline.length - 1]!.date;
  klineChart.setOption({
    textStyle: { fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif' },
    title: {
      text: `${code} K线  ${first} ~ ${last}`,
      left: 0,
      top: 0,
      textStyle: {
        fontSize: 13,
        color: getComputedStyle(document.documentElement).getPropertyValue('--fs-text-secondary').trim() || '#666',
        fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
      },
    },
    grid: { left: 64, right: 20, top: 40, bottom: 28 },
    xAxis: {
      type: 'category',
      data: kline.map((k) => (k.date.length >= 10 ? k.date.slice(5, 10) : k.date)),
      axisLabel: {
        hideOverlap: true,
        // 避免末尾日期被挤掉，看起来像“标题变了、K线还停在旧日期”
        interval: (index: number) =>
          index === 0 || index === kline.length - 1 || index % 7 === 0,
      },
    },
    yAxis: { scale: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const arr = params as { dataIndex: number; data: number[] }[];
        const i = arr[0]?.dataIndex ?? 0;
        const bar = kline[i];
        if (!bar) return '';
        const ohlc = arr[0]?.data || [];
        return `${bar.date}<br/>开 ${ohlc[0]} 收 ${ohlc[1]}<br/>低 ${ohlc[2]} 高 ${ohlc[3]}`;
      },
    },
    series: [{
      type: 'candlestick',
      data: kline.map((k) => [k.open, k.close, k.low, k.high]),
      itemStyle: { color: '#e34d59', color0: '#00a870', borderColor: '#e34d59', borderColor0: '#00a870' },
    }],
  }, true);
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
    MessagePlugin.success(
      side === 'buy' ? '买入成功，已同步加入自选股雷达' : '卖出成功'
    );
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
    session.setOutlookResult(outlook.value);
    session.outlookHorizonDays = horizonDays.value;
    session.outlookStock = { code: tradeForm.stockCode, name: tradeForm.stockName };
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

watch(horizonDays, (v) => {
  session.outlookHorizonDays = v;
});

async function hydrateOutlookHistory() {
  if (outlook.value) return;
  try {
    const res = await outlookApi.history();
    const rows = (res.data as Array<{
      stock_code: string;
      horizon_days: number;
      outlook: string | OutlookResult;
    }>) || [];
    const latest = rows[0];
    if (!latest) return;
    const data =
      typeof latest.outlook === 'string' ? JSON.parse(latest.outlook) : latest.outlook;
    outlook.value = data as OutlookResult;
    session.setOutlookResult(outlook.value);
    horizonDays.value = Number(latest.horizon_days || 30);
    if (latest.stock_code) {
      tradeForm.stockCode = latest.stock_code;
      tradeForm.stockName = (data as OutlookResult).stockName || tradeForm.stockName;
    }
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  await Promise.all([
    loadPortfolio(),
    loadOrders(),
    riskApi.getProfile().then((res) => {
      riskProfile.value = (res.data as RiskProfile | null) || null;
    }).catch(() => {
      riskProfile.value = null;
    }),
  ]);
  loadKline(tradeForm.stockCode);
  await hydrateOutlookHistory();
  window.addEventListener('resize', () => klineChart?.resize());
});

onActivated(() => {
  requestAnimationFrame(() => klineChart?.resize());
});

onUnmounted(() => {
  klineChart?.dispose();
  klineChart = null;
});
</script>

<style scoped>
.pnl-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--fs-text-secondary);
}

.hint {
  font-size: 12px;
  color: var(--fs-text-muted);
}

.position-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--fs-bg-muted);
  color: var(--fs-text-primary);
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.position-item:hover,
.position-item.active {
  background: var(--fs-bg-muted-hover);
  border-color: var(--fs-brand);
}

.drag-handle {
  cursor: grab;
  color: var(--fs-text-muted);
  flex-shrink: 0;
}

.pos-info {
  flex: 1;
  min-width: 0;
}

.pos-name {
  font-weight: 500;
  font-size: 14px;
  color: var(--fs-text-primary);
}

.pos-detail {
  font-size: 12px;
  color: var(--fs-text-secondary);
  margin-top: 2px;
}

.pos-day {
  font-size: 12px;
  margin-top: 2px;
}

.pos-pnl-wrap {
  text-align: right;
  flex-shrink: 0;
}

.pos-pnl {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.pos-pnl-label {
  font-size: 11px;
  color: var(--fs-text-muted);
  margin-top: 2px;
}

.pos-cost-pnl {
  font-size: 11px;
  margin-top: 4px;
  white-space: nowrap;
}

.trade-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 12px;
  margin-bottom: 12px;
}

.trade-actions {
  margin-left: 4px;
}

.outlook-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.mini-kline {
  width: 100%;
  height: 280px;
}

.scenario-card {
  padding: 12px;
  border-radius: 8px;
  background: var(--fs-bg-muted);
  color: var(--fs-text-primary);
  min-height: 120px;
}

.scenario-0 {
  border-left: 3px solid #00a870;
}

.scenario-1 {
  border-left: 3px solid var(--fs-brand);
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
  color: var(--fs-text-secondary);
}

.scenario-range {
  font-size: 16px;
  font-weight: 600;
  margin: 6px 0;
  color: var(--fs-brand);
}

.scenario-desc {
  font-size: 12px;
  color: var(--fs-text-secondary);
  line-height: 1.5;
}

.disclaimer-text {
  margin-top: 12px;
  font-size: 12px;
  color: var(--fs-text-muted);
  line-height: 1.6;
}
</style>
