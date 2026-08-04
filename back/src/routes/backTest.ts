import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import { query } from '../config/database';
import { getKLine } from '../services/marketService';
import {
  getStockSentimentHistory,
  generateBacktestSummary,
} from '../services/sentimentService';
import { runBacktest, describeStrategy, BacktestConfig } from '../services/backtestService';
import { createResearchReport } from '../services/reportService';
import { LEGAL_DISCLAIMER } from '../agents/types';

const router = Router();

router.post('/run', authMiddleware, async (req: AuthRequest, res: Response) => {
  const {
    stockCode,
    // 默认用相对便宜的 ETF，避免高价股 10 万买不起 1 手导致 0 成交
    sentimentThreshold = 0.2,
    useMa20 = false,
    initialCapital = 200000,
    exportReport = false,
  } = req.body;

  if (!stockCode) {
    res.status(400).json(error('请选择股票'));
    return;
  }

  const config: BacktestConfig = {
    stockCode,
    sentimentThreshold: Number(sentimentThreshold),
    useMa20: Boolean(useMa20),
    initialCapital: Number(initialCapital),
  };

  const { kline, source } = await getKLine(stockCode, 120);
  const { kline: benchK } = await getKLine('510300', 120);
  const sentiment = await getStockSentimentHistory(stockCode, 120);
  const result = runBacktest(kline, sentiment, config, benchK);
  const strategyDesc = describeStrategy(config);

  const aiSummary = await generateBacktestSummary({
    stockCode,
    totalReturn: result.totalReturn,
    maxDrawdown: result.maxDrawdown,
    winRate: result.winRate,
    tradeCount: result.tradeCount,
    strategy: strategyDesc,
    sharpeRatio: result.sharpeRatio,
    excessReturn: result.excessReturn,
  });

  try {
    await query(
      `INSERT INTO backtest_records (user_id, stock_code, strategy_config, result, ai_summary)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.userId,
        stockCode,
        JSON.stringify(config),
        JSON.stringify(result),
        aiSummary,
      ]
    );
  } catch {
    /* optional */
  }

  let reportId: number | undefined;
  if (exportReport) {
    try {
      const created = await createResearchReport({
        userId: req.userId!,
        reportType: 'backtest',
        stockCode,
        payload: {
          title: `${stockCode} 策略回测报告`,
          stockCode,
          summary: aiSummary,
          metrics: {
            总收益率: `${(result.totalReturn * 100).toFixed(2)}%`,
            基准收益: `${(result.benchmarkReturn * 100).toFixed(2)}%`,
            超额收益: `${(result.excessReturn * 100).toFixed(2)}%`,
            最大回撤: `${(result.maxDrawdown * 100).toFixed(2)}%`,
            夏普比率: result.sharpeRatio,
            胜率: `${(result.winRate * 100).toFixed(1)}%`,
            换手率: result.turnover,
            数据源: source,
          },
          sections: [
            { heading: '策略规则', body: strategyDesc },
            { heading: 'AI 点评', body: aiSummary },
          ],
          disclaimer: LEGAL_DISCLAIMER,
        },
      });
      reportId = created.id;
    } catch {
      /* ignore */
    }
  }

  res.json(
    success({
      ...result,
      strategy: strategyDesc,
      aiSummary,
      dataSource: source,
      reportId,
    })
  );
});

router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const records = await query(
      `SELECT id, stock_code, strategy_config, result, ai_summary, created_at
       FROM backtest_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [req.userId!]
    );
    res.json(success(records));
  } catch {
    res.json(success([]));
  }
});

export default router;
