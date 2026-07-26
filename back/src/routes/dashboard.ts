import { Router, Response } from 'express';
import { authMiddleware, AuthRequest, success } from '../middleware/auth';
import { query } from '../config/database';
import {
  getMarketIndices,
  getBatchQuotes,
} from '../services/marketService';
import {
  getMarketSentiment,
  getStockSentimentHistory,
  scoreToLabel,
} from '../services/sentimentService';
import { getNewsFeed } from '../services/newsService';

const router = Router();

/** 市场概览 */
router.get('/overview', authMiddleware, async (_req, res: Response) => {
  const indices = await getMarketIndices();
  const sentiment = await getMarketSentiment(14);
  const latestScore =
    sentiment.length > 0 ? sentiment[sentiment.length - 1].score : 0;

  res.json(
    success({
      indices,
      marketSentiment: {
        score: latestScore,
        label: scoreToLabel(latestScore),
        history: sentiment,
      },
    })
  );
});

/** 自选股雷达 */
router.get('/watchlist-radar', authMiddleware, async (req: AuthRequest, res: Response) => {
  const watchlist = await query<
    { stock_code: string; stock_name: string; market: string }[]
  >('SELECT stock_code, stock_name, market FROM watchlist WHERE user_id = ?', [
    req.userId!,
  ]);

  const stocks = watchlist.map((w) => ({
    code: w.stock_code,
    name: w.stock_name,
    market: w.market,
  }));

  const quotes = await getBatchQuotes(stocks);

  const radar = await Promise.all(
    quotes.map(async (q) => {
      const history = await getStockSentimentHistory(q.code, 5);
      const avgScore =
        history.length > 0
          ? history.reduce((s, h) => s + h.score, 0) / history.length
          : 0;
      return {
        ...q,
        sentimentScore: Math.round(avgScore * 100) / 100,
        sentimentLabel: scoreToLabel(avgScore),
      };
    })
  );

  res.json(success(radar));
});

/** 情绪温度计 */
router.get('/sentiment-thermometer', authMiddleware, async (_req, res: Response) => {
  const history = await getMarketSentiment(30);
  const latest = history.length > 0 ? history[history.length - 1].score : 0;
  res.json(
    success({
      current: latest,
      label: scoreToLabel(latest),
      history,
    })
  );
});

/** AI 新闻流 */
router.get('/news-feed', authMiddleware, async (req: AuthRequest, res: Response) => {
  const watchlist = await query<{ stock_code: string }[]>(
    'SELECT stock_code FROM watchlist WHERE user_id = ?',
    [req.userId!]
  );
  const codes = watchlist.map((w) => w.stock_code);
  const news = await getNewsFeed(codes.length > 0 ? codes : undefined, 30);
  res.json(success(news));
});

export default router;
