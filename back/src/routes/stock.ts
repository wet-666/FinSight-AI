import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success, error } from '../middleware/auth';
import { getStockQuote, getKLine, STOCK_META } from '../services/marketService';
import { getHotStocks, searchStocks, findStockMeta } from '../services/stockCatalog';
import { getStockSentimentHistory } from '../services/sentimentService';
import { runResearchOrchestrator } from '../agents/orchestrator';
import { createResearchReport } from '../services/reportService';
import { LEGAL_DISCLAIMER } from '../agents/types';
import { formatSseEvent } from '../utils/sse';

const router = Router();

/** 热门/常见股票（本地目录，无外部请求） */
router.get('/meta/hot', authMiddleware, (_req, res: Response) => {
  res.json(success(getHotStocks()));
});

/** 本地股票检索（代码/名称），供输入自动对齐；不打外部搜索接口 */
router.get('/meta/search', authMiddleware, (req, res: Response) => {
  const q = String(req.query.q || '');
  const limit = Math.min(Number(req.query.limit) || 12, 30);
  res.json(success(searchStocks(q, limit)));
});

router.get('/:code', authMiddleware, async (req, res: Response) => {
  const { code } = req.params;
  const quote = await getStockQuote(code);
  if (!quote) {
    res.status(404).json(error('未找到该股票', 404));
    return;
  }
  const meta = findStockMeta(code) || STOCK_META[code];
  res.json(
    success({
      ...quote,
      name: quote.name || meta?.name || code,
      market: meta && 'market' in meta ? meta.market : undefined,
    })
  );
});

/** K线 + 情绪叠加 */
router.get('/:code/chart', authMiddleware, async (req, res: Response) => {
  const { code } = req.params;
  const days = Number(req.query.days) || 60;
  const { kline, source } = await getKLine(code, days);
  const sentiment = await getStockSentimentHistory(code, days);
  res.json(success({ kline, sentiment, source }));
});

/** 三 Agent 编排分析（同步，兼容旧前端） */
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
            模式: result.mode,
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
        runId: result.runId,
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json(error('AI 分析失败'));
  }
});

/**
 * SSE 流式编排：前端可实时看到每个 Agent 阶段
 * POST /api/stock/:code/analyze-stream
 */
router.post(
  '/:code/analyze-stream',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const { code } = req.params;
    const { stockName, exportReport } = req.body as {
      stockName?: string;
      exportReport?: boolean;
    };

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (payload: unknown) => {
      res.write(formatSseEvent(payload));
    };

    try {
      const result = await runResearchOrchestrator({
        userId: req.userId!,
        stockCode: code,
        stockName,
        onProgress: async (event) => {
          send(event);
        },
      });

      let reportId: number | undefined;
      if (exportReport) {
        try {
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
                模式: result.mode,
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
        } catch {
          /* optional */
        }
      }

      send({ type: 'report', reportId, mode: result.mode });
      send({ type: 'end' });
    } catch (err) {
      console.error(err);
      send({ type: 'error', message: 'AI 分析失败' });
    } finally {
      res.end();
    }
  }
);

export default router;
