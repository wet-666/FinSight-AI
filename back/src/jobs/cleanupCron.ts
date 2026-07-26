import cron from 'node-cron'
import { config } from '../config/index.js'
import { cleanupExpiredData } from '../services/cleanupService.js'

//定期清理过期数据任务
export function startCleanupCron(): void {
  const schedule = config.cleanupCron

  if(!cron.validate(schedule)){
    console.warn('[Cron] Invalid schedule, using default: 0 3 * * *');
  }
  
  cron.schedule(schedule, async () => {
    console.log('[Cron] Starting data cleanup job...');
    try {
      const result = await cleanupExpiredData();
      console.log(
        `[Cron] Cleanup done: news=${result.newsDeleted}, ` +
          `daily_sentiment=${result.dailySentimentDeleted}, ` +
          `market_sentiment=${result.marketSentimentDeleted}`
      );
    } catch (err) {
      console.error('[Cron] Cleanup job failed:', err);
    }
  });

  const { newsDays, sentimentAggregateDays } = config.retention;
  console.log(
    `[Cron] Data cleanup scheduled: ${schedule} ` +
      `(news=${newsDays}d, aggregate=${sentimentAggregateDays}d)`
  );
}
