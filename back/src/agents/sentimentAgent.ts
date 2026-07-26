import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { scoreToLabel } from '../services/sentimentService';
import { getLLM, extractJson } from './llm';
import type { SentimentAgentOutput } from './types';

export async function runSentimentAgent(input: {
  stockCode: string;
  stockName: string;
  sentimentHistory: { date: string; score: number }[];
  newsItems: { title: string; summary?: string; score?: number }[];
}): Promise<SentimentAgentOutput> {
  const { stockCode, stockName, sentimentHistory, newsItems } = input;
  const avgScore =
    sentimentHistory.length > 0
      ? sentimentHistory.reduce((s, x) => s + x.score, 0) / sentimentHistory.length
      : 0;
  const label = scoreToLabel(avgScore);
  const highlights = newsItems.slice(0, 5).map((n) => ({
    title: n.title,
    score: n.score ?? 0,
    summary: n.summary || n.title.slice(0, 40),
  }));

  const base: SentimentAgentOutput = {
    avgScore: Math.round(avgScore * 100) / 100,
    label,
    newsCount: newsItems.length,
    highlights,
    narrative: `近${sentimentHistory.length || 30}日舆情均分 ${avgScore.toFixed(2)}，整体${label}；共梳理相关资讯 ${newsItems.length} 条。`,
  };

  const llm = getLLM();
  if (!llm) return base;

  const prompt = PromptTemplate.fromTemplate(`
你是「舆情分析师」Agent。请基于数据输出 JSON（不要其他文字）：
股票：{stockName}（{stockCode}）
平均情绪：{avgScore}
情绪标签：{label}
新闻摘要列表：{news}
格式：
{{
  "narrative": "<80-120字中文舆情研判>"
}}
`);

  try {
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const raw = await chain.invoke({
      stockName,
      stockCode,
      avgScore: base.avgScore,
      label,
      news: JSON.stringify(highlights),
    });
    const parsed = extractJson<{ narrative: string }>(raw);
    if (parsed?.narrative) base.narrative = parsed.narrative;
  } catch {
    /* keep demo narrative */
  }
  return base;
}
