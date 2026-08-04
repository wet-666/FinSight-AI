import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { BacktestRunResponse } from '@shared/types/backtest';
import type { OutlookResult } from '@shared/types/trading';

/** 会话内缓存 AI 页面结果，切换路由不丢；刷新后仍可从后端 history 恢复 */
export const useAiSessionStore = defineStore('aiSession', () => {
  const backtestResult = ref<BacktestRunResponse | null>(null);
  const backtestForm = ref({
    stockCode: '510300',
    stockName: '沪深300ETF',
    sentimentThreshold: 0.2,
    useMa20: false,
    initialCapital: 200000,
    exportReport: true,
  });

  const outlookResult = ref<OutlookResult | null>(null);
  const outlookHorizonDays = ref(30);
  const outlookStock = ref({ code: '600519', name: '贵州茅台' });

  function setBacktestResult(r: BacktestRunResponse | null) {
    backtestResult.value = r;
  }

  function setOutlookResult(r: OutlookResult | null) {
    outlookResult.value = r;
  }

  function clear() {
    backtestResult.value = null;
    outlookResult.value = null;
  }

  return {
    backtestResult,
    backtestForm,
    outlookResult,
    outlookHorizonDays,
    outlookStock,
    setBacktestResult,
    setOutlookResult,
    clear,
  };
});
