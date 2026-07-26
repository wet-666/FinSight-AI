import { execute, query } from '../config/database';
import { getKLine, getStockQuote } from '../services/marketService';
import { getStockSentimentHistory } from '../services/sentimentService';
import { getLLM } from './llm';
import { runSentimentAgent } from './sentimentAgent';
import { runQuantAgent } from './quantAgent';
import { runSecretaryAgent } from './secretaryAgent';
import type { AgentStage, OrchestratorResult } from './types';

async function loadRecentNews(stockCode: string) {
  try {
    const rows = await query<
      { title: string; summary: string; sentiment_score: number }[]
    >(
      `SELECT n.title, ns.summary, ns.sentiment_score
       FROM news_sentiment ns
       JOIN news n ON n.id = ns.news_id
       WHERE ns.stock_code = ?
       ORDER BY ns.analyzed_at DESC
       LIMIT 8`,
      [stockCode]
    );
    return rows.map((r) => ({
      title: r.title,
      summary: r.summary,
      score: Number(r.sentiment_score),
    }));
  } catch {
    return [
      {
        title: `${stockCode} 行业政策与市场关注度升温`,
        summary: '演示资讯：情绪偏正面',
        score: 0.35,
      },
      {
        title: `${stockCode} 短期波动引发讨论`,
        summary: '演示资讯：情绪中性偏谨慎',
        score: -0.1,
      },
    ];
  }
}

function nowIso() {
  return new Date().toISOString();
}

/** 三 Agent 顺序编排：舆情 → 量化 → 秘书 */
export async function runResearchOrchestrator(params: {
  userId: number;
  stockCode: string;
  stockName?: string;
}): Promise<OrchestratorResult & { runId?: number }> {
  const { userId, stockCode } = params;
  const mode = getLLM() ? 'llm' : 'demo';

  const quote = await getStockQuote(stockCode);
  const stockName = params.stockName || quote?.name || stockCode;
  const { kline } = await getKLine(stockCode, 60);
  const sentimentHistory = await getStockSentimentHistory(stockCode, 60);
  const newsItems = await loadRecentNews(stockCode);

  const stages: AgentStage[] = [
    {
      role: 'sentiment_analyst',
      title: '舆情分析师',
      status: 'pending',
      summary: '',
      data: {},
    },
    {
      role: 'quant_researcher',
      title: '量化研究员',
      status: 'pending',
      summary: '',
      data: {},
    },
    {
      role: 'invest_secretary',
      title: '投资秘书',
      status: 'pending',
      summary: '',
      data: {},
    },
  ];

  let runId: number | undefined;
  try {
    const insert = await execute(
      `INSERT INTO agent_runs (user_id, stock_code, stock_name, status, stages, mode)
       VALUES (?, ?, ?, 'running', ?, ?)`,
      [userId, stockCode, stockName, JSON.stringify(stages), mode]
    );
    runId = insert.insertId || undefined;
  } catch {
    runId = undefined;
  }

  // Stage 1
  stages[0].status = 'running';
  stages[0].startedAt = nowIso();
  const sentiment = await runSentimentAgent({
    stockCode,
    stockName,
    sentimentHistory,
    newsItems,
  });
  stages[0].status = 'done';
  stages[0].finishedAt = nowIso();
  stages[0].summary = sentiment.narrative;
  stages[0].data = sentiment as unknown as Record<string, unknown>;

  // Stage 2
  stages[1].status = 'running';
  stages[1].startedAt = nowIso();
  const quant = await runQuantAgent({
    stockCode,
    stockName,
    quote: {
      price: quote?.price ?? kline[kline.length - 1]?.close ?? 0,
      changePercent: quote?.changePercent ?? 0,
    },
    kline,
    sentiment,
  });
  stages[1].status = 'done';
  stages[1].finishedAt = nowIso();
  stages[1].summary = quant.narrative;
  stages[1].data = quant as unknown as Record<string, unknown>;

  // Stage 3
  stages[2].status = 'running';
  stages[2].startedAt = nowIso();
  const secretary = await runSecretaryAgent({
    stockCode,
    stockName,
    sentiment,
    quant,
  });
  stages[2].status = 'done';
  stages[2].finishedAt = nowIso();
  stages[2].summary = secretary.executiveSummary;
  stages[2].data = secretary as unknown as Record<string, unknown>;

  const result: OrchestratorResult = {
    stockCode,
    stockName,
    mode,
    stages,
    finalReport: secretary.finalReport,
    structured: { sentiment, quant, secretary },
  };

  if (runId) {
    try {
      await query(
        `UPDATE agent_runs
         SET status = 'completed', stages = ?, final_report = ?, finished_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(stages), secretary.finalReport, runId]
      );
    } catch {
      /* ignore */
    }
  } else {
    try {
      await query(
        `INSERT INTO agent_runs
          (user_id, stock_code, stock_name, status, stages, final_report, mode, finished_at)
         VALUES (?, ?, ?, 'completed', ?, ?, ?, NOW())`,
        [
          userId,
          stockCode,
          stockName,
          JSON.stringify(stages),
          secretary.finalReport,
          mode,
        ]
      );
    } catch {
      /* ignore */
    }
  }

  return { ...result, runId };
}
