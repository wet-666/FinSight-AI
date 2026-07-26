import cron from 'node-cron';
import { fetchFinanceNews, saveNewsToDb } from '../services/newsService.js';
import { batchAnalyzeNews } from '../services/sentimentService.js';
import { config } from '../config/index.js';

/** 定时舆情分析任务 */
export function startSentimentCron(): void {
  const schedule = config.newsCron;

  if (!cron.validate(schedule)) {
    console.warn('[Cron] Invalid schedule, using default: 0 */2 * * *');
  }

  cron.schedule(schedule, async () => {
    console.log('[Cron] Starting sentiment analysis job...');
    try {
      const news = await fetchFinanceNews();
      const saved = await saveNewsToDb(news);
      const analyzed = await batchAnalyzeNews(30);
      console.log(`[Cron] Done: fetched=${news.length}, saved=${saved}, analyzed=${analyzed}`);
    } catch (err) {
      console.error('[Cron] Sentiment job failed:', err);
    }
  });

  console.log(`[Cron] Sentiment analysis scheduled: ${schedule}`);
}
