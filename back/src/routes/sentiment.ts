import { Router, Response } from 'express';
import { authMiddleware, success } from '../middleware/auth';
import { fetchFinanceNews, saveNewsToDb, getNewsFeed } from '../services/newsService';
import { batchAnalyzeNews } from '../services/sentimentService';

const router = Router();

/** 手动触发新闻抓取 + 情感分析 */
router.post('/analyze', authMiddleware, async (_req, res: Response) => {
  const { items, source } = await fetchFinanceNews();
  const saved = await saveNewsToDb(items);
  const analyzed = await batchAnalyzeNews(50);

  res.json(
    success(
      {
        fetched: items.length,
        saved,
        analyzed,
        source,
      },
      source === 'mock'
        ? '外部快讯不可用，已写入本地样例资讯并完成情感分析'
        : '舆情分析任务已完成'
    )
  );
});

/** 获取分析状态 */
router.get('/status', authMiddleware, async (_req, res: Response) => {
  const feed = await getNewsFeed(undefined, 5);
  res.json(
    success({
      recentNews: feed.items.length,
      source: feed.source,
      lastUpdate: new Date().toISOString(),
    })
  );
});

export default router;
