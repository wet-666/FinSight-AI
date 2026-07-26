import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import { query } from '../config/database';
import { getStockQuote } from '../services/marketService';
import { getStockSentimentHistory, aiWritingAssist } from '../services/sentimentService';

const router = Router();

/** 获取笔记列表 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { stockCode } = req.query;
  let sql =
    'SELECT id, stock_code, title, updated_at FROM notes WHERE user_id = ?';
  const params: (string | number)[] = [req.userId!];

  if (stockCode) {
    sql += ' AND stock_code = ?';
    params.push(String(stockCode));
  }
  sql += ' ORDER BY updated_at DESC';

  try {
    const notes = await query(sql, params);
    res.json(success(notes));
  } catch {
    res.json(success([]));
  }
});

/** 获取单篇笔记 */
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const notes = await query(
    'SELECT * FROM notes WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId!]
  );
  if (!Array.isArray(notes) || notes.length === 0) {
    res.status(404).json(error('笔记不存在', 404));
    return;
  }
  res.json(success(notes[0]));
});

/** 创建笔记 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { stockCode, title, content } = req.body;
  if (!stockCode) {
    res.status(400).json(error('请指定股票'));
    return;
  }

  const result = await query(
    'INSERT INTO notes (user_id, stock_code, title, content) VALUES (?, ?, ?, ?)',
    [
      req.userId,
      stockCode,
      title || '未命名笔记',
      JSON.stringify(content || { type: 'doc', content: [] }),
    ]
  );
  const id = (result as unknown as { insertId: number }).insertId;
  res.json(success({ id }, '笔记已创建'));
});

/** 更新笔记 */
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { title, content } = req.body;
  await query(
    'UPDATE notes SET title = ?, content = ? WHERE id = ? AND user_id = ?',
    [
      title,
      JSON.stringify(content),
      req.params.id,
      req.userId,
    ]
  );
  res.json(success(null, '笔记已保存'));
});

/** 删除笔记 */
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  await query('DELETE FROM notes WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.userId!,
  ]);
  res.json(success(null, '笔记已删除'));
});

/** 动态变量数据（股价、情绪分数） */
router.get('/variables/:stockCode', authMiddleware, async (req, res: Response) => {
  const { stockCode } = req.params;
  const quote = await getStockQuote(stockCode);
  const sentiment = await getStockSentimentHistory(stockCode, 5);
  const avgScore =
    sentiment.length > 0
      ? sentiment.reduce((s, h) => s + h.score, 0) / sentiment.length
      : 0;

  res.json(
    success({
      price: quote?.price ?? '--',
      changePercent: quote?.changePercent ?? '--',
      sentiment: Math.round(avgScore * 100) / 100,
      stockName: quote?.name ?? stockCode,
      updatedAt: new Date().toISOString(),
    })
  );
});

/** AI 写作助手 */
router.post('/ai-assist', authMiddleware, async (req, res: Response) => {
  const { action, text, stockCode } = req.body;
  if (!action || !text) {
    res.status(400).json(error('参数不完整'));
    return;
  }

  const result = await aiWritingAssist(action, text, stockCode);
  res.json(success({ result }));
});

export default router;
