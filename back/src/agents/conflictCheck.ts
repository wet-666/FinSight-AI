import type { ConflictPoint, QuantAgentOutput, SentimentAgentOutput } from './types';

/** 确定性冲突检测：不调用 LLM，稳定可解释 */
export function detectConflicts(
  sentiment: SentimentAgentOutput,
  quant: QuantAgentOutput
): ConflictPoint[] {
  const conflicts: ConflictPoint[] = [];

  const bullishSentiment = sentiment.avgScore >= 0.2 || /偏多|正面|积极/.test(sentiment.label);
  const bearishSentiment = sentiment.avgScore <= -0.2 || /偏空|负面|谨慎/.test(sentiment.label);
  const belowMa = quant.priceVsMa20.includes('低于');
  const aboveMa = quant.priceVsMa20.includes('高于');
  const rising = quant.priceTrend === '上涨';
  const falling = quant.priceTrend === '下跌';

  if (bullishSentiment && belowMa) {
    conflicts.push({
      type: 'sentiment_price',
      summary: `舆情偏多（均分 ${sentiment.avgScore}），但价格仍低于 MA20，情绪与价格可能短期背离`,
      severity: 'warning',
    });
  }

  if (bearishSentiment && rising) {
    conflicts.push({
      type: 'sentiment_price',
      summary: `舆情偏空，但近端价格趋势为上涨，需警惕情绪滞后或消息面噪声`,
      severity: 'warning',
    });
  }

  if (bullishSentiment && falling && aboveMa) {
    conflicts.push({
      type: 'sentiment_price',
      summary: `舆情偏多且价格仍在 MA20 上方，但近端趋势转弱，关注是否进入震荡消化`,
      severity: 'info',
    });
  }

  if (quant.volatilityHint === '波动偏高') {
    conflicts.push({
      type: 'volatility',
      summary: '波动偏高：即便证据方向一致，也应降低结论置信度，优先观察而非加仓假设',
      severity: 'high',
    });
  }

  if (sentiment.retrievalMode === 'keyword' && sentiment.citations.every((c) => c.source === 'demo')) {
    conflicts.push({
      type: 'data_gap',
      summary: '当前证据多为样例或关键词检索结果，缺少真实新闻语料，结论可信度有限',
      severity: 'info',
    });
  }

  if (!sentiment.citations.length) {
    conflicts.push({
      type: 'data_gap',
      summary: '未检索到可用证据片段，秘书报告将主要依赖量化规则结果',
      severity: 'warning',
    });
  }

  return conflicts;
}
