import { getLLM, invokeLLMJson } from './llm';
import { scoreToLabel } from '../services/sentimentService';
import type { Citation, RetrievalMode, SentimentAgentOutput } from './types';

// 运行舆情分析智能体（输入为 RAG 检索片段）
export async function runSentimentAgent(input: {
  stockCode: string;
  stockName: string;
  sentimentHistory: { date: string; score: number }[];
  newsItems: { id: string; title: string; summary?: string; score?: number }[];
  citations: Citation[];
  retrievalMode: RetrievalMode;
}): Promise<SentimentAgentOutput & { llmEnhanced: boolean }> {
  const { stockCode, stockName, sentimentHistory, newsItems, citations, retrievalMode } = input;
  const avgScore =
    sentimentHistory.length > 0
      ? sentimentHistory.reduce((s, x) => s + x.score, 0) / sentimentHistory.length
      : newsItems.length
        ? newsItems.reduce((s, n) => s + (n.score ?? 0), 0) / newsItems.length
        : 0;
  const label = scoreToLabel(avgScore);
  const highlights = newsItems.slice(0, 5).map((n) => ({
    id: n.id,
    title: n.title,
    score: n.score ?? 0,
    summary: n.summary || n.title.slice(0, 40),
  }));
  const usedCitationIds = citations.map((c) => c.id);

  const base: SentimentAgentOutput & { llmEnhanced: boolean } = {
    avgScore: Math.round(avgScore * 100) / 100,
    label,
    newsCount: newsItems.length,
    highlights,
    narrative: `近${sentimentHistory.length || 30}日舆情均分 ${avgScore.toFixed(2)}，整体${label}；检索模式 ${retrievalMode}，命中证据 ${citations.length} 条。`,
    citations,
    retrievalMode,
    usedCitationIds,
    llmEnhanced: false,
  };

  if (!getLLM()) return base;

  const { data, usedLlm } = await invokeLLMJson<{
    narrative: string;
    usedCitationIds?: string[];
  }>({
    system:
      '你是舆情分析师。只依据给定证据片段分析，禁止编造未提供的事实。只输出 JSON：{"narrative":"...","usedCitationIds":["id1"]}。narrative 80-120 字中文，必须点名引用了哪些证据标题或 id；禁止买卖建议。',
    user: `股票：${stockName}（${stockCode}）
平均情绪：${base.avgScore}
情绪标签：${label}
检索模式：${retrievalMode}
证据列表：${JSON.stringify(
      citations.map((c) => ({ id: c.id, title: c.title, snippet: c.snippet, score: c.score }))
    )}`,
    retries: 0,
  });

  if (data?.narrative && data.narrative.length > 10) {
    base.narrative = data.narrative;
    base.llmEnhanced = usedLlm;
    if (data.usedCitationIds?.length) {
      const allowed = new Set(citations.map((c) => c.id));
      base.usedCitationIds = data.usedCitationIds.filter((id) => allowed.has(id));
      if (!base.usedCitationIds.length) base.usedCitationIds = usedCitationIds;
    }
  }
  return base;
}
