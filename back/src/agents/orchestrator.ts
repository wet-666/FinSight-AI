import { execute, query } from '../config/database';
import { getKLine, getStockQuote } from '../services/marketService';
import { getStockSentimentHistory } from '../services/sentimentService';
import { getLLM } from './llm';
import { retrieveNewsContext } from './ragStore';
import { runSentimentAgent } from './sentimentAgent';
import { runQuantAgent } from './quantAgent';
import { runSecretaryAgent } from './secretaryAgent';
import { ensureAgentRunsSchema } from './ensureSchema';
import type { AgentStage, OrchestratorResult } from './types';

export type ProgressEvent =
  | { type: 'start'; mode: string; stockCode: string; stockName: string; retrievalMode?: string }
  | { type: 'stage'; stage: AgentStage; index: number }
  | { type: 'done'; result: OrchestratorResult & { runId?: number } }
  | { type: 'error'; message: string };

function nowIso() {
  return new Date().toISOString();
}

async function persistStages(runId: number | undefined, stages: AgentStage[], status: string) {
  if (!runId) return;
  try {
    await execute(`UPDATE agent_runs SET status = ?, stages = ? WHERE id = ?`, [
      status,
      JSON.stringify(stages),
      runId,
    ]);
  } catch (err) {
    console.error('[orchestrator] persistStages failed:', err);
  }
}

async function markRunFailed(runId: number | undefined, stages: AgentStage[]) {
  if (!runId) return;
  try {
    await execute(
      `UPDATE agent_runs SET status = 'failed', stages = ?, finished_at = NOW() WHERE id = ?`,
      [JSON.stringify(stages), runId]
    );
  } catch (err) {
    console.error('[orchestrator] markRunFailed:', err);
  }
}

/** 三 Agent 顺序编排：检索 → 舆情 → 量化 → 秘书，支持进度回调 */
export async function runResearchOrchestrator(params: {
  userId: number;
  stockCode: string;
  stockName?: string;
  onProgress?: (event: ProgressEvent) => void | Promise<void>;
}): Promise<OrchestratorResult & { runId?: number }> {
  const { userId, stockCode, onProgress } = params;
  const mode = getLLM() ? 'llm' : 'demo';

  await ensureAgentRunsSchema();

  const quote = await getStockQuote(stockCode);
  const stockName = params.stockName || quote?.name || stockCode;
  const { kline, source: klineSource } = await getKLine(stockCode, 60);
  const sentimentHistory = await getStockSentimentHistory(stockCode, 60);

  const retrieved = await retrieveNewsContext(
    stockCode,
    `${stockName} ${stockCode} 舆情 政策 业绩 风险 市场情绪`,
    5
  );

  await onProgress?.({
    type: 'start',
    mode,
    stockCode,
    stockName,
    retrievalMode: retrieved.mode,
  });

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
    runId = insert.insertId > 0 ? insert.insertId : undefined;
    if (!runId) {
      console.error('[orchestrator] INSERT agent_runs returned empty insertId');
    }
  } catch (err) {
    console.error('[orchestrator] INSERT agent_runs failed:', err);
    runId = undefined;
  }

  try {
    // Stage 1
    stages[0].status = 'running';
    stages[0].startedAt = nowIso();
    await onProgress?.({ type: 'stage', stage: { ...stages[0] }, index: 0 });
    await persistStages(runId, stages, 'running');

    const sentiment = await runSentimentAgent({
      stockCode,
      stockName,
      sentimentHistory,
      newsItems: retrieved.newsItems,
      citations: retrieved.citations,
      retrievalMode: retrieved.mode,
    });
    stages[0].status = 'done';
    stages[0].finishedAt = nowIso();
    stages[0].summary = sentiment.narrative;
    stages[0].data = {
      ...(sentiment as unknown as Record<string, unknown>),
      klineSource,
      citations: sentiment.citations,
      retrievalMode: sentiment.retrievalMode,
    };
    await onProgress?.({ type: 'stage', stage: { ...stages[0] }, index: 0 });

    // Stage 2
    stages[1].status = 'running';
    stages[1].startedAt = nowIso();
    await onProgress?.({ type: 'stage', stage: { ...stages[1] }, index: 1 });
    await persistStages(runId, stages, 'running');

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
    await onProgress?.({ type: 'stage', stage: { ...stages[1] }, index: 1 });

    // Stage 3
    stages[2].status = 'running';
    stages[2].startedAt = nowIso();
    await onProgress?.({ type: 'stage', stage: { ...stages[2] }, index: 2 });
    await persistStages(runId, stages, 'running');

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
    await onProgress?.({ type: 'stage', stage: { ...stages[2] }, index: 2 });

    const llmHits = [sentiment, quant, secretary].filter((x) => x.llmEnhanced).length;
    const resultMode: OrchestratorResult['mode'] =
      mode === 'llm' && llmHits === 0 ? 'llm_fallback' : mode;

    const result: OrchestratorResult = {
      stockCode,
      stockName,
      mode: resultMode,
      retrievalMode: retrieved.mode,
      stages,
      finalReport: secretary.finalReport,
      structured: { sentiment, quant, secretary },
    };

    if (runId) {
      try {
        const upd = await execute(
          `UPDATE agent_runs
           SET status = 'completed', mode = ?, stages = ?, final_report = ?, finished_at = NOW()
           WHERE id = ?`,
          [resultMode, JSON.stringify(stages), secretary.finalReport, runId]
        );
        if (!upd.affectedRows) {
          console.error('[orchestrator] complete UPDATE affected 0 rows, runId=', runId);
        }
      } catch (err) {
        console.error('[orchestrator] complete UPDATE failed:', err);
        try {
          await execute(
            `UPDATE agent_runs
             SET status = 'completed', final_report = ?, finished_at = NOW()
             WHERE id = ?`,
            [secretary.finalReport, runId]
          );
        } catch (err2) {
          console.error('[orchestrator] fallback complete UPDATE failed:', err2);
        }
      }
    }

    const full = { ...result, runId };
    await onProgress?.({ type: 'done', result: full });
    return full;
  } catch (err) {
    await markRunFailed(runId, stages);
    throw err;
  }
}
