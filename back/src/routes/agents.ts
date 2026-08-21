import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import { runResearchOrchestrator } from '../agents/orchestrator';
import { answerFollowup } from '../agents/followupAsk';
import { ensureAgentRunsSchema } from '../agents/ensureSchema';
import { execute, query } from '../config/database';
import { parseStages } from '../agents/parseStages';
import type { AgentStage } from '../agents/types';

const router = Router();

function normalizeStatus(status: unknown): string {
  return String(status || '').trim().toLowerCase();
}

/** 有报告但状态仍卡在 running 的旧数据，打开/追问前自动修复 */
async function healRunIfNeeded(row: {
  id: number;
  status: unknown;
  final_report?: string | null;
  stages?: unknown;
}): Promise<string> {
  let status = normalizeStatus(row.status);
  if (status === 'completed' || status === 'failed') return status;

  const stages = parseStages(row.stages);
  const allDone = stages.length > 0 && stages.every((s) => s.status === 'done');
  const hasReport = Boolean(row.final_report && String(row.final_report).trim());

  if (hasReport || allDone) {
    try {
      await execute(
        `UPDATE agent_runs SET status = 'completed', finished_at = COALESCE(finished_at, NOW()) WHERE id = ?`,
        [row.id]
      );
      status = 'completed';
      row.status = 'completed';
    } catch (err) {
      console.error('[agents] healRunIfNeeded failed:', err);
    }
  }
  return status;
}

/** 运行三 Agent 投研编排 */
router.post('/research', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { stockCode, stockName } = req.body as {
    stockCode?: string;
    stockName?: string;
  };
  if (!stockCode) {
    res.status(400).json(error('请提供 stockCode'));
    return;
  }
  try {
    const result = await runResearchOrchestrator({
      userId: req.userId!,
      stockCode,
      stockName,
    });
    res.json(success(result));
  } catch (err) {
    console.error(err);
    res.status(500).json(error('Agent 编排失败'));
  }
});

/** 历史编排记录 */
router.get('/runs', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await ensureAgentRunsSchema();
    // 先修复「有报告却仍 running」的历史脏数据
    await execute(
      `UPDATE agent_runs
       SET status = 'completed', finished_at = COALESCE(finished_at, NOW())
       WHERE user_id = ? AND status = 'running'
         AND final_report IS NOT NULL AND TRIM(final_report) <> ''`,
      [req.userId!]
    );

    const rows = await query(
      `SELECT id, stock_code, stock_name, status, mode, created_at, finished_at,
              CASE WHEN final_report IS NULL OR TRIM(final_report) = '' THEN 0 ELSE 1 END AS has_report
       FROM agent_runs
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 50`,
      [req.userId!]
    );
    const list = Array.isArray(rows) ? rows : [];
    res.json(success(list));
  } catch (err) {
    console.error('[agents] list runs failed:', err);
    res.json(success([]));
  }
});

router.get('/runs/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await ensureAgentRunsSchema();
    const rows = await query<Record<string, unknown>[]>(
      `SELECT * FROM agent_runs WHERE id = ? AND user_id = ?`,
      [Number(req.params.id), req.userId!]
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json(error('记录不存在', 404));
      return;
    }
    await healRunIfNeeded({
      id: Number(row.id),
      status: row.status,
      final_report: row.final_report as string | null,
      stages: row.stages,
    });
    res.json(success(row));
  } catch (err) {
    console.error('[agents] run detail failed:', err);
    res.status(404).json(error('记录不存在', 404));
  }
});

/**
 * 基于某次研究运行追问：再检索 + 当次 stages 上下文
 * POST /api/agents/runs/:id/ask  { question }
 */
router.post('/runs/:id/ask', authMiddleware, async (req: AuthRequest, res: Response) => {
  const question = String((req.body as { question?: string })?.question || '').trim();
  if (!question) {
    res.status(400).json(error('请提供 question'));
    return;
  }
  if (question.length > 500) {
    res.status(400).json(error('问题过长'));
    return;
  }

  try {
    await ensureAgentRunsSchema();
    const rows = await query<
      {
        id: number;
        stock_code: string;
        stock_name: string;
        stages: string | AgentStage[];
        final_report?: string;
        status: string;
      }[]
    >(`SELECT * FROM agent_runs WHERE id = ? AND user_id = ?`, [
      Number(req.params.id),
      req.userId!,
    ]);
    const row = rows[0];
    if (!row) {
      res.status(404).json(error('记录不存在', 404));
      return;
    }

    const status = await healRunIfNeeded(row);
    if (status !== 'completed' && !row.final_report) {
      res.status(400).json(error('该次分析尚未完成，暂不可追问'));
      return;
    }

    const result = await answerFollowup({
      stockCode: row.stock_code,
      stockName: row.stock_name || row.stock_code,
      question,
      stages: parseStages(row.stages),
      finalReport: row.final_report,
    });
    res.json(success(result));
  } catch (err) {
    console.error(err);
    res.status(500).json(error('追问失败'));
  }
});

export default router;
