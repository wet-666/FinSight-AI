import { getLLM, invokeLLMJson } from './llm';
import { retrieveNewsContext } from './ragStore';
import type { AgentStage, FollowupAskResult, QuantAgentOutput, SentimentAgentOutput } from './types';

function pickStageData<T>(stages: AgentStage[], role: string): T | null {
  const stage = stages.find((s) => s.role === role);
  if (!stage?.data) return null;
  return stage.data as unknown as T;
}

/** 基于某次 agent_run 的上下文 + 再检索，回答用户追问 */
export async function answerFollowup(params: {
  stockCode: string;
  stockName: string;
  question: string;
  stages: AgentStage[];
  finalReport?: string;
}): Promise<FollowupAskResult> {
  const { stockCode, stockName, question, stages, finalReport } = params;
  const retrieved = await retrieveNewsContext(
    stockCode,
    `${stockName} ${stockCode} ${question}`,
    4
  );
  const sentiment = pickStageData<SentimentAgentOutput>(stages, 'sentiment_analyst');
  const quant = pickStageData<QuantAgentOutput>(stages, 'quant_researcher');

  const contextBits = [
    sentiment ? `舆情：${sentiment.narrative || sentiment.label}` : '',
    quant
      ? `量化：趋势${quant.priceTrend}，${quant.priceVsMa20}，支撑${quant.keyLevels?.support}/压力${quant.keyLevels?.resistance}`
      : '',
    finalReport ? `报告摘要：${finalReport.slice(0, 400)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const templateAnswer = [
    `针对「${question}」，结合 ${stockName}（${stockCode}）当次研究结果：`,
    contextBits || '（当次结构化结果较少）',
    retrieved.citations.length
      ? `相关证据：${retrieved.citations.map((c) => c.title).join('；')}`
      : '暂无额外检索证据。',
    '以上仅供教育模拟，不构成投资建议。',
  ].join('\n');

  if (!getLLM()) {
    return {
      answer: templateAnswer,
      citations: retrieved.citations,
      retrievalMode: retrieved.mode,
      usedLlm: false,
    };
  }

  const { data, usedLlm } = await invokeLLMJson<{ answer: string; usedCitationIds?: string[] }>({
    system:
      '你是投研助手。只依据给定当次研究结果与证据回答，禁止编造。只输出 JSON：{"answer":"...","usedCitationIds":["id"]}。answer 120-220 字，点名引用证据 id 或标题；禁止买卖建议。',
    user: `股票：${stockName}（${stockCode}）
用户问题：${question}
当次上下文：
${contextBits}
证据：
${JSON.stringify(retrieved.citations)}`,
    retries: 0,
  });

  if (data?.answer && data.answer.length > 8) {
    let citations = retrieved.citations;
    if (data.usedCitationIds?.length) {
      const allowed = new Set(data.usedCitationIds);
      const filtered = retrieved.citations.filter((c) => allowed.has(c.id));
      if (filtered.length) citations = filtered;
    }
    return {
      answer: data.answer,
      citations,
      retrievalMode: retrieved.mode,
      usedLlm,
    };
  }

  return {
    answer: templateAnswer,
    citations: retrieved.citations,
    retrievalMode: retrieved.mode,
    usedLlm: false,
  };
}
