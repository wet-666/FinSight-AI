import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { getLLM, extractJson } from './llm';
import {
  LEGAL_DISCLAIMER,
  type QuantAgentOutput,
  type SecretaryAgentOutput,
  type SentimentAgentOutput,
} from './types';

export async function runSecretaryAgent(input: {
  stockCode: string;
  stockName: string;
  sentiment: SentimentAgentOutput;
  quant: QuantAgentOutput;
}): Promise<SecretaryAgentOutput> {
  const { stockCode, stockName, sentiment, quant } = input;

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

  const finalReport = `【${stockName}（${stockCode}）多智能体投研备忘录】

一、执行摘要
${stockName}现价 ${quant.lastClose} 元（涨跌幅 ${quant.changePercent}%），近端趋势${quant.priceTrend}，${quant.priceVsMa20}。舆情均分 ${sentiment.avgScore}（${sentiment.label}）。

二、舆情分析师观点
${sentiment.narrative}

三、量化研究员观点
${quant.narrative}

四、风险与观察点
${risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}
观察：${watchPoints.join('；')}

五、结论
建议将本备忘录用于学习与模拟决策流程演练，并结合自身风险测评结果控制仓位。

${LEGAL_DISCLAIMER}`;

  const base: SecretaryAgentOutput = {
    executiveSummary: `${stockName}趋势${quant.priceTrend}，舆情${sentiment.label}，波动${quant.volatilityHint}。`,
    risks,
    watchPoints,
    finalReport,
    disclaimer: LEGAL_DISCLAIMER,
  };

  const llm = getLLM();
  if (!llm) return base;

  const prompt = PromptTemplate.fromTemplate(`
你是「投资秘书」Agent，负责整合前序 Agent 产出，生成结构化投研备忘录。
输出 JSON：
{{
  "executiveSummary": "<40字摘要>",
  "risks": ["风险1","风险2","风险3"],
  "watchPoints": ["观察点1","观察点2","观察点3"],
  "finalReport": "<300-500字完整备忘录，含章节，结尾必须保留免责声明>"
}}
股票：{stockName}（{stockCode}）
舆情叙事：{sentimentNarrative}
量化叙事：{quantNarrative}
免责声明：{disclaimer}
禁止给出具体买卖点位或收益承诺。
`);

  try {
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const raw = await chain.invoke({
      stockName,
      stockCode,
      sentimentNarrative: sentiment.narrative,
      quantNarrative: quant.narrative,
      disclaimer: LEGAL_DISCLAIMER,
    });
    const parsed = extractJson<Partial<SecretaryAgentOutput>>(raw);
    if (parsed?.executiveSummary) base.executiveSummary = parsed.executiveSummary;
    if (parsed?.risks?.length) base.risks = parsed.risks;
    if (parsed?.watchPoints?.length) base.watchPoints = parsed.watchPoints;
    if (parsed?.finalReport) {
      base.finalReport = parsed.finalReport.includes('声明')
        ? parsed.finalReport
        : `${parsed.finalReport}\n\n${LEGAL_DISCLAIMER}`;
    }
  } catch {
    /* keep demo */
  }
  return base;
}
