import { query } from '../config/database';
import { getBatchQuotes } from './marketService';
import { getStockSentimentHistory, scoreToLabel } from './sentimentService';
import { LEGAL_DISCLAIMER } from '../agents/types';
import type { ReportPayload } from './reportService';

const INDUSTRY_FALLBACK: Record<string, string> = {
  '600519': '白酒',
  '000858': '白酒',
  '601318': '保险',
  '000001': '银行',
  '600036': '银行',
  '300750': '新能源',
  '002594': '汽车',
  '510300': '宽基指数',
};

/**
 * 诊断用户的模拟投资组合，分析持仓结构、风险特征并提供建议
 *
 * @param userId - 用户ID
 * @returns 组合诊断结果对象，包含：
 *   - empty: 是否为空仓
 *   - totalValue: 组合总市值
 *   - positionCount: 持仓数量
 *   - concentration: 最大单一持仓权重
 *   - topHolding: 最大持仓信息
 *   - industryWeights: 行业权重分布
 *   - holdings: 持仓明细列表
 *   - sentimentExposure: 整体舆情暴露度
 *   - sentimentLabel: 舆情标签（看多/中性/看空）
 *   - risks: 风险提示列表
 *   - suggestions: 优化建议列表
 *   - radar: 雷达图四维评分（集中度、分散度、舆情、流动性）
 *   - disclaimer: 免责声明
 */
export async function diagnosePortfolio(userId: number) {
  const positions = await query<
    { stock_code: string; stock_name: string; shares: number; avg_cost: number }[]
  >(
    `SELECT stock_code, stock_name, shares, avg_cost FROM sim_positions
     WHERE user_id = ? AND shares > 0`,
    [userId]
  );

  if (!positions.length) {
    return {
      empty: true,
      message: '暂无模拟持仓，请先在模拟投资页建仓',
      concentration: 0,
      industryWeights: [] as { industry: string; weight: number }[],
      sentimentExposure: 0,
      sentimentLabel: '中性',
      risks: ['组合为空'],
      suggestions: ['完成风险测评后，用虚拟资金建立分散持仓'],
      radar: { concentration: 0, diversification: 0, sentiment: 50, liquidity: 50 },
      disclaimer: LEGAL_DISCLAIMER,
    };
  }

  const quotes = await getBatchQuotes(
    positions.map((p) => ({ code: p.stock_code, name: p.stock_name }))
  );
  const quoteMap = new Map(quotes.map((q) => [q.code, q]));

  const holdings = positions.map((p) => {
    const price = quoteMap.get(p.stock_code)?.price || Number(p.avg_cost);
    const marketValue = price * p.shares;
    return {
      ...p,
      price,
      marketValue,
      industry: INDUSTRY_FALLBACK[p.stock_code] || '其他',
    };
  });

  const total = holdings.reduce((s, h) => s + h.marketValue, 0) || 1;
  const weights = holdings
    .map((h) => ({ ...h, weight: h.marketValue / total }))
    .sort((a, b) => b.weight - a.weight);

  const topWeight = weights[0]?.weight || 0;
  const industryMap = new Map<string, number>();
  for (const h of weights) {
    industryMap.set(h.industry, (industryMap.get(h.industry) || 0) + h.weight);
  }
  const industryWeights = [...industryMap.entries()]
    .map(([industry, weight]) => ({
      industry,
      weight: Math.round(weight * 10000) / 100,
    }))
    .sort((a, b) => b.weight - a.weight);

  let sentimentSum = 0;
  for (const h of weights) {
    const hist = await getStockSentimentHistory(h.stock_code, 14);
    const avg =
      hist.length > 0 ? hist.reduce((s, x) => s + x.score, 0) / hist.length : 0;
    sentimentSum += avg * h.weight;
  }
  const sentimentExposure = Math.round(sentimentSum * 100) / 100;
  const sentimentLabel = scoreToLabel(sentimentExposure);

  const risks: string[] = [];
  if (topWeight >= 0.4) risks.push(`单一标的集中度偏高（${(topWeight * 100).toFixed(1)}%）`);
  if (industryWeights[0] && industryWeights[0].weight >= 50) {
    risks.push(`行业集中于「${industryWeights[0].industry}」`);
  }
  if (sentimentExposure <= -0.3) risks.push('组合整体舆情偏谨慎，注意负面信息冲击');
  if (weights.length < 3) risks.push('持仓数量偏少，分散化不足');
  if (!risks.length) risks.push('当前组合风险结构相对均衡（模拟口径）');

  const suggestions = [
    '控制单一标的权重，建议单票模拟仓位不超过 30%',
    '结合回测实验室验证「情绪+均线」规则是否适配持仓风格',
    '将组合诊断导出为报告，形成可复盘的投研笔记',
  ];

  return {
    empty: false,
    totalValue: Math.round(total * 100) / 100,
    positionCount: weights.length,
    concentration: Math.round(topWeight * 10000) / 100,
    topHolding: weights[0]
      ? { code: weights[0].stock_code, name: weights[0].stock_name, weight: Math.round(topWeight * 10000) / 100 }
      : null,
    industryWeights,
    holdings: weights.map((h) => ({
      stockCode: h.stock_code,
      stockName: h.stock_name,
      weight: Math.round(h.weight * 10000) / 100,
      marketValue: Math.round(h.marketValue * 100) / 100,
      industry: h.industry,
    })),
    sentimentExposure,
    sentimentLabel,
    risks,
    suggestions,
    radar: {
      concentration: Math.round(topWeight * 100),
      diversification: Math.min(100, weights.length * 20),
      sentiment: Math.round((sentimentExposure + 1) * 50),
      liquidity: 70,
    },
    disclaimer: LEGAL_DISCLAIMER,
  };
}

export function portfolioToReportPayload(
  diagnosis: Awaited<ReturnType<typeof diagnosePortfolio>>
): ReportPayload {
  return {
    title: '模拟组合诊断报告',
    summary: diagnosis.empty
      ? diagnosis.message || '暂无持仓'
      : `持仓 ${diagnosis.positionCount} 只，集中度 ${diagnosis.concentration}%，情绪暴露 ${diagnosis.sentimentExposure}（${diagnosis.sentimentLabel}）。`,
    metrics: diagnosis.empty
      ? undefined
      : {
          组合市值: diagnosis.totalValue ?? 0,
          持仓数量: diagnosis.positionCount ?? 0,
          最大集中度: `${diagnosis.concentration}%`,
          情绪暴露: `${diagnosis.sentimentExposure}（${diagnosis.sentimentLabel}）`,
        },
    sections: [
      {
        heading: '风险提示',
        body: (diagnosis.risks || []).map((r, i) => `${i + 1}. ${r}`).join('\n'),
      },
      {
        heading: '改进建议',
        body: (diagnosis.suggestions || []).map((r, i) => `${i + 1}. ${r}`).join('\n'),
      },
      {
        heading: '行业分布',
        body:
          diagnosis.industryWeights
            ?.map((i) => `- ${i.industry}：${i.weight}%`)
            .join('\n') || '无',
      },
    ],
    disclaimer: LEGAL_DISCLAIMER,
  };
}
