import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getLLM, extractJson } from './llm';
import type { QuantAgentOutput, SentimentAgentOutput } from './types';

export async function runQuantAgent(input: {
  stockCode: string;
  stockName: string;
  quote: { price: number; changePercent: number };
  kline: { date: string; close: number; high: number; low: number; ma20?: number }[];
  sentiment: SentimentAgentOutput;
}): Promise<QuantAgentOutput> {
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

  const base: QuantAgentOutput = {
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
  };

  const llm = getLLM();
  if (!llm) return base;

  const prompt = PromptTemplate.fromTemplate(`
你是「量化研究员」Agent。结合行情与舆情输出 JSON：
股票：{stockName}（{stockCode}）
价格趋势：{priceTrend}，现价：{lastClose}，涨跌幅：{changePercent}%
均线关系：{priceVsMa20}，波动：{volatilityHint}
舆情：{sentimentLabel}/{avgScore}
支撑/压力：{support}/{resistance}
格式：{{ "narrative": "<100字技术与价情联动解读>" }}
`);

  try {
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const raw = await chain.invoke({
      stockName,
      stockCode,
      priceTrend: base.priceTrend,
      lastClose: base.lastClose,
      changePercent: base.changePercent,
      priceVsMa20: base.priceVsMa20,
      volatilityHint: base.volatilityHint,
      sentimentLabel: sentiment.label,
      avgScore: sentiment.avgScore,
      support: base.keyLevels.support,
      resistance: base.keyLevels.resistance,
    });
    const parsed = extractJson<{ narrative: string }>(raw);
    if (parsed?.narrative) base.narrative = parsed.narrative;
  } catch {
    /* keep */
  }
  return base;
}
