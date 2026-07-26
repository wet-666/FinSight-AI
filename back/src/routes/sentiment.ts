import { Router, Response } from 'express';
import { authMiddleware, success } from '../middleware/auth';
import { fetchFinanceNews, saveNewsToDb, getNewsFeed } from '../services/newsService';
import { batchAnalyzeNews } from '../services/sentimentService';

const router = Router();

/** 手动触发新闻抓取 + 情感分析 */
router.post('/analyze', authMiddleware, async (_req, res: Response) => {
  const newsList = await fetchFinanceNews();
  const saved = await saveNewsToDb(newsList);
  const analyzed = await batchAnalyzeNews(50);

  res.json(
    success({
      fetched: newsList.length,
      saved,
      analyzed,
    }, '舆情分析任务已完成')
  );
});

/** 获取分析状态 */
router.get('/status', authMiddleware, async (_req, res: Response) => {
  const news = await getNewsFeed(undefined, 5);
  res.json(
    success({
      recentNews: news.length,
      lastUpdate: new Date().toISOString(),
    })
  );
});

export default router;
