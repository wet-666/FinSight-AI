import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import { getStockQuote, getKLine } from '../services/marketService';
import { getStockSentimentHistory } from '../services/sentimentService';
import { runResearchOrchestrator } from '../agents/orchestrator';
import { createResearchReport } from '../services/reportService';
import { LEGAL_DISCLAIMER } from '../agents/types';

const router = Router();

router.get('/:code', authMiddleware, async (req, res: Response) => {
  const { code } = req.params;
  const quote = await getStockQuote(code);
  if (!quote) {
    res.status(404).json(error('未找到该股票', 404));
    return;
  }
  res.json(success(quote));
});

/** K线 + 情绪叠加（优先数据库/公开接口，不再以随机游走为主路径） */
router.get('/:code/chart', authMiddleware, async (req, res: Response) => {
  const { code } = req.params;
  const days = Number(req.query.days) || 60;
  const { kline, source } = await getKLine(code, days);
  const sentiment = await getStockSentimentHistory(code, days);
  res.json(success({ kline, sentiment, source }));
});

/** 三 Agent 编排分析 */
router.post('/:code/analyze', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { code } = req.params;
  const { stockName, exportReport } = req.body as {
    stockName?: string;
    exportReport?: boolean;
  };

  try {
    const result = await runResearchOrchestrator({
      userId: req.userId!,
      stockCode: code,
      stockName,
    });

    let reportId: number | undefined;
    if (exportReport) {
      const created = await createResearchReport({
        userId: req.userId!,
        reportType: 'stock_analysis',
        stockCode: code,
        payload: {
          title: `${result.stockName}（${code}）多智能体投研报告`,
          stockCode: code,
          summary: result.structured.secretary.executiveSummary,
          metrics: {
            舆情均分: result.structured.sentiment.avgScore,
            情绪标签: result.structured.sentiment.label,
            价格趋势: result.structured.quant.priceTrend,
            现价: result.structured.quant.lastClose,
          },
          sections: [
            { heading: '舆情分析师', body: result.structured.sentiment.narrative },
            { heading: '量化研究员', body: result.structured.quant.narrative },
            { heading: '完整备忘录', body: result.finalReport },
          ],
          disclaimer: LEGAL_DISCLAIMER,
        },
      });
      reportId = created.id;
    }

    res.json(
      success({
        report: result.finalReport,
        stages: result.stages,
        structured: result.structured,
        mode: result.mode,
        reportId,
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json(error('AI 分析失败'));
  }
});

export default router;
