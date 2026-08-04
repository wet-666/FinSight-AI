import { getLLM, invokeLLMJson } from './llm';
import type { QuantAgentOutput, SentimentAgentOutput } from './types';

export async function runQuantAgent(input: {
  stockCode: string;
  stockName: string;
  quote: { price: number; changePercent: number };
  kline: { date: string; close: number; high: number; low: number; ma20?: number }[];
  sentiment: SentimentAgentOutput;
}): Promise<QuantAgentOutput & { llmEnhanced: boolean }> {
  const { stockCode, stockName, quote, kline, sentiment } = input;
  const recent = kline.slice(-20);
  const last = recent[recent.length - 1];
  const first = recent[0];
  const lastClose = last?.close ?? quote.price;
  const ma20 = last?.ma20 ?? null;
  const priceTrend =
    first && last
      ? last.close > first.close * 1.02
        ? '上涨'
        : last.close < first.close * 0.98
          ? '下跌'
          : '震荡'
      : '震荡';
  const priceVsMa20 =
    ma20 == null
      ? '均线不足'
      : lastClose < ma20
        ? '价格低于MA20'
        : lastClose > ma20 * 1.03
          ? '价格显著高于MA20'
          : '价格贴近MA20';

  const highs = recent.map((k) => k.high);
  const lows = recent.map((k) => k.low);
  const resistance = highs.length ? Math.max(...highs) : lastClose;
  const support = lows.length ? Math.min(...lows) : lastClose;
  const returns = recent.slice(1).map((k, i) => (k.close - recent[i].close) / recent[i].close);
  const vol =
    returns.length > 0
      ? Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length) * Math.sqrt(252)
      : 0;

  const base: QuantAgentOutput & { llmEnhanced: boolean } = {
    priceTrend,
    lastClose,
    changePercent: quote.changePercent,
    ma20,
    priceVsMa20,
    volatilityHint: vol > 0.35 ? '波动偏高' : vol > 0.2 ? '波动中等' : '波动偏低',
    keyLevels: {
      support: Math.round(support * 100) / 100,
      resistance: Math.round(resistance * 100) / 100,
    },
    narrative: `${stockName}近20日呈${priceTrend}，现价${lastClose}，${priceVsMa20}；舆情均分${sentiment.avgScore}（${sentiment.label}）。支撑约${support.toFixed(2)}，压力约${resistance.toFixed(2)}。`,
    llmEnhanced: false,
  };

  if (!getLLM()) return base;

  const { data, usedLlm } = await invokeLLMJson<{ narrative: string }>({
    system:
      '你是量化研究员。只输出 JSON：{"narrative":"..."}。narrative 约100字，结合价量与舆情，禁止具体买卖点位。',
    user: `股票：${stockName}（${stockCode}）
趋势：${base.priceTrend} 现价：${base.lastClose} 涨跌幅：${base.changePercent}%
均线：${base.priceVsMa20} 波动：${base.volatilityHint}
舆情：${sentiment.label}/${sentiment.avgScore}
支撑/压力：${base.keyLevels.support}/${base.keyLevels.resistance}`,
    retries: 0,
  });

  if (data?.narrative) {
    base.narrative = data.narrative;
    base.llmEnhanced = usedLlm;
  }
  return base;
}
