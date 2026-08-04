import { getLLM, invokeLLMJson } from './llm';
import { detectConflicts } from './conflictCheck';
import {
  LEGAL_DISCLAIMER,
  type Citation,
  type QuantAgentOutput,
  type SecretaryAgentOutput,
  type SentimentAgentOutput,
} from './types';

function buildEvidenceSummary(citations: Citation[], conflictsCount: number): string {
  if (!citations.length) {
    return `暂无检索证据；冲突点 ${conflictsCount} 项，结论主要来自量化规则。`;
  }
  const titles = citations
    .slice(0, 3)
    .map((c) => c.title)
    .join('；');
  return `共引用 ${citations.length} 条证据（如：${titles}）；规则冲突点 ${conflictsCount} 项。`;
}

function buildReport(params: {
  stockCode: string;
  stockName: string;
  sentiment: SentimentAgentOutput;
  quant: QuantAgentOutput;
  risks: string[];
  watchPoints: string[];
  conflicts: SecretaryAgentOutput['conflicts'];
  evidenceSummary: string;
  citations: Citation[];
}): string {
  const { stockCode, stockName, sentiment, quant, risks, watchPoints, conflicts, evidenceSummary, citations } =
    params;
  const conflictBlock = conflicts.length
    ? conflicts.map((c, i) => `${i + 1}. [${c.severity}] ${c.summary}`).join('\n')
    : '未发现显著冲突。';
  const citeBlock = citations.length
    ? citations.map((c, i) => `[${i + 1}] ${c.title}（相关度 ${c.score}，${c.id}）\n    ${c.snippet}`).join('\n')
    : '（无）';

  return `【${stockName}（${stockCode}）多智能体投研备忘录】

一、执行摘要
${stockName}现价 ${quant.lastClose} 元（涨跌幅 ${quant.changePercent}%），近端趋势${quant.priceTrend}，${quant.priceVsMa20}。舆情均分 ${sentiment.avgScore}（${sentiment.label}）。
证据摘要：${evidenceSummary}

二、舆情分析师观点
${sentiment.narrative}

三、量化研究员观点
${quant.narrative}

四、冲突与风险
${conflictBlock}
风险：
${risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}
观察：${watchPoints.join('；')}

五、证据引用
${citeBlock}

六、结论
建议将本备忘录用于学习与模拟决策流程演练，并结合自身风险测评结果控制仓位。

${LEGAL_DISCLAIMER}`;
}

export async function runSecretaryAgent(input: {
  stockCode: string;
  stockName: string;
  sentiment: SentimentAgentOutput;
  quant: QuantAgentOutput;
}): Promise<SecretaryAgentOutput & { llmEnhanced: boolean }> {
  const { stockCode, stockName, sentiment, quant } = input;
  const citations = sentiment.citations;
  const conflicts = detectConflicts(sentiment, quant);
  const evidenceSummary = buildEvidenceSummary(citations, conflicts.length);

  const risks = [
    '舆情与价格短期可能背离，勿单一依赖情绪信号',
    quant.volatilityHint === '波动偏高' ? '标的波动偏高，注意仓位与止损纪律' : '关注宏观与行业政策扰动',
    '本系统为教育模拟，回测与情景分析不代表未来收益',
  ];
  const watchPoints = [
    `关注情绪均分是否持续位于「${sentiment.label}」区间`,
    `观察价格相对 MA20 的位置（当前：${quant.priceVsMa20}）`,
    `跟踪支撑 ${quant.keyLevels.support} / 压力 ${quant.keyLevels.resistance} 附近表现`,
  ];

  const finalReport = buildReport({
    stockCode,
    stockName,
    sentiment,
    quant,
    risks,
    watchPoints,
    conflicts,
    evidenceSummary,
    citations,
  });

  const base: SecretaryAgentOutput & { llmEnhanced: boolean } = {
    executiveSummary: `${stockName}趋势${quant.priceTrend}，舆情${sentiment.label}，波动${quant.volatilityHint}。证据 ${citations.length} 条，冲突 ${conflicts.length} 项。`,
    risks,
    watchPoints,
    finalReport,
    disclaimer: LEGAL_DISCLAIMER,
    citations,
    conflicts,
    evidenceSummary,
    llmEnhanced: false,
  };

  if (!getLLM()) return base;

  const { data, usedLlm } = await invokeLLMJson<{
    executiveSummary?: string;
    risks?: string[];
    watchPoints?: string[];
    finalReport?: string;
    evidenceSummary?: string;
  }>({
    system: `你是投资秘书。只依据给定结构化事实与证据写备忘录，禁止编造未提供的新闻。只输出 JSON：
{"executiveSummary":"<50字>","risks":["..."],"watchPoints":["..."],"evidenceSummary":"<40字>","finalReport":"<400字内备忘录，需包含冲突点与引用 id>"}
禁止买卖点位或收益承诺。结尾保留免责声明。`,
    user: `股票：${stockName}（${stockCode}）
舆情叙事：${sentiment.narrative}
量化叙事：${quant.narrative}
冲突点：${JSON.stringify(conflicts)}
证据：${JSON.stringify(citations.map((c) => ({ id: c.id, title: c.title, score: c.score })))}
免责声明：${LEGAL_DISCLAIMER}`,
    retries: 0,
  });

  if (data?.executiveSummary) base.executiveSummary = data.executiveSummary;
  if (data?.risks?.length) base.risks = data.risks;
  if (data?.watchPoints?.length) base.watchPoints = data.watchPoints;
  if (data?.evidenceSummary) base.evidenceSummary = data.evidenceSummary;
  if (data?.finalReport) {
    base.finalReport = data.finalReport.includes('声明')
      ? data.finalReport
      : `${data.finalReport}\n\n${LEGAL_DISCLAIMER}`;
  }
  // 引用与冲突始终以规则/检索结果为准，避免模型改写丢溯源
  base.citations = citations;
  base.conflicts = conflicts;
  if (data) base.llmEnhanced = usedLlm;
  return base;
}
