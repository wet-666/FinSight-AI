import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import { runResearchOrchestrator } from '../agents/orchestrator';
import { query } from '../config/database';

const router = Router();

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
    const rows = await query(
      `SELECT id, stock_code, stock_name, status, mode, created_at, finished_at
       FROM agent_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [req.userId!]
    );
    res.json(success(rows));
  } catch {
    res.json(success([]));
  }
});

router.get('/runs/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await query(
      `SELECT * FROM agent_runs WHERE id = ? AND user_id = ?`,
      [Number(req.params.id), req.userId!]
    );
    const row = (rows as unknown[])[0];
    if (!row) {
      res.status(404).json(error('记录不存在', 404));
      return;
    }
    res.json(success(row));
  } catch {
    res.status(404).json(error('记录不存在', 404));
  }
});

export default router;
