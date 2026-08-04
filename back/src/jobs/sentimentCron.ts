import cron from 'node-cron';
import { fetchFinanceNews, saveNewsToDb } from '../services/newsService.js';
import { batchAnalyzeNews } from '../services/sentimentService.js';
import { config } from '../config/index.js';

const DEFAULT_SCHEDULE = '0 */2 * * *';

/** 执行一次：抓取 → 入库 → 情感分析 */
export async function runSentimentJob(label = 'Cron'): Promise<{
  source: string;
  fetched: number;
  saved: number;
  analyzed: number;
}> {
  console.log(`[${label}] Starting sentiment analysis job...`);
  const { items, source } = await fetchFinanceNews();
  const saved = await saveNewsToDb(items);
  const analyzed = await batchAnalyzeNews(30);
  console.log(
    `[${label}] Done: source=${source}, fetched=${items.length}, saved=${saved}, analyzed=${analyzed}`
  );
  return { source, fetched: items.length, saved, analyzed };
}

/** 定时舆情分析任务；启动时也会立刻跑一轮，避免登录后空窗 */
export function startSentimentCron(): void {
  const raw = config.newsCron;
  const schedule = cron.validate(raw) ? raw : DEFAULT_SCHEDULE;
  if (schedule !== raw) {
    console.warn(`[Cron] Invalid schedule "${raw}", using default: ${DEFAULT_SCHEDULE}`);
  }

  cron.schedule(schedule, async () => {
    try {
      await runSentimentJob('Cron');
    } catch (err) {
      console.error('[Cron] Sentiment job failed:', err);
    }
  });

  console.log(`[Cron] Sentiment analysis scheduled: ${schedule}`);

  // 启动后异步跑一轮，不阻塞 listen
  void runSentimentJob('Startup').catch((err) => {
    console.error('[Startup] Sentiment job failed:', err);
  });
}
