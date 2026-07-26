import { execute } from '../config/database'
import { config } from '../config/index'

export interface CleanupResult {
  newsDeleted: number;
  dailySentimentDeleted: number;
  marketSentimentDeleted: number;
}

// 清理过期新闻明细与聚合数据（非全量清空）
export async function cleanupExpiredData(): Promise<CleanupResult> {
  const { newsDays, sentimentAggregateDays } = config.retention
  const news = await execute(`
      DELETE FROM news
      WHERE COALESCE(published_at, created_at) < DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [newsDays]
  )

  const dailySentiment = await execute(
    `DELETE FROM daily_sentiment
     WHERE trade_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [sentimentAggregateDays]
  )

  const marketSentiment = await execute(
    `DELETE FROM market_sentiment
     WHERE trade_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [sentimentAggregateDays]
  )

  return {
    newsDeleted: news.affectedRows,
    dailySentimentDeleted: dailySentiment.affectedRows,
    marketSentimentDeleted: marketSentiment.affectedRows,
  }
}